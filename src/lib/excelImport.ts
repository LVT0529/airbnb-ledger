import * as XLSX from 'xlsx';
import { Platform } from '../types';
import { addDays } from '../utils';

export interface ExcelExpenseRow {
  date: string; // YYYY-MM-DD
  category: string;
  rawCategory: string;
  rawSubcategory: string;
  amount: number;
  description: string;
  notes: string;
}

export interface ExcelBookingRow {
  checkIn: string; // YYYY-MM-DD
  checkOut: string;
  guestName: string;
  country: string; // ISO code
  platform: Platform;
  guests: number;
  nights: number;
  revenue: number;
  rawDescription: string;
  rawMemo: string;
}

export interface ExcelImportPreview {
  totalRows: number;
  // 비용
  expenseCount: number;
  expenseTotal: number;
  expenses: ExcelExpenseRow[];
  unmappedCategories: string[];
  // 수입 (예약)
  bookingCount: number;
  bookingTotal: number;
  bookings: ExcelBookingRow[];
  bookingsByPlatform: Record<string, number>;
  // 무시된 수입 (부수입/사은품 등)
  ignoredIncomeCount: number;
  ignoredIncomeTotal: number;
  errors: string[];
}

// 비용 카테고리 매핑
const CATEGORY_RULES: Array<[string, string]> = [
  ['후기수수료', '플랫폼 수수료'],
  ['수수료', '플랫폼 수수료'],
  ['청소', '청소비'],
  ['세탁', '청소비'],
  ['관리비', '공과금'],
  ['공과금', '공과금'],
  ['전기', '공과금'],
  ['수도', '공과금'],
  ['도시가스', '공과금'],
  ['가스', '공과금'],
  ['보험', '보험료'],
  ['통신비', '통신비'],
  ['인터넷', '통신비'],
  ['핸드폰', '통신비'],
  ['세금', '세금'],
  ['건강보험', '세금'],
  ['국민연금', '세금'],
  ['월세', '월세'],
  ['임대료', '월세'],
  ['대출', '대출이자'],
  ['이자', '대출이자'],
  ['잡화소모', '소모품'],
  ['소모', '소모품'],
  ['비품', '소모품'],
  ['가구', '비품 구매'],
  ['가전', '비품 구매'],
  ['수리', '수리/유지보수'],
  ['유지보수', '수리/유지보수'],
  ['광고', '광고비'],
  ['교육', '기타'],
  ['식비', '기타'],
  ['간식', '기타'],
  ['음료', '기타'],
];

export function mapCategory(rawCategory: string, rawSubcategory: string): string {
  const haystack = `${rawCategory} ${rawSubcategory}`.trim();
  for (const [needle, mapped] of CATEGORY_RULES) {
    if (haystack.includes(needle)) return mapped;
  }
  return '기타';
}

// 플랫폼 매핑 (한글 + 영문)
const PLATFORM_MAP: Record<string, Platform> = {
  에어비엔비: 'airbnb',
  airbnb: 'airbnb',
  부킹닷컴: 'booking',
  부킹: 'booking',
  부킹컴: 'booking',
  'booking.com': 'booking',
  booking: 'booking',
  아고다: 'agoda',
  agoda: 'agoda',
  위홈: 'wehome',
  wehome: 'wehome',
  브루보: 'vrbo',
  vrbo: 'vrbo',
  미스터멘션: 'mrmention',
  멘션: 'mrmention',
  익스피디아: 'expedia',
  expedia: 'expedia',
};

function parsePlatform(sub: string): Platform | null {
  const key = sub.trim().toLowerCase().replace(/\s/g, '');
  if (!key) return null;
  return PLATFORM_MAP[key] ?? null;
}

// 한글 국가명 → ISO 2-letter
const COUNTRY_MAP: Record<string, string> = {
  한국: 'KR',
  대한민국: 'KR',
  미국: 'US',
  일본: 'JP',
  중국: 'CN',
  대만: 'TW',
  홍콩: 'HK',
  싱가포르: 'SG',
  말레이시아: 'MY',
  태국: 'TH',
  베트남: 'VN',
  인도네시아: 'ID',
  필리핀: 'PH',
  인도: 'IN',
  캐나다: 'CA',
  멕시코: 'MX',
  브라질: 'BR',
  아르헨티나: 'AR',
  영국: 'GB',
  아일랜드: 'IE',
  프랑스: 'FR',
  독일: 'DE',
  스페인: 'ES',
  이탈리아: 'IT',
  포르투갈: 'PT',
  네덜란드: 'NL',
  벨기에: 'BE',
  스위스: 'CH',
  오스트리아: 'AT',
  스웨덴: 'SE',
  노르웨이: 'NO',
  덴마크: 'DK',
  핀란드: 'FI',
  폴란드: 'PL',
  체코: 'CZ',
  그리스: 'GR',
  러시아: 'RU',
  튀르키예: 'TR',
  터키: 'TR',
  이스라엘: 'IL',
  아랍에미리트: 'AE',
  사우디아라비아: 'SA',
  이집트: 'EG',
  남아프리카: 'ZA',
  호주: 'AU',
  뉴질랜드: 'NZ',
};

function parseCountryAndName(content: string): {
  country: string;
  name: string;
} {
  // "중국 - Mango" 또는 "중국-Mango" 또는 "중국–Mango"
  const m = content.match(/^([^-–—]+?)\s*[-–—]\s*(.+)$/);
  if (m) {
    const koCountry = m[1].trim();
    const name = m[2].trim();
    return {
      country: COUNTRY_MAP[koCountry] ?? 'KR',
      name: name || koCountry,
    };
  }
  // "-" 없으면: 전체를 게스트 이름으로
  return { country: 'KR', name: content || '게스트' };
}

function parseNightsGuests(memo: string): {
  nights?: number;
  guests?: number;
} {
  const result: { nights?: number; guests?: number } = {};
  const nightsM = memo.match(/(\d+)\s*박/);
  const guestsM = memo.match(/(\d+)\s*인|(\d+)\s*명/);
  if (nightsM) result.nights = Number(nightsM[1]);
  if (guestsM) result.guests = Number(guestsM[1] ?? guestsM[2]);
  return result;
}

function excelSerialToYmd(serial: number): string {
  if (!serial || isNaN(serial)) return '';
  const utcMs = Math.floor(serial - 25569) * 86400 * 1000;
  const d = new Date(utcMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateValue(v: unknown): string {
  if (typeof v === 'number') return excelSerialToYmd(v);
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const day = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  if (typeof v === 'string') {
    const m = v.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  return '';
}

function asNumber(v: unknown): number {
  if (typeof v === 'number') return Math.round(v);
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^\d.-]/g, '');
    const n = Number(cleaned);
    return isNaN(n) ? 0 : Math.round(n);
  }
  return 0;
}

export async function parseExcelFile(file: File): Promise<ExcelImportPreview> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

  if (wb.SheetNames.length === 0) {
    return emptyPreview(['빈 파일']);
  }

  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: '',
  });

  const expenses: ExcelExpenseRow[] = [];
  const bookings: ExcelBookingRow[] = [];
  const unmappedSet = new Set<string>();
  const errors: string[] = [];
  let expenseCount = 0;
  let expenseTotal = 0;
  let bookingCount = 0;
  let bookingTotal = 0;
  let ignoredIncomeCount = 0;
  let ignoredIncomeTotal = 0;
  const bookingsByPlatform: Record<string, number> = {};

  for (const row of rows) {
    const type = String(row['수입/지출'] ?? row['type'] ?? '').trim();
    const amount = asNumber(row['금액'] ?? row['KRW'] ?? row['amount']);
    const date = parseDateValue(row['날짜'] ?? row['date']);

    if (type === '수입' || type === 'income') {
      // 수입 처리
      const cls = String(row['분류'] ?? '').trim();
      const sub = String(row['소분류'] ?? '').trim();
      const platform = parsePlatform(sub);
      const isBusinessIncome = cls.includes('사업수입') && platform;

      if (!isBusinessIncome || !date || amount <= 0) {
        ignoredIncomeCount++;
        ignoredIncomeTotal += amount;
        continue;
      }

      const description = String(row['내용'] ?? '').trim();
      const memo = String(row['메모'] ?? '').trim();
      const { country, name } = parseCountryAndName(description);
      const ng = parseNightsGuests(memo);
      const nights = Math.max(1, ng.nights ?? 1);
      const guests = Math.max(1, ng.guests ?? 1);
      const checkOut = addDays(date, nights);

      bookings.push({
        checkIn: date,
        checkOut,
        guestName: name,
        country,
        platform,
        guests,
        nights,
        revenue: amount,
        rawDescription: description,
        rawMemo: memo,
      });
      bookingCount++;
      bookingTotal += amount;
      bookingsByPlatform[platform] =
        (bookingsByPlatform[platform] ?? 0) + amount;
      continue;
    }

    if (type !== '지출' && type !== 'expense' && type !== '') continue;
    if (amount <= 0 || !date) continue;

    const rawCategory = String(row['분류'] ?? row['category'] ?? '').trim();
    const rawSubcategory = String(
      row['소분류'] ?? row['subcategory'] ?? '',
    ).trim();
    const description = String(
      row['내용'] ?? row['description'] ?? '',
    ).trim();
    const notes = String(row['메모'] ?? row['memo'] ?? '').trim();

    const mapped = mapCategory(rawCategory, rawSubcategory);
    if (mapped === '기타' && rawCategory + rawSubcategory) {
      unmappedSet.add(`${rawCategory} / ${rawSubcategory}`.trim());
    }

    expenseCount++;
    expenseTotal += amount;
    expenses.push({
      date,
      category: mapped,
      rawCategory,
      rawSubcategory,
      amount,
      description,
      notes,
    });
  }

  expenses.sort((a, b) => a.date.localeCompare(b.date));
  bookings.sort((a, b) => a.checkIn.localeCompare(b.checkIn));

  return {
    totalRows: rows.length,
    expenseCount,
    expenseTotal,
    expenses,
    unmappedCategories: Array.from(unmappedSet),
    bookingCount,
    bookingTotal,
    bookings,
    bookingsByPlatform,
    ignoredIncomeCount,
    ignoredIncomeTotal,
    errors,
  };
}

function emptyPreview(errors: string[]): ExcelImportPreview {
  return {
    totalRows: 0,
    expenseCount: 0,
    expenseTotal: 0,
    expenses: [],
    unmappedCategories: [],
    bookingCount: 0,
    bookingTotal: 0,
    bookings: [],
    bookingsByPlatform: {},
    ignoredIncomeCount: 0,
    ignoredIncomeTotal: 0,
    errors,
  };
}

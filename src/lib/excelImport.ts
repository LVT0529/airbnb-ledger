import * as XLSX from 'xlsx';

export interface ExcelExpenseRow {
  date: string; // YYYY-MM-DD
  category: string;
  rawCategory: string;
  rawSubcategory: string;
  amount: number;
  description: string;
  notes: string;
}

export interface ExcelImportPreview {
  totalRows: number;
  incomeCount: number;
  expenseCount: number;
  expenseTotal: number;
  expenses: ExcelExpenseRow[];
  unmappedCategories: string[];
  errors: string[];
}

// '편한가계부' 류 분류/소분류 → 우리 앱 카테고리 매핑
const CATEGORY_RULES: Array<[RegExp | string, string]> = [
  // 키워드 우선순위 순으로 매칭 (위에서 아래로)
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

export function mapCategory(
  rawCategory: string,
  rawSubcategory: string,
): string {
  const haystack = `${rawCategory} ${rawSubcategory}`.trim();
  for (const [needle, mapped] of CATEGORY_RULES) {
    if (typeof needle === 'string') {
      if (haystack.includes(needle)) return mapped;
    } else {
      if (needle.test(haystack)) return mapped;
    }
  }
  return '기타';
}

function excelSerialToYmd(serial: number): string {
  if (!serial || isNaN(serial)) return '';
  // Excel epoch 1899-12-30 (1900 leap bug 보정 포함)
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
    // 'YYYY-MM-DD' or 'YYYY/MM/DD' or 'YYYY.MM.DD'
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

export async function parseExcelFile(
  file: File,
): Promise<ExcelImportPreview> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

  if (wb.SheetNames.length === 0) {
    return {
      totalRows: 0,
      incomeCount: 0,
      expenseCount: 0,
      expenseTotal: 0,
      expenses: [],
      unmappedCategories: [],
      errors: ['빈 파일'],
    };
  }

  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: '',
  });

  const expenses: ExcelExpenseRow[] = [];
  const unmappedSet = new Set<string>();
  const errors: string[] = [];
  let incomeCount = 0;
  let expenseCount = 0;
  let expenseTotal = 0;

  for (const row of rows) {
    const type = String(row['수입/지출'] ?? row['type'] ?? '').trim();
    if (type === '수입' || type === 'income') {
      incomeCount++;
      continue;
    }
    if (type !== '지출' && type !== 'expense' && type !== '') continue;

    const amount = asNumber(row['금액'] ?? row['KRW'] ?? row['amount']);
    if (amount <= 0) continue;

    const date = parseDateValue(row['날짜'] ?? row['date']);
    if (!date) {
      errors.push(`날짜 파싱 실패: ${JSON.stringify(row)}`);
      continue;
    }

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

  return {
    totalRows: rows.length,
    incomeCount,
    expenseCount,
    expenseTotal,
    expenses,
    unmappedCategories: Array.from(unmappedSet),
    errors,
  };
}

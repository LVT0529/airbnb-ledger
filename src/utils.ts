export function formatKRW(amount: number): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function flagEmoji(iso2: string): string {
  if (!iso2 || iso2.length !== 2) return '🌍';
  const codePoints = iso2
    .toUpperCase()
    .split('')
    .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65);
  if (codePoints.some((cp) => cp < 0x1f1e6 || cp > 0x1f1ff)) return '🌍';
  return String.fromCodePoint(...codePoints);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return ymd(d);
}

export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function monthRange(year: number, month: number): {
  start: string;
  end: string;
  days: number;
} {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { start: ymd(start), end: ymd(end), days: end.getDate() };
}

export function todayYmd(): string {
  return ymd(new Date());
}

/**
 * checkIn ~ checkOut(exclusive) 사이의 박 중 year/month에 속하는 박 수.
 * 예: checkIn=2026-04-30, checkOut=2026-05-03 → year=2026, month=4 → 1 (4/30)
 *                                              → year=2026, month=5 → 2 (5/1, 5/2)
 *
 * 타임존 이슈를 피하기 위해 YYYY-MM-DD 문자열 비교만 사용.
 */
export function nightsInMonth(
  checkIn: string,
  checkOut: string,
  year: number,
  month: number,
): number {
  if (!checkIn || !checkOut) return 0;
  const mm = String(month).padStart(2, '0');
  const monthStartStr = `${year}-${mm}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEndStr = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;

  let count = 0;
  let cur = checkIn;
  let safety = 0;
  while (cur < checkOut && safety < 400) {
    if (cur >= monthStartStr && cur <= monthEndStr) count++;
    // +1 day (로컬 Date 사용. UTC 파싱 안 함.)
    const [y, m, d] = cur.split('-').map(Number);
    const next = new Date(y, m - 1, d + 1);
    cur = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    safety++;
  }
  return count;
}

/**
 * 한 예약을 그 달의 일별 비율로 분배. 박/매출이 그 달 점유분만큼만 잡힘.
 */
export function prorateBookingForMonth<
  B extends { checkIn: string; checkOut: string; nights: number; revenue: number },
>(
  booking: B,
  year: number,
  month: number,
): B & { proratedNights: number; proratedRevenue: number } {
  const inMonth = nightsInMonth(
    booking.checkIn,
    booking.checkOut,
    year,
    month,
  );
  const totalNights = Math.max(1, booking.nights);
  const ratio = inMonth / totalNights;
  return {
    ...booking,
    proratedNights: inMonth,
    proratedRevenue: Math.round(booking.revenue * ratio),
  };
}

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function buildCSV(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) =>
    row.map(csvCell).join(','),
  );
  return '\uFEFF' + lines.join('\n');
}

export function formatAmountInput(value: string): string {
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('ko-KR');
}

export function parseAmount(value: string): number {
  const digits = value.replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

const PREFS_KEY = 'airbnb-ledger-prefs';

interface Prefs {
  lastPropertyId?: string;
  lastPlatform?: string;
  lastCountry?: string;
  lastCategory?: string;
  lastExpensePropertyId?: string | null;
  recentCategories?: string[]; // 최근 사용 순서, 최대 6개
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function savePrefs(patch: Partial<Prefs>): void {
  const current = loadPrefs();
  localStorage.setItem(PREFS_KEY, JSON.stringify({ ...current, ...patch }));
}

export function trackRecentCategory(category: string): void {
  if (!category.trim()) return;
  const prefs = loadPrefs();
  const list = (prefs.recentCategories ?? []).filter((c) => c !== category);
  list.unshift(category);
  savePrefs({ recentCategories: list.slice(0, 6) });
}

export function getRecentCategories(limit = 3): string[] {
  return (loadPrefs().recentCategories ?? []).slice(0, limit);
}

export function parseCSV(text: string): Record<string, string>[] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const lines: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuote = !inQuote;
      cur += ch;
    } else if ((ch === '\n' || ch === '\r') && !inQuote) {
      if (cur) lines.push(cur);
      cur = '';
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      cur += ch;
    }
  }
  if (cur) lines.push(cur);

  if (lines.length === 0) return [];

  const parseRow = (line: string): string[] => {
    const cells: string[] = [];
    let cell = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          q = !q;
        }
      } else if (ch === ',' && !q) {
        cells.push(cell);
        cell = '';
      } else {
        cell += ch;
      }
    }
    cells.push(cell);
    return cells.map((c) => c.trim());
  };

  const headers = parseRow(lines[0]);
  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const row = parseRow(line);
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] ?? '';
      });
      return obj;
    });
}

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

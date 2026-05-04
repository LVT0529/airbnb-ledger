import { db } from './db';
import { supabase } from './supabase';
import {
  Booking,
  BookingStatus,
  Expense,
  Platform,
  Property,
  RecurringExpense,
} from './types';
import { diffDays, parseICS } from './icalParser';

type Row = Record<string, unknown>;

function rowToProperty(r: Row): Property {
  return {
    id: r.id as string,
    name: r.name as string,
    color: r.color as string,
    icalUrl: (r.ical_url as string | null) ?? undefined,
    createdAt: new Date(r.created_at as string).getTime(),
  };
}

function rowToBooking(r: Row): Booking {
  return {
    id: r.id as string,
    propertyId: r.property_id as string,
    guestName: r.guest_name as string,
    country: r.country as string,
    platform: r.platform as Platform,
    guests: r.guests as number,
    nights: r.nights as number,
    checkIn: r.check_in as string,
    checkOut: r.check_out as string,
    revenue: Number(r.revenue),
    notes: (r.notes as string | null) ?? undefined,
    confirmationCode: (r.confirmation_code as string | null) ?? undefined,
    status: ((r.status as string) ?? 'confirmed') as BookingStatus,
    createdAt: new Date(r.created_at as string).getTime(),
  };
}

function rowToExpense(r: Row): Expense {
  return {
    id: r.id as string,
    propertyId: (r.property_id as string | null) ?? null,
    category: r.category as Expense['category'],
    amount: Number(r.amount),
    date: r.date as string,
    notes: (r.notes as string | null) ?? undefined,
    sourceRecurringId: (r.source_recurring_id as string | null) ?? undefined,
    sourceYearMonth: (r.source_year_month as string | null) ?? undefined,
    createdAt: new Date(r.created_at as string).getTime(),
  };
}

function rowToRecurring(r: Row): RecurringExpense {
  return {
    id: r.id as string,
    propertyId: (r.property_id as string | null) ?? null,
    category: r.category as string,
    amount: Number(r.amount),
    dayOfMonth: Number(r.day_of_month),
    notes: (r.notes as string | null) ?? undefined,
    active: Boolean(r.active),
    startMonth: (r.start_month as string | null) ?? undefined,
    createdAt: new Date(r.created_at as string).getTime(),
  };
}

async function getUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Not authenticated');
  return data.user.id;
}

export async function syncAll(): Promise<void> {
  const [propsRes, bksRes, expsRes, recRes] = await Promise.all([
    supabase.from('properties').select('*'),
    supabase.from('bookings').select('*'),
    supabase.from('expenses').select('*'),
    supabase.from('recurring_expenses').select('*'),
  ]);
  if (propsRes.error) throw propsRes.error;
  if (bksRes.error) throw bksRes.error;
  if (expsRes.error) throw expsRes.error;
  // recurring 테이블이 없는 환경(마이그레이션 미실행)에서도 무중단 — 에러는 무시
  const recOk = !recRes.error;

  const props = (propsRes.data ?? []).map(rowToProperty);
  const bks = (bksRes.data ?? []).map(rowToBooking);
  const exps = (expsRes.data ?? []).map(rowToExpense);
  const recs = recOk ? (recRes.data ?? []).map(rowToRecurring) : [];

  await db.transaction(
    'rw',
    db.properties,
    db.bookings,
    db.expenses,
    db.recurring_expenses,
    async () => {
      await db.properties.clear();
      await db.bookings.clear();
      await db.expenses.clear();
      await db.recurring_expenses.clear();
      if (props.length) await db.properties.bulkAdd(props);
      if (bks.length) await db.bookings.bulkAdd(bks);
      if (exps.length) await db.expenses.bulkAdd(exps);
      if (recs.length) await db.recurring_expenses.bulkAdd(recs);
    },
  );
}

export function subscribeRealtime(onChange: () => void) {
  const channel = supabase
    .channel('ledger-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'properties' },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'bookings' },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'expenses' },
      onChange,
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export async function addProperty(
  input: Omit<Property, 'id' | 'createdAt'>,
): Promise<Property> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('properties')
    .insert({
      user_id: userId,
      name: input.name,
      color: input.color,
      ical_url: input.icalUrl ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  const prop = rowToProperty(data);
  await db.properties.put(prop);
  return prop;
}

export async function updateProperty(
  id: string,
  input: Partial<Pick<Property, 'name' | 'color' | 'icalUrl'>>,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.color !== undefined) patch.color = input.color;
  if (input.icalUrl !== undefined) patch.ical_url = input.icalUrl || null;
  const { data, error } = await supabase
    .from('properties')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  await db.properties.put(rowToProperty(data));
}

export async function deleteProperty(id: string): Promise<void> {
  const { error } = await supabase.from('properties').delete().eq('id', id);
  if (error) throw error;
  await db.transaction(
    'rw',
    db.properties,
    db.bookings,
    db.expenses,
    async () => {
      await db.bookings.where('propertyId').equals(id).delete();
      await db.expenses.where('propertyId').equals(id).delete();
      await db.properties.delete(id);
    },
  );
}

export async function addBooking(
  input: Omit<Booking, 'id' | 'createdAt'>,
): Promise<Booking> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      user_id: userId,
      property_id: input.propertyId,
      guest_name: input.guestName,
      country: input.country,
      platform: input.platform,
      guests: input.guests,
      nights: input.nights,
      check_in: input.checkIn,
      check_out: input.checkOut,
      revenue: input.revenue,
      notes: input.notes ?? null,
      confirmation_code: input.confirmationCode ?? null,
      status: input.status,
    })
    .select()
    .single();
  if (error) throw error;
  const booking = rowToBooking(data);
  await db.bookings.put(booking);
  return booking;
}

export async function updateBooking(
  id: string,
  input: Omit<Booking, 'id' | 'createdAt'>,
): Promise<void> {
  const { data, error } = await supabase
    .from('bookings')
    .update({
      property_id: input.propertyId,
      guest_name: input.guestName,
      country: input.country,
      platform: input.platform,
      guests: input.guests,
      nights: input.nights,
      check_in: input.checkIn,
      check_out: input.checkOut,
      revenue: input.revenue,
      notes: input.notes ?? null,
      confirmation_code: input.confirmationCode ?? null,
      status: input.status,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  await db.bookings.put(rowToBooking(data));
}

export async function deleteBooking(id: string): Promise<void> {
  const { error } = await supabase.from('bookings').delete().eq('id', id);
  if (error) throw error;
  await db.bookings.delete(id);
}

export async function addExpense(
  input: Omit<Expense, 'id' | 'createdAt'>,
): Promise<Expense> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      user_id: userId,
      property_id: input.propertyId,
      category: input.category,
      amount: input.amount,
      date: input.date,
      notes: input.notes ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  const expense = rowToExpense(data);
  await db.expenses.put(expense);
  return expense;
}

export async function updateExpense(
  id: string,
  input: Omit<Expense, 'id' | 'createdAt'>,
): Promise<void> {
  const { data, error } = await supabase
    .from('expenses')
    .update({
      property_id: input.propertyId,
      category: input.category,
      amount: input.amount,
      date: input.date,
      notes: input.notes ?? null,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  await db.expenses.put(rowToExpense(data));
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
  await db.expenses.delete(id);
}

export async function clearAll(): Promise<void> {
  const [props, bks, exps] = await Promise.all([
    supabase
      .from('properties')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase
      .from('bookings')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase
      .from('expenses')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'),
  ]);
  if (props.error) throw props.error;
  if (bks.error) throw bks.error;
  if (exps.error) throw exps.error;
  await db.transaction(
    'rw',
    db.properties,
    db.bookings,
    db.expenses,
    async () => {
      await db.properties.clear();
      await db.bookings.clear();
      await db.expenses.clear();
    },
  );
}

// =================================================================
// iCal sync
// =================================================================

export interface IcalSyncResult {
  added: number;
  skipped: number;
  errors: string[];
}

function platformFromUrl(url: string): Platform {
  try {
    const u = new URL(url);
    const h = u.host.toLowerCase();
    if (h.includes('airbnb')) return 'airbnb';
    if (h.includes('booking.com')) return 'booking';
    if (h.includes('agoda')) return 'agoda';
    if (h.includes('vrbo')) return 'vrbo';
    if (h.includes('wehome')) return 'wehome';
    if (h.includes('mrmention')) return 'mrmention';
    if (h.includes('expedia')) return 'expedia';
  } catch {
    /* ignore */
  }
  return 'other';
}

function parseIcalUrls(input: string | undefined | null): string[] {
  if (!input) return [];
  return input
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && /^https?:\/\//.test(s));
}

async function syncIcalForUrl(
  property: Property,
  url: string,
  result: IcalSyncResult,
): Promise<void> {
  const platform = platformFromUrl(url);

  const { data, error } = await supabase.functions.invoke('ical-fetch', {
    body: { url },
  });
  if (error) {
    result.errors.push(`${platform}: ${error.message}`);
    return;
  }
  const ics = (data as { ics?: string })?.ics;
  if (!ics) {
    result.errors.push(`${platform}: 빈 응답`);
    return;
  }

  const allEvents = parseICS(ics);
  const reservationEvents = allEvents.filter((ev) => ev.isReservation);
  const blockedEvents = allEvents.filter((ev) => !ev.isReservation);

  const userId = await getUserId();

  // 기존 confirmation_code 가져오기
  const existingRes = await supabase
    .from('bookings')
    .select('confirmation_code')
    .eq('property_id', property.id)
    .not('confirmation_code', 'is', null);
  const existingCodes = new Set(
    (existingRes.data ?? [])
      .map((r) => r.confirmation_code as string | null)
      .filter((c): c is string => !!c),
  );

  // 1. Reservations: confirmation code 추출 실패 시 UID로 fallback
  const toInsert: Record<string, unknown>[] = [];
  for (const ev of reservationEvents) {
    const code = ev.confirmationCode ?? (ev.uid ? `${platform.toUpperCase()}-${ev.uid.slice(0, 24)}` : undefined);
    if (!code) {
      result.skipped++;
      continue;
    }
    if (existingCodes.has(code)) {
      result.skipped++;
      continue;
    }
    toInsert.push({
      user_id: userId,
      property_id: property.id,
      guest_name: ev.confirmationCode ?? code,
      country: 'KR',
      platform,
      guests: 1,
      nights: diffDays(ev.start, ev.end),
      check_in: ev.start,
      check_out: ev.end,
      revenue: 0,
      confirmation_code: code,
      status: 'pending',
    });
  }
  if (toInsert.length) {
    const ins = await supabase.from('bookings').insert(toInsert);
    if (ins.error) {
      result.errors.push(`${platform} ins: ${ins.error.message}`);
    } else {
      result.added += toInsert.length;
    }
  }

  // 2. Blocked periods (해당 플랫폼 것만 삭제 후 재추가)
  await supabase
    .from('bookings')
    .delete()
    .eq('property_id', property.id)
    .eq('platform', platform)
    .eq('status', 'blocked');

  const blockedToInsert: Record<string, unknown>[] = [];
  for (const ev of blockedEvents) {
    const uid = ev.uid ? ev.uid.slice(0, 24) : `${ev.start}-${ev.end}`;
    blockedToInsert.push({
      user_id: userId,
      property_id: property.id,
      guest_name: '차단',
      country: 'KR',
      platform,
      guests: 0,
      nights: diffDays(ev.start, ev.end),
      check_in: ev.start,
      check_out: ev.end,
      revenue: 0,
      confirmation_code: `BLOCK-${platform.toUpperCase()}-${uid}`,
      status: 'blocked',
    });
  }
  if (blockedToInsert.length) {
    const ins = await supabase.from('bookings').insert(blockedToInsert);
    if (ins.error)
      result.errors.push(`${platform} block: ${ins.error.message}`);
  }
}

export async function syncIcalForProperty(
  property: Property,
): Promise<IcalSyncResult> {
  const result: IcalSyncResult = { added: 0, skipped: 0, errors: [] };
  const urls = parseIcalUrls(property.icalUrl);
  if (urls.length === 0) return result;

  for (const url of urls) {
    try {
      await syncIcalForUrl(property, url, result);
    } catch (e) {
      result.errors.push(
        e instanceof Error ? e.message : 'unknown',
      );
    }
  }

  await syncAll();
  return result;
}

export async function syncAllIcals(
  properties: Property[],
): Promise<IcalSyncResult> {
  const total: IcalSyncResult = { added: 0, skipped: 0, errors: [] };
  for (const p of properties) {
    if (!p.icalUrl) continue;
    const r = await syncIcalForProperty(p);
    total.added += r.added;
    total.skipped += r.skipped;
    total.errors.push(...r.errors);
  }
  return total;
}

// =================================================================
// Recurring expenses
// =================================================================

export async function addRecurringExpense(
  input: Omit<RecurringExpense, 'id' | 'createdAt'>,
): Promise<RecurringExpense> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('recurring_expenses')
    .insert({
      user_id: userId,
      property_id: input.propertyId,
      category: input.category,
      amount: input.amount,
      day_of_month: input.dayOfMonth,
      notes: input.notes ?? null,
      active: input.active,
      start_month: input.startMonth ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  const rec = rowToRecurring(data);
  await db.recurring_expenses.put(rec);
  return rec;
}

export async function updateRecurringExpense(
  id: string,
  input: Partial<Omit<RecurringExpense, 'id' | 'createdAt'>>,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.propertyId !== undefined) patch.property_id = input.propertyId;
  if (input.category !== undefined) patch.category = input.category;
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.dayOfMonth !== undefined) patch.day_of_month = input.dayOfMonth;
  if (input.notes !== undefined) patch.notes = input.notes ?? null;
  if (input.active !== undefined) patch.active = input.active;
  if (input.startMonth !== undefined)
    patch.start_month = input.startMonth ?? null;

  const { data, error } = await supabase
    .from('recurring_expenses')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  await db.recurring_expenses.put(rowToRecurring(data));
}

export async function deleteRecurringExpense(id: string): Promise<void> {
  const { error } = await supabase
    .from('recurring_expenses')
    .delete()
    .eq('id', id);
  if (error) throw error;
  await db.recurring_expenses.delete(id);
}

interface RecurringSyncResult {
  added: number;
  skipped: number;
  errors: string[];
}

function daysInMonthLocal(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function todayLocalYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 모든 active 정기결제에 대해 누락된 월의 expenses 자동 추가.
 * - 결제 예정일(day_of_month)이 오늘 이전인 월만 처리
 * - source_recurring_id + source_year_month unique index가 중복 방지
 * - 첫 적용 월(start_month)부터 현재 월까지 쭉 처리
 */
export async function applyRecurringExpenses(
  force = false,
): Promise<RecurringSyncResult> {
  const result: RecurringSyncResult = { added: 0, skipped: 0, errors: [] };
  const userId = await getUserId();

  const { data: recs, error } = await supabase
    .from('recurring_expenses')
    .select('*')
    .eq('active', true);
  if (error) {
    result.errors.push(error.message);
    return result;
  }
  if (!recs || recs.length === 0) return result;

  const today = todayLocalYmd();
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;

  for (const r of recs) {
    try {
      // start month 결정
      let cy: number;
      let cm: number;
      if (r.start_month) {
        const [sy, sm] = String(r.start_month).split('-').map(Number);
        cy = sy;
        cm = sm;
      } else {
        const created = new Date(r.created_at);
        cy = created.getFullYear();
        cm = created.getMonth() + 1;
      }

      while (cy < thisYear || (cy === thisYear && cm <= thisMonth)) {
        const ym = `${cy}-${String(cm).padStart(2, '0')}`;
        const dayMax = daysInMonthLocal(cy, cm);
        const day = Math.min(Number(r.day_of_month), dayMax);
        const dueDate = `${ym}-${String(day).padStart(2, '0')}`;

        // force=true면 미래 결제일도 강제 추가 (이번 달까지)
        if (force || dueDate <= today) {
          const ins = await supabase.from('expenses').insert({
            user_id: userId,
            property_id: r.property_id,
            category: r.category,
            amount: r.amount,
            date: dueDate,
            notes: r.notes ?? null,
            source_recurring_id: r.id,
            source_year_month: ym,
          });
          if (ins.error) {
            if (
              ins.error.code === '23505' ||
              /duplicate/i.test(ins.error.message)
            ) {
              result.skipped++;
            } else {
              result.errors.push(`${r.category} ${ym}: ${ins.error.message}`);
            }
          } else {
            result.added++;
          }
        }

        if (cm === 12) {
          cy++;
          cm = 1;
        } else {
          cm++;
        }
      }
    } catch (e) {
      result.errors.push(
        `${r.category}: ${e instanceof Error ? e.message : 'unknown'}`,
      );
    }
  }

  if (result.added > 0) await syncAll();
  return result;
}

// =================================================================
// Airbnb 수익 CSV import
// =================================================================

export interface ParsedAirbnbRow {
  date: string;
  confirmationCode?: string;
  guestName: string;
  listing: string;
  nights: number;
  amount: number;
  type: string;
}

export interface AirbnbCsvImportResult {
  total: number;
  matched: number;
  inserted: number;
  skipped: number;
  errors: string[];
}

function findHeaderKey(
  headers: string[],
  ...needles: string[]
): string | undefined {
  return headers.find((h) =>
    needles.some((n) => h.toLowerCase().includes(n.toLowerCase())),
  );
}

export function parseAirbnbCsvRows(
  rows: Record<string, string>[],
): ParsedAirbnbRow[] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);

  const dateKey = findHeaderKey(headers, 'start date', '시작일', '체크인', '예약된 날짜');
  const typeKey = findHeaderKey(headers, 'type', '유형');
  const codeKey = findHeaderKey(headers, 'confirmation code', '확인 번호', '확인번호');
  const guestKey = findHeaderKey(headers, 'guest', '게스트');
  const listingKey = findHeaderKey(headers, 'listing', '숙소');
  const nightsKey = findHeaderKey(headers, 'nights', '박수');
  const amountKey = findHeaderKey(
    headers,
    'paid out',
    'amount',
    'earnings',
    'gross earnings',
    '지급액',
    '수입',
    '총액',
    '금액',
  );

  const parsed: ParsedAirbnbRow[] = [];
  for (const r of rows) {
    const type = typeKey ? r[typeKey] : '';
    if (typeKey && type && !/reservation|예약/i.test(type)) continue;

    const dateRaw = dateKey ? r[dateKey] : '';
    const date = normalizeDate(dateRaw);
    if (!date) continue;

    const amountStr = amountKey ? r[amountKey] : '0';
    const amount = parseAmountFromCsv(amountStr);

    parsed.push({
      date,
      confirmationCode: codeKey ? r[codeKey].trim() || undefined : undefined,
      guestName: guestKey ? r[guestKey].trim() : '',
      listing: listingKey ? r[listingKey].trim() : '',
      nights: nightsKey ? Number(r[nightsKey]) || 0 : 0,
      amount,
      type,
    });
  }
  return parsed;
}

function normalizeDate(s: string): string {
  if (!s) return '';
  // YYYY-MM-DD
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  // MM/DD/YYYY
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  // YYYY/MM/DD
  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return '';
}

function parseAmountFromCsv(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/[^\d.-]/g, '');
  const n = Number(cleaned);
  return isNaN(n) ? 0 : Math.round(n);
}

export async function importAirbnbCsv(
  parsed: ParsedAirbnbRow[],
  listingMap: Record<string, string>, // listing name → propertyId
): Promise<AirbnbCsvImportResult> {
  const result: AirbnbCsvImportResult = {
    total: parsed.length,
    matched: 0,
    inserted: 0,
    skipped: 0,
    errors: [],
  };
  const userId = await getUserId();

  for (const row of parsed) {
    try {
      const propertyId = listingMap[row.listing];
      if (!propertyId) {
        result.skipped++;
        continue;
      }

      // 기존 confirmation code 매칭 시도
      if (row.confirmationCode) {
        const existing = await supabase
          .from('bookings')
          .select('id, status')
          .eq('confirmation_code', row.confirmationCode)
          .maybeSingle();

        if (existing.data) {
          // 매출 + 게스트명 update + status confirmed
          const upd = await supabase
            .from('bookings')
            .update({
              guest_name: row.guestName || existing.data.id,
              revenue: row.amount,
              status: 'confirmed',
            })
            .eq('id', existing.data.id);
          if (upd.error) throw upd.error;
          result.matched++;
          continue;
        }
      }

      // 매칭 실패 → 새로 insert
      const checkOut = new Date(row.date);
      checkOut.setDate(checkOut.getDate() + row.nights);
      const checkOutStr = checkOut.toISOString().slice(0, 10);

      const ins = await supabase.from('bookings').insert({
        user_id: userId,
        property_id: propertyId,
        guest_name: row.guestName || row.confirmationCode || '게스트',
        country: 'KR',
        platform: 'airbnb',
        guests: 1,
        nights: row.nights,
        check_in: row.date,
        check_out: checkOutStr,
        revenue: row.amount,
        confirmation_code: row.confirmationCode ?? null,
        status: 'confirmed',
      });
      if (ins.error) throw ins.error;
      result.inserted++;
    } catch (e) {
      result.errors.push(
        `${row.guestName || row.confirmationCode || row.date}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  await syncAll();
  return result;
}

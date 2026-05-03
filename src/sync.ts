import { db } from './db';
import { supabase } from './supabase';
import {
  Booking,
  BookingStatus,
  Expense,
  Platform,
  Property,
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
    createdAt: new Date(r.created_at as string).getTime(),
  };
}

async function getUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Not authenticated');
  return data.user.id;
}

export async function syncAll(): Promise<void> {
  const [propsRes, bksRes, expsRes] = await Promise.all([
    supabase.from('properties').select('*'),
    supabase.from('bookings').select('*'),
    supabase.from('expenses').select('*'),
  ]);
  if (propsRes.error) throw propsRes.error;
  if (bksRes.error) throw bksRes.error;
  if (expsRes.error) throw expsRes.error;

  const props = (propsRes.data ?? []).map(rowToProperty);
  const bks = (bksRes.data ?? []).map(rowToBooking);
  const exps = (expsRes.data ?? []).map(rowToExpense);

  await db.transaction(
    'rw',
    db.properties,
    db.bookings,
    db.expenses,
    async () => {
      await db.properties.clear();
      await db.bookings.clear();
      await db.expenses.clear();
      if (props.length) await db.properties.bulkAdd(props);
      if (bks.length) await db.bookings.bulkAdd(bks);
      if (exps.length) await db.expenses.bulkAdd(exps);
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

export async function syncIcalForProperty(
  property: Property,
): Promise<IcalSyncResult> {
  const result: IcalSyncResult = { added: 0, skipped: 0, errors: [] };
  if (!property.icalUrl) return result;

  const { data, error } = await supabase.functions.invoke('ical-fetch', {
    body: { url: property.icalUrl },
  });
  if (error) {
    result.errors.push(error.message);
    return result;
  }
  const ics = (data as { ics?: string })?.ics;
  if (!ics) {
    result.errors.push('iCal 응답 비어있음');
    return result;
  }

  const events = parseICS(ics).filter((ev) => ev.isReservation);

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

  const userId = await getUserId();
  const toInsert: Record<string, unknown>[] = [];
  for (const ev of events) {
    if (!ev.confirmationCode) {
      result.skipped++;
      continue;
    }
    if (existingCodes.has(ev.confirmationCode)) {
      result.skipped++;
      continue;
    }
    toInsert.push({
      user_id: userId,
      property_id: property.id,
      guest_name: ev.confirmationCode,
      country: 'KR',
      platform: 'airbnb',
      guests: 1,
      nights: diffDays(ev.start, ev.end),
      check_in: ev.start,
      check_out: ev.end,
      revenue: 0,
      confirmation_code: ev.confirmationCode,
      status: 'pending',
    });
  }

  if (toInsert.length) {
    const ins = await supabase.from('bookings').insert(toInsert);
    if (ins.error) {
      result.errors.push(ins.error.message);
    } else {
      result.added += toInsert.length;
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

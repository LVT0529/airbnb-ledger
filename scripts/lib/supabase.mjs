// 추출된 예약 데이터를 Supabase 의 기존 bookings 와 매칭해 업데이트
// 매칭 키: confirmation_code (Airbnb HM... 코드)
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ENV_PATH = join(ROOT, '.env.local');

function loadEnvLocal() {
  const env = {};
  if (!existsSync(ENV_PATH)) return env;
  const text = readFileSync(ENV_PATH, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}

export function getSupabaseClient() {
  const env = { ...loadEnvLocal(), ...process.env };
  const url = env.SUPABASE_URL || 'https://kixcgiogadkexrbfwmbv.supabase.co';
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 필요합니다.\n' +
        '  설정 → API → service_role key 복사 후 .env.local 에 추가:\n' +
        '  SUPABASE_SERVICE_ROLE_KEY=eyJ...\n' +
        '  (.env.local 은 .gitignore 처리됨)',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * 추출된 row 들과 기존 bookings 매칭 후 업데이트
 * 업데이트 필드: guest_name, country, guests, nights, revenue, status
 *
 * @param {Array<{confirmationCode?, guestName?, country?, guests?, nights?, revenue?}>} rows
 * @returns {{matched, updated, missed, errors}}
 */
export async function pushBookings(rows) {
  const supabase = getSupabaseClient();

  const codes = rows
    .filter((r) => r.confirmationCode)
    .map((r) => r.confirmationCode);

  if (codes.length === 0) {
    return { matched: 0, updated: 0, missed: rows.length, errors: [] };
  }

  const { data: existing, error } = await supabase
    .from('bookings')
    .select('id, confirmation_code, guest_name, revenue, status, country')
    .in('confirmation_code', codes);

  if (error) throw new Error(`Supabase select 실패: ${error.message}`);

  const byCode = new Map();
  for (const b of existing ?? []) {
    if (b.confirmation_code) byCode.set(b.confirmation_code, b);
  }

  let updated = 0;
  let missed = 0;
  const errors = [];

  for (const r of rows) {
    if (!r.confirmationCode) {
      missed++;
      continue;
    }
    const match = byCode.get(r.confirmationCode);
    if (!match) {
      missed++;
      continue;
    }

    const patch = {};
    if (r.guestName && r.guestName !== match.guest_name) patch.guest_name = r.guestName;
    if (r.country && r.country !== match.country) patch.country = r.country;
    if (typeof r.guests === 'number') patch.guests = r.guests;
    if (typeof r.nights === 'number') patch.nights = r.nights;
    if (typeof r.revenue === 'number' && r.revenue > 0) {
      patch.revenue = r.revenue;
      // 매출이 들어오면 pending → confirmed 자동 전이
      if (match.status === 'pending') patch.status = 'confirmed';
    }

    if (Object.keys(patch).length === 0) continue;

    const { error: uErr } = await supabase
      .from('bookings')
      .update(patch)
      .eq('id', match.id);

    if (uErr) {
      errors.push(`${r.confirmationCode}: ${uErr.message}`);
    } else {
      updated++;
    }
  }

  return { matched: byCode.size, updated, missed, errors };
}

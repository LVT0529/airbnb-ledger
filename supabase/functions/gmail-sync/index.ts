// Gmail에서 Airbnb 메일을 읽어 정규식으로 매출/이름/체크인을 추출 → bookings 테이블 upsert
//
// Auth: Supabase JWT (사용자 본인의 메일)
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// =================================================================
// Helpers
// =================================================================

function decodeBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
  filename?: string;
}

function extractBody(payload: GmailPart): string {
  if (!payload) return '';
  if (payload.body?.data) {
    try {
      const text = decodeBase64Url(payload.body.data);
      if (payload.mimeType === 'text/plain') return text + '\n';
      if (payload.mimeType === 'text/html') return stripHtml(text) + '\n';
    } catch {
      /* skip */
    }
  }
  if (payload.parts) {
    return payload.parts
      .filter((p) => !p.filename)
      .map(extractBody)
      .join('\n');
  }
  return '';
}

// =================================================================
// 정규식 파서 (한국어 + 영어)
// =================================================================

const MONTH_NAMES_EN: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

function parseDate(s: string): string | null {
  let m = s.match(/(\d{4})[-./년]\s*(\d{1,2})[-./월]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mon = MONTH_NAMES_EN[m[1].toLowerCase()];
    if (mon)
      return `${m[3]}-${String(mon).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  m = s.match(/(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/);
  if (m) {
    const mon = MONTH_NAMES_EN[m[2].toLowerCase()];
    if (mon)
      return `${m[3]}-${String(mon).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function parseAmount(s: string): number {
  const m = s.match(/[₩￦$]?\s*([\d,]+(?:\.\d+)?)\s*(?:원|KRW|USD)?/);
  if (!m) return 0;
  return Math.round(Number(m[1].replace(/,/g, '')));
}

export interface ParsedAirbnbMail {
  kind: 'reservation' | 'cancellation' | 'payout' | 'message' | 'unknown';
  confirmationCode?: string;
  guestName?: string;
  checkIn?: string;
  checkOut?: string;
  nights?: number;
  guests?: number;
  amount?: number; // 매출/지급액
}

function classify(subject: string, body: string): ParsedAirbnbMail['kind'] {
  const t = (subject + '\n' + body).toLowerCase();
  if (/cancel|취소|cancelled/.test(t)) return 'cancellation';
  if (/payout|지급액|정산|송금|paid out/.test(t)) return 'payout';
  if (/reservation\s+confirmed|booked|new\s+reservation|예약\s*확정|예약이\s*확정|새\s*예약|reserved\s+your/.test(t))
    return 'reservation';
  if (/new\s+message|메시지/.test(t)) return 'message';
  return 'unknown';
}

export function parseAirbnbMail(
  subject: string,
  body: string,
): ParsedAirbnbMail {
  const text = subject + '\n\n' + body;
  const kind = classify(subject, body);
  const out: ParsedAirbnbMail = { kind };

  // confirmation code
  const cmCode = text.match(/\b(HM[A-Z0-9]{6,12})\b/);
  if (cmCode) out.confirmationCode = cmCode[1];

  // check-in
  const ciKo = text.match(
    /체크인[^0-9]*((?:\d{4}[-./년]\s*)?\d{1,2}[-./월]\s*\d{1,2}일?(?:\s*[,(\s]\s*[가-힣]요일\s*\)?)?)/,
  );
  const ciEn = text.match(
    /check[-\s]?in[^0-9A-Za-z]*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]+,?\s+\d{4}|\d{4}-\d{2}-\d{2})/i,
  );
  const ciStr = ciKo?.[1] ?? ciEn?.[1] ?? '';
  if (ciStr) {
    const d = parseDate(ciStr);
    if (d) out.checkIn = d;
  }

  // check-out
  const coKo = text.match(
    /체크아웃[^0-9]*((?:\d{4}[-./년]\s*)?\d{1,2}[-./월]\s*\d{1,2}일?)/,
  );
  const coEn = text.match(
    /check[-\s]?out[^0-9A-Za-z]*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]+,?\s+\d{4}|\d{4}-\d{2}-\d{2})/i,
  );
  const coStr = coKo?.[1] ?? coEn?.[1] ?? '';
  if (coStr) {
    const d = parseDate(coStr);
    if (d) out.checkOut = d;
  }

  // nights
  const nightsKo = text.match(/(\d+)\s*박/);
  const nightsEn = text.match(/(\d+)\s*nights?/i);
  if (nightsKo) out.nights = Number(nightsKo[1]);
  else if (nightsEn) out.nights = Number(nightsEn[1]);
  else if (out.checkIn && out.checkOut) {
    const d1 = new Date(out.checkIn);
    const d2 = new Date(out.checkOut);
    out.nights = Math.round(
      (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  // guests (숙박 인원)
  const guestsKo = text.match(/게스트\s*(\d+)\s*명|성인\s*(\d+)\s*명?|(\d+)\s*명\s*게스트|총\s*(\d+)\s*명/);
  const guestsEn = text.match(/(\d+)\s*guests?/i);
  if (guestsKo) {
    out.guests = Number(
      guestsKo[1] ?? guestsKo[2] ?? guestsKo[3] ?? guestsKo[4],
    );
  } else if (guestsEn) out.guests = Number(guestsEn[1]);

  // amount: payout 우선, 없으면 total
  const payoutKo = text.match(/지급액[^\d₩￦]*[₩￦]?\s*([\d,]+)/);
  const payoutEn = text.match(
    /(?:total\s+)?payout[^\d$₩]*[₩￦$]?\s*([\d,]+)|you[''']ll be paid[^\d$₩]*[₩￦$]?\s*([\d,]+)/i,
  );
  const totalKo = text.match(/(?:합계|총)\s*[₩￦]?\s*([\d,]+)\s*원?/);
  const amountStr =
    payoutKo?.[1] ??
    payoutEn?.[1] ??
    payoutEn?.[2] ??
    totalKo?.[1] ??
    null;
  if (amountStr)
    out.amount = Math.round(Number(amountStr.replace(/,/g, '')));

  // 게스트 이름 추출 시도 (subject 우선)
  // "Reservation from John Doe", "[Name]님의 예약"
  const nameKo = subject.match(/^([가-힣A-Za-z\s.]+?)님의?\s*예약/);
  const nameEn = subject.match(/(?:from|by)\s+([A-Za-z][A-Za-z\s.'-]{1,40})/i);
  const nameDirect = body.match(/Guest[:\s]+([A-Za-z][A-Za-z\s.'-]{1,40})/);
  const guestName =
    nameKo?.[1]?.trim() ??
    nameEn?.[1]?.trim() ??
    nameDirect?.[1]?.trim() ??
    undefined;
  if (guestName && guestName.length < 40) out.guestName = guestName;

  return out;
}

// =================================================================
// Token refresh
// =================================================================

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error(`refresh failed: ${await r.text()}`);
  return await r.json();
}

// =================================================================
// Main
// =================================================================

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) return json({ error: 'auth failed' }, 401);
    const userId = userRes.user.id;

    // Fetch token
    const { data: tokenRow } = await supabase
      .from('user_google_tokens')
      .select('*')
      .single();

    if (!tokenRow) return json({ error: 'gmail not connected' }, 400);

    let accessToken = tokenRow.access_token as string;
    const refreshToken = tokenRow.refresh_token as string | null;
    const expiresAt = tokenRow.expires_at
      ? new Date(tokenRow.expires_at as string).getTime()
      : 0;

    // Refresh if expired (or expiring within 60s)
    if (Date.now() > expiresAt - 60_000) {
      if (!refreshToken) {
        return json({ error: 'no refresh token, please reconnect' }, 400);
      }
      const refreshed = await refreshAccessToken(
        refreshToken,
        clientId,
        clientSecret,
      );
      accessToken = refreshed.access_token;
      const newExpiresAt = new Date(
        Date.now() + refreshed.expires_in * 1000,
      ).toISOString();
      await supabase
        .from('user_google_tokens')
        .update({
          access_token: accessToken,
          expires_at: newExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
    }

    // List Airbnb messages
    const query =
      'from:(automated@airbnb.com OR express@airbnb.com OR noreply@airbnb.com) newer_than:180d';
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!listRes.ok) {
      const text = await listRes.text();
      return json({ error: `gmail list: ${text}` }, 500);
    }
    const listData = await listRes.json();
    const messages: Array<{ id: string }> = listData.messages ?? [];

    // Get already processed IDs
    const { data: processedRows } = await supabase
      .from('gmail_processed_messages')
      .select('message_id');
    const processedSet = new Set(
      (processedRows ?? []).map((r) => r.message_id as string),
    );

    // Get existing bookings to find property mappings
    const { data: existingBookings } = await supabase
      .from('bookings')
      .select('id, property_id, confirmation_code, status, guest_name, revenue, nights, guests');
    const bookingByCode = new Map<string, typeof existingBookings extends null ? never : NonNullable<typeof existingBookings>[number]>();
    (existingBookings ?? []).forEach((b) => {
      if (b.confirmation_code) bookingByCode.set(b.confirmation_code, b);
    });

    // Get properties (for fallback)
    const { data: propsRows } = await supabase
      .from('properties')
      .select('id, name')
      .order('created_at', { ascending: true });
    const properties = propsRows ?? [];
    const defaultPropertyId = properties[0]?.id as string | undefined;

    // Process each message
    const stats = {
      fetched: messages.length,
      newProcessed: 0,
      updated: 0,
      inserted: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const m of messages) {
      if (processedSet.has(m.id)) {
        stats.skipped++;
        continue;
      }

      try {
        const fullRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!fullRes.ok) {
          stats.errors.push(`get ${m.id}: ${await fullRes.text()}`);
          continue;
        }
        const full = await fullRes.json();

        const headers = full.payload?.headers ?? [];
        const subject =
          headers.find((h: { name: string }) => h.name.toLowerCase() === 'subject')?.value ?? '';
        const body = extractBody(full.payload);

        const parsed = parseAirbnbMail(subject, body);

        let resultKind: string = parsed.kind;

        if (
          parsed.kind === 'reservation' ||
          parsed.kind === 'payout'
        ) {
          if (parsed.confirmationCode) {
            const existing = bookingByCode.get(parsed.confirmationCode);
            if (existing) {
              const upd: Record<string, unknown> = { status: 'confirmed' };
              if (parsed.amount && parsed.amount > 0) upd.revenue = parsed.amount;
              if (parsed.guestName) upd.guest_name = parsed.guestName;
              if (parsed.guests) upd.guests = parsed.guests;
              if (parsed.nights) upd.nights = parsed.nights;
              if (parsed.checkIn) upd.check_in = parsed.checkIn;
              if (parsed.checkOut) upd.check_out = parsed.checkOut;
              const u = await supabase
                .from('bookings')
                .update(upd)
                .eq('id', existing.id);
              if (u.error) throw u.error;
              stats.updated++;
            } else if (defaultPropertyId && parsed.checkIn) {
              // Insert new
              const ins = await supabase.from('bookings').insert({
                user_id: userId,
                property_id: defaultPropertyId,
                guest_name: parsed.guestName ?? parsed.confirmationCode,
                country: 'KR',
                platform: 'airbnb',
                guests: parsed.guests ?? 1,
                nights: parsed.nights ?? 1,
                check_in: parsed.checkIn,
                check_out: parsed.checkOut ?? parsed.checkIn,
                revenue: parsed.amount ?? 0,
                confirmation_code: parsed.confirmationCode,
                status: 'confirmed',
              });
              if (ins.error) throw ins.error;
              stats.inserted++;
            } else {
              resultKind = 'unmatched';
            }
          } else {
            resultKind = 'unmatched';
          }
        }

        await supabase.from('gmail_processed_messages').insert({
          user_id: userId,
          message_id: m.id,
          result_kind: resultKind,
        });
        stats.newProcessed++;
      } catch (e) {
        stats.errors.push(
          `${m.id}: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    }

    // Update sync state
    await supabase.from('gmail_sync_state').upsert(
      {
        user_id: userId,
        last_sync_at: new Date().toISOString(),
        last_processed_at: new Date().toISOString(),
        total_processed: (stats.newProcessed +
          (await getCurrentTotal(supabase, userId))) as number,
        last_error: stats.errors.length ? stats.errors.join('\n') : null,
      },
      { onConflict: 'user_id' },
    );

    return json(stats);
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : 'unknown' },
      500,
    );
  }
});

async function getCurrentTotal(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<number> {
  const { data } = await supabase
    .from('gmail_sync_state')
    .select('total_processed')
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.total_processed as number) ?? 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

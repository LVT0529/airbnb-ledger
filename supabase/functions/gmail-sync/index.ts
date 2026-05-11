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

export interface ParsedMail {
  kind: 'reservation' | 'cancellation' | 'payout' | 'message' | 'unknown';
  platform: 'airbnb' | 'agoda' | 'unknown';
  confirmationCode?: string;
  guestName?: string;
  country?: string; // ISO 2-letter code
  checkIn?: string;
  checkOut?: string;
  nights?: number;
  guests?: number;
  amount?: number; // 매출/지급액 (호스트 실수령 우선)
}

// Agoda 등에서 영문 국가명을 ISO 2-letter 코드로 변환
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  'south korea': 'KR', 'korea': 'KR', 'republic of korea': 'KR',
  'japan': 'JP',
  'china': 'CN', "people's republic of china": 'CN',
  'taiwan': 'TW',
  'hong kong': 'HK',
  'singapore': 'SG',
  'malaysia': 'MY',
  'thailand': 'TH',
  'vietnam': 'VN', 'viet nam': 'VN',
  'indonesia': 'ID',
  'philippines': 'PH',
  'india': 'IN',
  'united states': 'US', 'united states of america': 'US', 'usa': 'US', 'u.s.a.': 'US', 'us': 'US',
  'canada': 'CA',
  'mexico': 'MX',
  'brazil': 'BR',
  'argentina': 'AR',
  'united kingdom': 'GB', 'uk': 'GB', 'great britain': 'GB', 'england': 'GB',
  'ireland': 'IE',
  'france': 'FR',
  'germany': 'DE',
  'spain': 'ES',
  'italy': 'IT',
  'portugal': 'PT',
  'netherlands': 'NL',
  'belgium': 'BE',
  'switzerland': 'CH',
  'austria': 'AT',
  'sweden': 'SE',
  'norway': 'NO',
  'denmark': 'DK',
  'finland': 'FI',
  'poland': 'PL',
  'czech republic': 'CZ', 'czechia': 'CZ',
  'greece': 'GR',
  'russia': 'RU', 'russian federation': 'RU',
  'turkey': 'TR', 'türkiye': 'TR', 'turkiye': 'TR',
  'israel': 'IL',
  'united arab emirates': 'AE', 'uae': 'AE',
  'saudi arabia': 'SA',
  'egypt': 'EG',
  'south africa': 'ZA',
  'australia': 'AU',
  'new zealand': 'NZ',
};

function normalizeCountryName(s: string): string | undefined {
  const k = s.trim().toLowerCase();
  return COUNTRY_NAME_TO_CODE[k];
}

// 구버전 호환
export type ParsedAirbnbMail = ParsedMail;

function detectPlatform(
  from: string,
  subject: string,
  body: string,
): ParsedMail['platform'] {
  const head = (from + '\n' + subject).toLowerCase();
  if (/agoda\.com|아고다\s*예약/.test(head)) return 'agoda';
  if (/airbnb\.com/.test(head)) return 'airbnb';
  // body fallback
  const all = (subject + '\n' + body).toLowerCase();
  if (/booking\s+confirmed|reservation\s+confirmed|new\s+booking/.test(all))
    return 'airbnb';
  return 'unknown';
}

function classify(subject: string, body: string): ParsedMail['kind'] {
  const s = subject.toLowerCase();
  const t = (subject + '\n' + body).toLowerCase();

  // 1) Subject 기준 (가장 신뢰도 높음)
  if (/reservation\s+confirmed|booking\s+confirmed|예약\s*확정|예약이\s*확정|아고다\s*예약\s*id.*확정|booking\s*confirmation/.test(s))
    return 'reservation';
  if (/cancelled|취소/.test(s)) return 'cancellation';
  if (/payout|지급액|정산/.test(s)) return 'payout';

  // 2) Body fallback — 광범위한 "cancel" 단독 매칭은 금지 (free cancellation 등 안내문 회피)
  if (/your\s+reservation\s+(?:was|has\s+been)\s+cancell?ed|guest\s+cancell?ed|예약이\s*취소/.test(t))
    return 'cancellation';
  if (/new\s+booking|new\s+reservation|booked|reserved\s+your|새\s*예약|예약\s*확정서/.test(t))
    return 'reservation';
  if (/paid\s+out|송금/.test(t)) return 'payout';
  if (/new\s+message|메시지/.test(t)) return 'message';
  return 'unknown';
}

export function parseAirbnbMail(
  subject: string,
  body: string,
): ParsedMail {
  const text = subject + '\n\n' + body;
  const kind = classify(subject, body);
  const out: ParsedMail = { kind, platform: 'airbnb' };

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

  // guests (숙박 인원) — Airbnb 영문 메일은 "4 adults" / "2 guests" 형식
  const guestsKo = text.match(/게스트\s*(\d+)\s*명|성인\s*(\d+)\s*명?|(\d+)\s*명\s*게스트|총\s*(\d+)\s*명/);
  const guestsEn = text.match(/(\d+)\s*(?:guests?|adults?)/i);
  if (guestsKo) {
    out.guests = Number(
      guestsKo[1] ?? guestsKo[2] ?? guestsKo[3] ?? guestsKo[4],
    );
  } else if (guestsEn) out.guests = Number(guestsEn[1]);

  // amount: 호스트 실수령(payout) 우선
  // 우선순위: "You earn ₩X" / "지급액 ₩X" / "Total payout ₩X" / "you'll be paid ₩X" / 합계
  const youEarnEn = text.match(/you\s+earn[^\d$₩]*[₩￦$]?\s*([\d,]+)/i);
  const payoutKo = text.match(/지급액[^\d₩￦]*[₩￦]?\s*([\d,]+)/);
  const payoutEn = text.match(
    /(?:total\s+)?payout[^\d$₩]*[₩￦$]?\s*([\d,]+)|you[''']ll be paid[^\d$₩]*[₩￦$]?\s*([\d,]+)/i,
  );
  const totalKo = text.match(/(?:합계|총)\s*[₩￦]?\s*([\d,]+)\s*원?/);
  const amountStr =
    youEarnEn?.[1] ??
    payoutKo?.[1] ??
    payoutEn?.[1] ??
    payoutEn?.[2] ??
    totalKo?.[1] ??
    null;
  if (amountStr)
    out.amount = Math.round(Number(amountStr.replace(/,/g, '')));

  // 게스트 이름 추출 (subject 우선, CJK 지원)
  // 패턴: "[Name]님의 예약" / "Reservation from John" / "Reservation confirmed - 雯茜 arrives May 27"
  // / 본문 "New booking confirmed! 雯茜 arrives ..." / 본문 "Guest: John"
  // CJK 포함 이름 글자 클래스 (한글/한자/히라가나/가타카나/영문)
  const NAME_CHAR = "A-Za-z가-힣\\u4e00-\\u9fff\\u3040-\\u30ff\\s.'-";
  const nameKo = subject.match(/^([가-힣A-Za-z\s.]+?)님의?\s*예약/);
  // "New booking confirmed! 雯茜 arrives May 27" 같은 본문 패턴 (가장 안정적)
  const nameArrivesBody = body.match(
    new RegExp(`(?:booking|reservation)\\s+confirmed[!.\\s]*([${NAME_CHAR}]{2,40}?)\\s+arrives\\b`, 'i'),
  );
  const nameEn = subject.match(/(?:from|by)\s+([A-Za-z][A-Za-z\s.'-]{1,40})/i);
  const nameDirect = body.match(/Guest[:\s]+([A-Za-z][A-Za-z\s.'-]{1,40})/);
  const guestName =
    nameKo?.[1]?.trim() ??
    nameArrivesBody?.[1]?.trim() ??
    nameEn?.[1]?.trim() ??
    nameDirect?.[1]?.trim() ??
    undefined;
  if (guestName && guestName.length < 40) out.guestName = guestName;

  return out;
}

// =================================================================
// Agoda 파서
// =================================================================

export function parseAgodaMail(subject: string, body: string): ParsedMail {
  const text = subject + '\n' + body;
  const kind = classify(subject, body);
  const out: ParsedMail = { kind, platform: 'agoda' };

  // Booking ID — 본문 또는 제목에서 7~12자리 숫자
  // 제목: "아고다 예약 ID 1712686675 - 확정"
  // 본문: "예약 번호\n1712686675"
  const codeSubj = subject.match(/(?:예약\s*ID|Booking\s*ID)[^0-9]*(\d{7,12})/i);
  const codeBody = body.match(/(?:Booking\s*ID|예약\s*번호)\s*\n?\s*(\d{7,12})/i);
  if (codeSubj) out.confirmationCode = codeSubj[1];
  else if (codeBody) out.confirmationCode = codeBody[1];

  // 게스트 이름 — "Customer First Name 고객 이름 YI-SHAN" + "Customer Last Name 고객 성 GUO"
  const fn = body.match(/Customer\s+First\s+Name\s*(?:고객\s*이름)?\s+([A-Z][A-Z\s\-']{0,40}?)(?:\s{2,}|\n|\r|Customer)/);
  const ln = body.match(/Customer\s+Last\s+Name\s*(?:고객\s*성)?\s+([A-Z][A-Z\s\-']{0,40}?)(?:\s{2,}|\n|\r|Country)/);
  if (fn || ln) {
    const name = [fn?.[1]?.trim(), ln?.[1]?.trim()].filter(Boolean).join(' ');
    if (name) out.guestName = name;
  }

  // 거주 국가 — "Country of Residence 거주 국가 Taiwan"
  const cr = body.match(/Country\s+of\s+Residence\s*(?:거주\s*국가)?\s+([A-Za-z][A-Za-z\s\.()'-]{1,40}?)(?:\s{2,}|\n|\r|Check)/);
  if (cr) {
    const code = normalizeCountryName(cr[1]);
    if (code) out.country = code;
  }

  // 체크인/체크아웃 — "Check-in 체크인 2026년 9월 17일"
  const ci = body.match(/Check-in[^0-9]*(\d{4}년\s*\d{1,2}월\s*\d{1,2}일|\d{4}-\d{1,2}-\d{1,2})/);
  const co = body.match(/Check-out[^0-9]*(\d{4}년\s*\d{1,2}월\s*\d{1,2}일|\d{4}-\d{1,2}-\d{1,2})/);
  if (ci) {
    const d = parseDate(ci[1]);
    if (d) out.checkIn = d;
  }
  if (co) {
    const d = parseDate(co[1]);
    if (d) out.checkOut = d;
  }
  if (out.checkIn && out.checkOut) {
    const d1 = new Date(out.checkIn);
    const d2 = new Date(out.checkOut);
    out.nights = Math.round((d2.getTime() - d1.getTime()) / 86_400_000);
  }

  // 인원 — "4 Adults"
  const adults = text.match(/(\d+)\s*Adults?/i);
  if (adults) out.guests = Number(adults[1]);

  // 호스트 실수령 — "Net rate (incl. taxes & fees)\n입금 금액(...)\nKRW 782,500.00"
  const net = body.match(/Net\s+rate[\s\S]{0,200}?KRW\s*([\d,]+(?:\.\d+)?)/i)
    ?? body.match(/입금\s*금액[\s\S]{0,200}?KRW\s*([\d,]+(?:\.\d+)?)/);
  if (net) {
    out.amount = Math.round(Number(net[1].replace(/,/g, '')));
  }

  return out;
}

// 발신자/제목/본문으로 플랫폼을 판단해 적절한 파서를 호출
export function parseMail(from: string, subject: string, body: string): ParsedMail {
  const platform = detectPlatform(from, subject, body);
  if (platform === 'agoda') return parseAgodaMail(subject, body);
  if (platform === 'airbnb') return parseAirbnbMail(subject, body);
  // unknown: 두 파서 모두 시도 후 유의미한 결과 선택
  const a = parseAirbnbMail(subject, body);
  const g = parseAgodaMail(subject, body);
  return a.confirmationCode ? a : g.confirmationCode ? g : { kind: 'unknown', platform: 'unknown' };
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

    // Airbnb + Agoda, 직접 수신 + 포워딩 모두 캐치
    const query =
      '(from:airbnb.com OR from:agoda.com OR subject:"Reservation confirmed" OR subject:"예약이 확정" OR subject:"예약 확정" OR subject:"아고다 예약 ID" OR subject:"Booking confirmation") newer_than:180d';
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
      .select('id, property_id, confirmation_code, status, guest_name, revenue, nights, guests, platform, check_in');
    type ExistingBooking = NonNullable<typeof existingBookings>[number];
    const bookingByCode = new Map<string, ExistingBooking>();
    // 플랫폼 + 체크인 날짜로도 매칭 (iCal에서 만든 placeholder 예약과 Gmail 매칭)
    const bookingByPlatformDate = new Map<string, ExistingBooking>();
    (existingBookings ?? []).forEach((b) => {
      if (b.confirmation_code) bookingByCode.set(b.confirmation_code, b);
      if (b.platform && b.check_in)
        bookingByPlatformDate.set(`${b.platform}|${b.check_in}`, b);
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
        const findHeader = (name: string) =>
          headers.find((h: { name: string }) => h.name.toLowerCase() === name)?.value ?? '';
        const subject = findHeader('subject');
        const from = findHeader('from');
        const body = extractBody(full.payload);

        const parsed = parseMail(from, subject, body);

        let resultKind: string = parsed.kind;

        if (
          parsed.kind === 'reservation' ||
          parsed.kind === 'payout'
        ) {
          if (parsed.confirmationCode) {
            // 1차: confirmation_code 매칭, 2차: 플랫폼+체크인 날짜 매칭 (iCal placeholder 대응)
            let existing = bookingByCode.get(parsed.confirmationCode);
            if (!existing && parsed.platform !== 'unknown' && parsed.checkIn) {
              existing = bookingByPlatformDate.get(`${parsed.platform}|${parsed.checkIn}`);
            }
            if (existing) {
              const upd: Record<string, unknown> = { status: 'confirmed' };
              if (parsed.amount && parsed.amount > 0) upd.revenue = parsed.amount;
              if (parsed.guestName) upd.guest_name = parsed.guestName;
              if (parsed.country) upd.country = parsed.country;
              if (parsed.guests) upd.guests = parsed.guests;
              if (parsed.nights) upd.nights = parsed.nights;
              if (parsed.checkIn) upd.check_in = parsed.checkIn;
              if (parsed.checkOut) upd.check_out = parsed.checkOut;
              // 정확한 confirmation_code로 갱신 (iCal placeholder의 AGODA-xxx → 실제 Booking ID)
              if (existing.confirmation_code !== parsed.confirmationCode) {
                upd.confirmation_code = parsed.confirmationCode;
              }
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
                country: parsed.country ?? '',
                platform: parsed.platform === 'unknown' ? 'airbnb' : parsed.platform,
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
    // total_processed: gmail_processed_messages 테이블의 실제 행 수로 산정 (초기화 시 자동 반영)
    const { count: actualTotal } = await supabase
      .from('gmail_processed_messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    await supabase.from('gmail_sync_state').upsert(
      {
        user_id: userId,
        last_sync_at: new Date().toISOString(),
        last_processed_at: new Date().toISOString(),
        total_processed: actualTotal ?? 0,
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

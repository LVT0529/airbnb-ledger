// Airbnb 호스트 예약 스크래퍼
// 로그인 후 /hosting/reservations 진입 → DOM 또는 내부 API 응답에서 게스트·박수·금액 추출
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEBUG_DIR, ensureDir, saveDebugScreenshot } from '../lib/browser.mjs';

export const meta = {
  name: 'airbnb',
  loginUrl: 'https://www.airbnb.co.kr/login',
  successUrlPattern: /\/(hosting|account|users|reservations|earnings|trips)/,
};

const RESERVATION_URLS = [
  'https://www.airbnb.co.kr/hosting/reservations/upcoming',
  'https://www.airbnb.com/hosting/reservations/upcoming',
];

/**
 * 페이지에서 예약 행 정보를 긁어 표준 포맷으로 반환
 * 셀렉터는 Airbnb UI 변경으로 자주 깨질 수 있음 → --headed 디버깅 가이드 README 참고
 */
export async function scrapeBookings({ page }) {
  // 1) 호스트 예약 페이지 진입 시도
  let entered = false;
  for (const url of RESERVATION_URLS) {
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded' });
      if (resp && resp.status() < 400 && !page.url().includes('/login')) {
        entered = true;
        break;
      }
    } catch (e) {
      console.warn(`[airbnb] ${url} 실패: ${e.message}`);
    }
  }
  if (!entered) throw new Error('Airbnb 호스트 예약 페이지 진입 실패 (세션 만료?)');

  // 2) 네트워크 응답에서 데이터 가져오기 시도 (DOM보다 안정적)
  // Airbnb는 GraphQL 또는 내부 REST를 사용. 응답 가로채기.
  const captured = [];
  page.on('response', async (resp) => {
    const url = resp.url();
    if (
      url.includes('/api/v3/') ||
      url.includes('/api/v2/reservations') ||
      url.includes('reservation') ||
      url.includes('/api/v3/HostUpcomingReservations') ||
      url.includes('Reservation') ||
      url.includes('/_next/data/')
    ) {
      try {
        const ct = resp.headers()['content-type'] ?? '';
        if (ct.includes('json')) {
          const j = await resp.json();
          captured.push({ url, payload: j });
        }
      } catch {
        /* ignore */
      }
    }
  });

  // 페이지 안정화 대기 + 충분한 스크롤로 lazy 로드 트리거
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  try {
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(1500);
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(1500);
  } catch {
    /* ignore */
  }

  // 3) /api/v2/reservations 응답에서 직접 추출 (DOM 보다 안정적)
  const results = [];
  for (const cap of captured) {
    if (!cap.url.includes('/api/v2/reservations')) continue;
    const list = cap.payload?.reservations;
    if (!Array.isArray(list)) continue;
    for (const x of list) {
      try {
        const earnings = parseEarnings(x.earnings);
        results.push({
          platform: 'airbnb',
          confirmationCode: x.confirmation_code,
          guestName: x.guest_user?.full_name ?? '',
          country: mapCountry(x.guest_user?.location),
          checkIn: x.start_date,
          checkOut: x.end_date,
          nights: x.nights,
          guests: x.guest_details?.number_of_guests ?? 1,
          revenue: earnings,
          listingId: x.listing_id_str ?? String(x.listing_id ?? ''),
          listingName: x.listing_name,
          status: x.user_facing_status_key,
        });
      } catch (e) {
        console.warn('[airbnb] 행 파싱 실패:', e.message);
      }
    }
  }

  // 4) 캡처된 GraphQL/JSON 응답 디스크에 저장 (디버깅 + 패턴 분석용)
  if (captured.length > 0) {
    ensureDir(DEBUG_DIR);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dumpPath = join(DEBUG_DIR, `airbnb-network-${ts}.json`);
    // 너무 큰 응답은 잘라서 저장 (각 응답 최대 100KB)
    const trimmed = captured.map((c) => {
      const s = JSON.stringify(c.payload);
      return {
        url: c.url,
        size: s.length,
        payload: s.length > 100_000 ? JSON.parse(s.slice(0, 100_000) + '"}') : c.payload,
      };
    });
    try {
      writeFileSync(dumpPath, JSON.stringify(trimmed, null, 2), 'utf8');
      console.log(`[airbnb] 네트워크 응답 ${captured.length}개 → ${dumpPath}`);
    } catch (e) {
      // truncation may produce invalid JSON — fall back to URL list only
      const urlsOnly = captured.map((c) => ({ url: c.url, size: JSON.stringify(c.payload).length }));
      writeFileSync(dumpPath, JSON.stringify(urlsOnly, null, 2), 'utf8');
      console.log(`[airbnb] 네트워크 응답 URL 목록 → ${dumpPath} (payload 저장 실패: ${e.message})`);
    }
  }

  if (results.length === 0) {
    await saveDebugScreenshot(page, 'airbnb-empty');
    console.warn(
      '[airbnb] DOM 추출 0건. 캡처된 네트워크 응답을 분석하거나 --headed 로 셀렉터 확인 필요.',
    );
  }

  return { rows: results };
}

function parseEarnings(s) {
  if (typeof s === 'number') return s;
  if (typeof s !== 'string') return null;
  const m = s.replace(/[^\d.-]/g, '');
  if (!m) return null;
  const n = Number(m);
  return Number.isFinite(n) ? Math.round(n) : null;
}

const COUNTRY_NAME_TO_ISO = {
  China: 'CN',
  Japan: 'JP',
  'South Korea': 'KR',
  Korea: 'KR',
  Taiwan: 'TW',
  'Hong Kong': 'HK',
  Singapore: 'SG',
  Thailand: 'TH',
  Vietnam: 'VN',
  Malaysia: 'MY',
  Philippines: 'PH',
  Indonesia: 'ID',
  India: 'IN',
  'United States': 'US',
  USA: 'US',
  Canada: 'CA',
  Mexico: 'MX',
  Brazil: 'BR',
  Argentina: 'AR',
  'United Kingdom': 'GB',
  UK: 'GB',
  Ireland: 'IE',
  France: 'FR',
  Germany: 'DE',
  Spain: 'ES',
  Italy: 'IT',
  Portugal: 'PT',
  Netherlands: 'NL',
  Belgium: 'BE',
  Switzerland: 'CH',
  Austria: 'AT',
  Sweden: 'SE',
  Norway: 'NO',
  Denmark: 'DK',
  Finland: 'FI',
  Poland: 'PL',
  Russia: 'RU',
  Turkey: 'TR',
  Australia: 'AU',
  'New Zealand': 'NZ',
};

function mapCountry(loc) {
  if (!loc) return 'KR';
  const trimmed = String(loc).trim();
  if (COUNTRY_NAME_TO_ISO[trimmed]) return COUNTRY_NAME_TO_ISO[trimmed];
  // location이 "Seoul, South Korea" 형태일 때 마지막 토큰 매칭
  const parts = trimmed.split(',').map((s) => s.trim());
  for (let i = parts.length - 1; i >= 0; i--) {
    if (COUNTRY_NAME_TO_ISO[parts[i]]) return COUNTRY_NAME_TO_ISO[parts[i]];
  }
  return 'KR';
}

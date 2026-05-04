// Booking.com Extranet 예약 스크래퍼
import { saveDebugScreenshot } from '../lib/browser.mjs';

export const meta = {
  name: 'booking',
  loginUrl: 'https://account.booking.com/sign-in',
  // Extranet 메인 또는 hotel.* 도메인 진입 시 로그인 성공
  successUrlPattern: /(account\.booking\.com\/[^/]*\/dashboard|admin\.booking\.com|hotel\.booking\.com|account\.booking\.com\/properties)/,
};

const RESERVATION_URLS = [
  // 다중 호텔이면 hotel_id 파라미터 자동 결정 어려움. 사용자가 첫 진입 시 선택 후 URL 캐시.
  'https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/booking.html',
  'https://account.booking.com/properties',
];

export async function scrapeBookings({ page }) {
  // Booking Extranet은 호텔별로 별도 컨텍스트가 필요 — 첫 페이지를 일단 열고 사용자가 URL 패턴 확인
  let entered = false;
  for (const url of RESERVATION_URLS) {
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded' });
      if (resp && resp.status() < 400 && !page.url().includes('/sign-in')) {
        entered = true;
        break;
      }
    } catch (e) {
      console.warn(`[booking] ${url} 실패: ${e.message}`);
    }
  }
  if (!entered) {
    throw new Error('Booking 익스트라넷 진입 실패 (세션 만료 또는 호텔 선택 필요).');
  }

  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

  // Booking 익스트라넷의 예약 테이블은 일반적으로 #reservations_table tbody tr
  const rowSelectors = [
    'table#reservations_table tbody tr',
    'table[data-testid*="reservation"] tbody tr',
    'div[data-testid*="reservation-row"]',
    '.bui-table__body .bui-table__row',
  ];

  const results = [];
  for (const sel of rowSelectors) {
    const rows = await page.locator(sel).all();
    if (rows.length === 0) continue;
    for (const row of rows.slice(0, 200)) {
      try {
        const cells = await row.locator('td, [role="cell"]').allInnerTexts();
        const text = cells.join(' | ').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const dateMatch = text.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
        if (!dateMatch) continue;
        const amountMatch = text.match(/(?:KRW|₩)\s*([\d,]+)/i);
        // 게스트명: 첫 셀이 보통 이름. 우측 메타와 분리
        const guestName = cells[0]?.trim() ?? '';
        results.push({
          platform: 'booking',
          guestName,
          checkIn: `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`,
          revenue: amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : null,
          rawText: text.slice(0, 200),
        });
      } catch {
        /* skip */
      }
    }
    if (results.length > 0) break;
  }

  if (results.length === 0) {
    await saveDebugScreenshot(page, 'booking-empty');
    console.warn(
      '[booking] 추출 0건. --headed 모드로 셀렉터 확인 필요.',
    );
  }

  return { rows: results };
}

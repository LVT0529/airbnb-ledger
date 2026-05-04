// Agoda YCS (Yield Control System) 예약 스크래퍼
import { saveDebugScreenshot } from '../lib/browser.mjs';

export const meta = {
  name: 'agoda',
  loginUrl: 'https://ycs.agoda.com/mldc/en-us/public/login',
  successUrlPattern: /ycs\.agoda\.com\/(mldc\/en-us\/(home|property|booking|reservation)|en-us\/dashboard)/,
};

const RESERVATION_URLS = [
  'https://ycs.agoda.com/mldc/en-us/booking/list',
  'https://ycs.agoda.com/en-us/booking/list',
  'https://ycs.agoda.com/mldc/en-us/booking',
];

export async function scrapeBookings({ page }) {
  let entered = false;
  for (const url of RESERVATION_URLS) {
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded' });
      if (resp && resp.status() < 400 && !page.url().toLowerCase().includes('login')) {
        entered = true;
        break;
      }
    } catch (e) {
      console.warn(`[agoda] ${url} 실패: ${e.message}`);
    }
  }
  if (!entered) {
    throw new Error('Agoda YCS 진입 실패 (세션 만료 또는 페이지 변경)');
  }

  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

  const rowSelectors = [
    'table.booking-list tbody tr',
    '[data-testid*="booking-row"]',
    'div[role="row"]',
    'table tbody tr',
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
        const amountMatch = text.match(/(?:KRW|USD|₩|\$)\s*([\d,]+(?:\.\d+)?)/i);
        results.push({
          platform: 'agoda',
          guestName: cells[0]?.trim() ?? '',
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
    await saveDebugScreenshot(page, 'agoda-empty');
    console.warn('[agoda] 추출 0건. --headed 모드로 셀렉터 확인 필요.');
  }

  return { rows: results };
}

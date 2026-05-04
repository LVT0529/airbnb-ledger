// Airbnb 호스트 예약 스크래퍼
// 로그인 후 /hosting/reservations 진입 → DOM 또는 내부 API 응답에서 게스트·박수·금액 추출
import { saveDebugScreenshot } from '../lib/browser.mjs';

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
      url.includes('reservation')
    ) {
      try {
        const ct = resp.headers()['content-type'] ?? '';
        if (ct.includes('json')) {
          const j = await resp.json();
          captured.push(j);
        }
      } catch {
        /* ignore */
      }
    }
  });

  // 페이지 안정화 대기
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});

  // 3) DOM 폴백: 행 셀렉터 시도
  // 셀렉터는 변동 가능. 사용자 환경에서 --headed 로 확인 후 보정 필요.
  const rows = await page
    .locator(
      '[data-testid*="reservation"], [data-testid*="booking-row"], tr:has(td)',
    )
    .all();

  const results = [];
  for (const row of rows.slice(0, 100)) {
    try {
      const text = (await row.innerText()).replace(/\s+/g, ' ').trim();
      if (!text) continue;
      // 매우 단순한 패턴 매칭. 실제 구조 본 뒤 보정 필요.
      const dateMatch = text.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
      const nameMatch = text.match(/[가-힣A-Za-z][가-힣A-Za-z .'-]{1,40}/);
      const amountMatch = text.match(/[₩\$]\s*([\d,]+)/);
      if (!dateMatch || !nameMatch) continue;
      results.push({
        platform: 'airbnb',
        guestName: nameMatch[0].trim(),
        checkIn: `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`,
        revenue: amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : null,
        rawText: text.slice(0, 200),
      });
    } catch {
      /* skip */
    }
  }

  // 4) 캡처된 GraphQL/JSON 응답 dump (디버깅용으로 실제 추출은 사용자가 보고 보정)
  if (results.length === 0 && captured.length > 0) {
    console.warn(
      `[airbnb] DOM 추출 실패. 네트워크 응답 ${captured.length}개 캡처됨 (debug/airbnb-network.json 저장).`,
    );
    return { rows: [], _capturedNetwork: captured.slice(0, 5) };
  }

  if (results.length === 0) {
    await saveDebugScreenshot(page, 'airbnb-empty');
    console.warn(
      '[airbnb] 추출 0건. --headed 모드로 실제 셀렉터 확인 필요.',
    );
  }

  return { rows: results };
}

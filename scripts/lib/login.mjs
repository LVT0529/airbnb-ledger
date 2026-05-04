import { existsSync, rmSync } from 'node:fs';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import {
  authStatePath,
  createContext,
  launchBrowser,
  saveDebugScreenshot,
} from './browser.mjs';

async function waitForLoginCompletion(page, successUrlPattern) {
  console.log('\n로그인 화면이 열렸습니다. 브라우저에서 직접 로그인하세요.');
  console.log('(이메일/SMS/OTP/2FA 어떤 방식이든 가능)\n');

  const rl = createInterface({ input, output });
  const askPromise = rl.question(
    '로그인 완료 후 이 터미널에 ENTER 누르세요: ',
  );

  let urlPromise = Promise.resolve(null);
  if (successUrlPattern) {
    urlPromise = page
      .waitForURL(successUrlPattern, { timeout: 0 })
      .then(() => 'url')
      .catch(() => null);
  }

  const result = await Promise.race([askPromise.then(() => 'enter'), urlPromise]);
  rl.close();

  if (result === 'url') {
    console.log('[info] 로그인된 상태가 감지되었습니다.');
  }
}

/**
 * platform: 'airbnb' | 'booking' | 'agoda'
 * loginUrl: 로그인 페이지 URL
 * successUrlPattern: 로그인 후 자동 이동되는 URL의 정규식
 * force: 기존 세션 삭제 후 재로그인
 */
export async function runLoginFlow({
  platform,
  loginUrl,
  successUrlPattern,
  force = false,
}) {
  const path = authStatePath(platform);
  if (force && existsSync(path)) {
    rmSync(path, { force: true });
    console.log(`[login:${platform}] 기존 세션 삭제`);
  }

  console.log(`[login:${platform}] 헤드풀 모드로 로그인 절차 진행`);
  const browser = await launchBrowser({ headed: true });
  let context;
  try {
    context = await createContext(browser, { platform, useAuth: false });
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
    await waitForLoginCompletion(page, successUrlPattern);

    await context.storageState({ path });
    console.log(`[login:${platform}] 인증 상태 저장 완료: ${path}`);
  } catch (err) {
    console.error(`[login:${platform}] 실패:`, err?.message ?? err);
    if (context) {
      const pages = context.pages();
      if (pages[0]) await saveDebugScreenshot(pages[0], `login-${platform}-error`);
    }
    throw err;
  } finally {
    await browser.close();
  }
}

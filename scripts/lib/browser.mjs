import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SCRIPTS_DIR = join(__dirname, '..');
export const DEBUG_DIR = join(SCRIPTS_DIR, 'debug');

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const VIEWPORT = { width: 1440, height: 900 };

export function authStatePath(platform) {
  return join(SCRIPTS_DIR, `auth-state-${platform}.json`);
}

export function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

async function applyAntiDetection(context) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['ko-KR', 'ko', 'en-US', 'en'],
    });
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
  });
}

export async function launchBrowser({ headed = false } = {}) {
  return await chromium.launch({ headless: !headed });
}

export async function createContext(browser, { platform, useAuth = true }) {
  const path = authStatePath(platform);
  const ctx = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: VIEWPORT,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    storageState: useAuth && existsSync(path) ? path : undefined,
    acceptDownloads: true,
  });
  await applyAntiDetection(ctx);
  return ctx;
}

export async function saveDebugScreenshot(page, label) {
  try {
    ensureDir(DEBUG_DIR);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const path = join(DEBUG_DIR, `${label}-${ts}.png`);
    await page.screenshot({ path, fullPage: true });
    console.error(`[debug] 스크린샷 저장: ${path}`);
  } catch (err) {
    console.error('[debug] 스크린샷 실패:', err?.message ?? err);
  }
}

export function hasAuthState(platform) {
  return existsSync(authStatePath(platform));
}

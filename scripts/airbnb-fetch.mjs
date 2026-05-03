#!/usr/bin/env node
import { chromium } from 'playwright';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = __dirname;
const AUTH_STATE_PATH = join(SCRIPTS_DIR, 'auth-state.json');
const DOWNLOADS_DIR = join(SCRIPTS_DIR, 'downloads');
const DEBUG_DIR = join(SCRIPTS_DIR, 'debug');

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const VIEWPORT = { width: 1440, height: 900 };
const NAV_TIMEOUT = 60_000;

function parseArgs(argv) {
  const args = { headed: false, login: false, month: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--headed') args.headed = true;
    else if (a === '--login') args.login = true;
    else if (a === '--month') args.month = argv[++i];
    else if (a.startsWith('--month=')) args.month = a.slice('--month='.length);
    else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/airbnb-fetch.mjs [options]

Options:
  --month YYYY-MM   대상 월 (기본: 이번 달)
  --headed          헤드풀 모드 (디버깅용)
  --login           강제 재로그인 (auth-state.json 삭제)
  -h, --help        도움말 출력
`);
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function validateMonth(m) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) {
    throw new Error(`잘못된 month 형식: "${m}". YYYY-MM 형식이어야 합니다.`);
  }
}

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

async function applyAntiDetection(context) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    // 일반적으로 봇 탐지에서 보는 속성들
    Object.defineProperty(navigator, 'languages', {
      get: () => ['ko-KR', 'ko', 'en-US', 'en'],
    });
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
  });
}

async function createContext(browser, { useAuth }) {
  const ctx = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: VIEWPORT,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    storageState: useAuth && existsSync(AUTH_STATE_PATH) ? AUTH_STATE_PATH : undefined,
    acceptDownloads: true,
  });
  await applyAntiDetection(ctx);
  return ctx;
}

async function saveDebugScreenshot(page, label) {
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

async function waitForLoginCompletion(page) {
  console.log('\n로그인 화면이 열렸습니다. 브라우저에서 직접 로그인하세요.');
  console.log('(이메일/SMS/Google/Facebook 등 어떤 방식이든 가능)\n');

  const rl = createInterface({ input, output });
  const askPromise = rl.question('로그인 완료 후 이 터미널에 ENTER를 누르세요: ');

  // URL이 hosting/account 등으로 자동 이동하는 경우도 감지하여 안내
  const urlPromise = page
    .waitForURL(/\/(hosting|account|users|reservations|earnings|trips)/, {
      timeout: 0,
    })
    .then(() => 'url')
    .catch(() => null);

  const result = await Promise.race([askPromise.then(() => 'enter'), urlPromise]);
  rl.close();

  if (result === 'url') {
    console.log('[info] 로그인된 상태가 감지되었습니다.');
  }
}

async function runLoginFlow(args) {
  console.log('[login] 첫 실행: 헤드풀 모드로 로그인 절차 진행');
  if (existsSync(AUTH_STATE_PATH) && args.login) {
    rmSync(AUTH_STATE_PATH, { force: true });
    console.log('[login] 기존 auth-state.json 삭제 완료');
  }

  const browser = await chromium.launch({ headless: false });
  let context;
  try {
    context = await createContext(browser, { useAuth: false });
    const page = await context.newPage();
    page.setDefaultTimeout(NAV_TIMEOUT);
    await page.goto('https://www.airbnb.com/login', { waitUntil: 'domcontentloaded' });
    await waitForLoginCompletion(page);

    await context.storageState({ path: AUTH_STATE_PATH });
    console.log(`[login] 인증 상태 저장 완료: ${AUTH_STATE_PATH}`);
  } catch (err) {
    console.error('[login] 실패:', err?.message ?? err);
    if (context) {
      const pages = context.pages();
      if (pages[0]) await saveDebugScreenshot(pages[0], 'login-error');
    }
    throw err;
  } finally {
    await browser.close();
  }
}

// 거래내역/수익 페이지 진입을 여러 fallback 으로 시도
async function navigateToEarnings(page, monthStr) {
  // 1) 직접 transaction history URL
  const directCandidates = [
    'https://www.airbnb.com/hosting/reservations/transaction-history',
    'https://www.airbnb.com/users/transaction_history',
    'https://www.airbnb.com/hosting/earnings',
  ];

  for (const url of directCandidates) {
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded' });
      if (resp && resp.status() < 400) {
        // 로그인 만료 등으로 /login 으로 redirect 됐는지 체크
        if (page.url().includes('/login')) {
          throw new Error('세션 만료: 다시 로그인이 필요합니다 (--login).');
        }
        console.log(`[nav] 페이지 진입 성공: ${page.url()}`);
        return;
      }
    } catch (err) {
      console.warn(`[nav] ${url} 진입 실패: ${err.message}`);
    }
  }
  throw new Error('거래내역/수익 페이지 진입에 실패했습니다.');
}

// 기간 선택 시도 (UI 변경에 대비해 여러 셀렉터)
async function trySelectMonth(page, monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  console.log(`[filter] 대상 월: ${year}-${String(month).padStart(2, '0')}`);

  // 흔한 셀렉터 후보들. 깨지면 --headed 로 직접 확인 필요.
  const yearSelectorCandidates = [
    'select[name="year"]',
    'select[aria-label*="연도" i]',
    'select[aria-label*="year" i]',
  ];
  const monthSelectorCandidates = [
    'select[name="month"]',
    'select[aria-label*="월" i]',
    'select[aria-label*="month" i]',
  ];

  const trySelect = async (candidates, value) => {
    for (const sel of candidates) {
      const el = page.locator(sel).first();
      if (await el.count()) {
        try {
          await el.selectOption(String(value));
          return true;
        } catch {
          /* keep trying */
        }
      }
    }
    return false;
  };

  const yearOk = await trySelect(yearSelectorCandidates, year);
  const monthOk = await trySelect(monthSelectorCandidates, month);

  if (!yearOk || !monthOk) {
    console.warn(
      '[filter] 기간 셀렉터를 자동으로 못 찾았습니다. 페이지 기본값으로 진행합니다.'
    );
    console.warn('         --headed 모드로 실행하여 셀렉터를 직접 확인해 보세요.');
  } else {
    console.log('[filter] 연/월 선택 완료');
    // 선택 후 결과 갱신을 잠깐 기다림
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  }
}

async function clickCsvDownload(page) {
  const candidates = [
    page.getByRole('button', { name: /CSV.*(다운로드|download)/i }),
    page.getByRole('link', { name: /CSV.*(다운로드|download)/i }),
    page.getByRole('button', { name: /다운로드/i }),
    page.getByText(/CSV로 내보내기/i),
    page.getByText(/Export.*CSV/i),
    page.locator('a[href*=".csv"]'),
    page.locator('button:has-text("CSV")'),
  ];

  for (const c of candidates) {
    try {
      const count = await c.count();
      if (count > 0) {
        const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
        await c.first().click({ timeout: 5_000 });
        const download = await downloadPromise;
        return download;
      }
    } catch {
      /* keep trying */
    }
  }
  throw new Error('CSV 다운로드 버튼을 찾지 못했습니다. --headed 로 셀렉터 확인 필요.');
}

async function runFetchFlow(args) {
  if (!existsSync(AUTH_STATE_PATH)) {
    console.log('[fetch] auth-state.json 없음 → 로그인 절차로 전환');
    await runLoginFlow({ ...args, login: false });
    console.log('[fetch] 로그인 완료. 다시 실행해 데이터를 가져오세요.');
    return;
  }

  ensureDir(DOWNLOADS_DIR);
  const monthStr = args.month ?? currentMonth();
  validateMonth(monthStr);

  const browser = await chromium.launch({ headless: !args.headed });
  let context;
  try {
    context = await createContext(browser, { useAuth: true });
    const page = await context.newPage();
    page.setDefaultTimeout(NAV_TIMEOUT);

    await navigateToEarnings(page, monthStr);
    await trySelectMonth(page, monthStr);

    console.log('[fetch] CSV 다운로드 시도...');
    const download = await clickCsvDownload(page);
    const targetPath = join(DOWNLOADS_DIR, `airbnb-${monthStr}.csv`);
    await download.saveAs(targetPath);

    console.log(`\n다운로드 완료: ${targetPath}`);
  } catch (err) {
    console.error('[fetch] 실패:', err?.message ?? err);
    if (context) {
      const pages = context.pages();
      if (pages[0]) await saveDebugScreenshot(pages[0], 'fetch-error');
    }
    throw err;
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.login) {
    await runLoginFlow(args);
    return;
  }

  await runFetchFlow(args);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

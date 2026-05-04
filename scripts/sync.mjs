#!/usr/bin/env node
// 사용: node scripts/sync.mjs [<platform> | all] [--headed]
// 결과는 scripts/downloads/<platform>-<timestamp>.json 으로 저장
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createContext,
  ensureDir,
  hasAuthState,
  launchBrowser,
  saveDebugScreenshot,
  SCRIPTS_DIR,
} from './lib/browser.mjs';
import * as airbnb from './platforms/airbnb.mjs';
import * as booking from './platforms/booking.mjs';
import * as agoda from './platforms/agoda.mjs';

const PLATFORMS = { airbnb, booking, agoda };
const DOWNLOADS_DIR = join(SCRIPTS_DIR, 'downloads');

function printHelp() {
  console.log(`Usage: node scripts/sync.mjs [<platform>|all] [--headed]

Platforms:
  airbnb | booking | agoda | all

Options:
  --headed  헤드풀 모드 (디버깅용)

선결 조건: 각 플랫폼에 대해 먼저 'node scripts/login.mjs <platform>' 실행 필요.
`);
}

async function syncOne(platform, { headed }) {
  const mod = PLATFORMS[platform];
  if (!mod) throw new Error(`알 수 없는 플랫폼: ${platform}`);

  if (!hasAuthState(mod.meta.name)) {
    console.warn(
      `[sync:${platform}] auth-state 없음. 'node scripts/login.mjs ${platform}' 먼저 실행하세요.`,
    );
    return { platform, rows: [], skipped: true };
  }

  const browser = await launchBrowser({ headed });
  let context;
  try {
    context = await createContext(browser, {
      platform: mod.meta.name,
      useAuth: true,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    console.log(`[sync:${platform}] 스크래핑 시작…`);
    const result = await mod.scrapeBookings({ page });
    console.log(`[sync:${platform}] 추출 ${result.rows.length}건`);
    return { platform, ...result };
  } catch (err) {
    console.error(`[sync:${platform}] 실패: ${err?.message ?? err}`);
    if (context) {
      const pages = context.pages();
      if (pages[0]) await saveDebugScreenshot(pages[0], `${platform}-error`);
    }
    return { platform, rows: [], error: String(err?.message ?? err) };
  } finally {
    await browser.close();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help')) {
    printHelp();
    process.exit(0);
  }
  const headed = argv.includes('--headed');
  const target = argv.find((a) => !a.startsWith('--')) ?? 'all';

  const targets =
    target === 'all'
      ? Object.keys(PLATFORMS)
      : [target];

  ensureDir(DOWNLOADS_DIR);
  const out = {
    fetchedAt: new Date().toISOString(),
    results: [],
  };

  for (const p of targets) {
    const r = await syncOne(p, { headed });
    out.results.push(r);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = join(DOWNLOADS_DIR, `bookings-${ts}.json`);
  writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`\n저장 완료: ${outPath}`);
  console.log(
    '결과를 검토한 뒤 앱의 JSON import 또는 직접 매칭 처리에 사용하세요.',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

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
import { pushBookings } from './lib/supabase.mjs';
import * as airbnb from './platforms/airbnb.mjs';
import * as booking from './platforms/booking.mjs';
import * as agoda from './platforms/agoda.mjs';

const PLATFORMS = { airbnb, booking, agoda };
const DOWNLOADS_DIR = join(SCRIPTS_DIR, 'downloads');

function printHelp() {
  console.log(`Usage: node scripts/sync.mjs [<platform>|all] [--headed] [--push]

Platforms:
  airbnb | booking | agoda | all

Options:
  --headed  헤드풀 모드 (디버깅용)
  --push    추출 후 Supabase 의 기존 bookings 와 confirmation_code 로 매칭하여
            guest_name / country / revenue / nights / guests 자동 업데이트
            (.env.local 에 SUPABASE_SERVICE_ROLE_KEY 필요)

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

  // --push: Supabase 매칭 업데이트
  if (argv.includes('--push')) {
    console.log('\n[push] Supabase 매칭 업데이트 시작…');
    for (const r of out.results) {
      if (!r.rows?.length) continue;
      try {
        const stats = await pushBookings(r.rows);
        console.log(
          `[push:${r.platform}] 매칭 ${stats.matched}건 · 업데이트 ${stats.updated}건 · 누락 ${stats.missed}건`,
        );
        if (stats.errors.length > 0) {
          console.warn(`[push:${r.platform}] 오류 ${stats.errors.length}건`);
          stats.errors.slice(0, 5).forEach((e) => console.warn('  ', e));
        }
      } catch (e) {
        console.error(`[push:${r.platform}] 실패: ${e?.message ?? e}`);
      }
    }
  } else {
    console.log(
      '결과를 검토한 뒤 --push 옵션으로 다시 실행하면 Supabase 와 자동 매칭됩니다.',
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

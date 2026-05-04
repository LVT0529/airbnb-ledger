#!/usr/bin/env node
// 사용: node scripts/login.mjs <platform> [--force]
// platform: airbnb | booking | agoda
import { runLoginFlow } from './lib/login.mjs';
import * as airbnb from './platforms/airbnb.mjs';
import * as booking from './platforms/booking.mjs';
import * as agoda from './platforms/agoda.mjs';

const PLATFORMS = { airbnb, booking, agoda };

function printHelp() {
  console.log(`Usage: node scripts/login.mjs <platform> [--force]

Platforms:
  airbnb   — https://www.airbnb.co.kr
  booking  — https://account.booking.com
  agoda    — https://ycs.agoda.com

Options:
  --force  기존 세션 삭제 후 재로그인
`);
}

async function main() {
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const platform = argv.find((a) => !a.startsWith('--'));
  if (!platform || !PLATFORMS[platform]) {
    printHelp();
    process.exit(platform ? 1 : 0);
  }
  const { meta } = PLATFORMS[platform];
  await runLoginFlow({
    platform: meta.name,
    loginUrl: meta.loginUrl,
    successUrlPattern: meta.successUrlPattern,
    force,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

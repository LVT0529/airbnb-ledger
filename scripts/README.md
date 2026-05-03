# Airbnb 수익 자동 수집 스크립트

Playwright 기반으로 Airbnb 호스트 페이지에 로그인하여 거래내역(CSV)을 자동으로 내려받습니다.

## 첫 사용 단계

```bash
# 1. 의존성 설치 (이미 했다면 skip)
pnpm install

# 2. Playwright용 Chromium 브라우저 설치 (최초 1회)
npx playwright install chromium

# 3. 첫 실행 — 헤드풀 브라우저가 뜨고 로그인 화면으로 이동합니다.
#    이메일/SMS/Google 어떤 방식이든 로그인을 마친 뒤,
#    터미널에 ENTER 를 눌러 세션을 저장하세요.
pnpm fetch:airbnb --login

# 4. 두 번째 실행부터는 헤드리스로 자동 동작 (기본: 이번 달)
pnpm fetch:airbnb

# 또는 특정 월 지정
pnpm fetch:airbnb --month 2026-04
```

다운로드된 CSV 는 `scripts/downloads/airbnb-YYYY-MM.csv` 에 저장됩니다.

## CLI 옵션

| 옵션 | 설명 |
| --- | --- |
| `--month YYYY-MM` | 가져올 월 지정 (기본: 이번 달) |
| `--headed` | 브라우저 창을 띄워 실행 (디버깅용) |
| `--login` | `auth-state.json` 을 삭제하고 로그인 흐름 다시 진행 |
| `-h`, `--help` | 도움말 출력 |

## 동작 방식

- 첫 실행 시 `scripts/auth-state.json` 에 쿠키/세션을 저장합니다.
- 이후 실행은 이 파일을 사용해 즉시 로그인 상태로 진입합니다.
- 세션 만료 시 다시 `--login` 으로 갱신하세요.
- 모든 산출물(`auth-state.json`, `downloads/`, `debug/`)은 git ignore 됩니다.

## 셀렉터가 깨졌을 때 디버깅

Airbnb 의 호스트 UI 는 자주 바뀝니다. 거래내역 페이지 진입 / 기간 선택 / CSV 버튼 등이
실패하는 경우 다음 순서로 점검하세요.

1. `--headed` 로 실행하여 브라우저 화면을 직접 관찰합니다.
   ```bash
   pnpm fetch:airbnb --headed --month 2026-04
   ```
2. 에러 발생 시 `scripts/debug/*.png` 에 자동으로 스크린샷이 남습니다.
3. 변경된 셀렉터가 있다면 `scripts/airbnb-fetch.mjs` 안의 후보 배열
   (`directCandidates`, `yearSelectorCandidates`, `monthSelectorCandidates`,
   `clickCsvDownload` 의 `candidates`) 을 수정하면 됩니다.
4. Airbnb 가 봇 탐지로 차단하는 경우, `--login` 으로 세션을 새로 만들고
   동일 IP / 동일 UA 환경에서 재시도하세요.

## 가계부 앱에 업로드

1. 위 절차로 `scripts/downloads/airbnb-YYYY-MM.csv` 를 확보합니다.
2. 가계부 PWA 앱을 엽니다 (`pnpm dev` 또는 배포 URL).
3. **설정 → Airbnb 수익 가져오기** 메뉴로 이동합니다.
4. 다운로드한 CSV 파일을 업로드하면 자동으로 거래내역이 가계부에 반영됩니다.

## 보안 주의

- `auth-state.json` 에는 로그인 세션 쿠키가 들어 있습니다. 절대 외부에 공유하거나
  커밋하지 마세요. (`.gitignore` 로 기본 차단됨)
- 공용 PC에서 실행하지 마세요.
- 사용 후 더 이상 필요 없다면 `auth-state.json` 을 삭제하거나 `--login` 으로 재발급
  주기를 짧게 가져가세요.

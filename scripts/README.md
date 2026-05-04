# 멀티 플랫폼 예약 수집 스크립트

Playwright 기반으로 Airbnb / Booking.com / Agoda YCS 에 로그인해 호스트 예약 정보(게스트, 박수, 매출 등)를 가져옵니다.

**설계 원칙**
- 비밀번호는 **로컬 PC 외부로 절대 나가지 않음** (수동 로그인 → 세션 쿠키만 저장)
- 세션 파일은 플랫폼별 분리: `auth-state-airbnb.json` / `auth-state-booking.json` / `auth-state-agoda.json`
- 모두 `.gitignore` 처리됨
- 추출 결과는 JSON 으로 저장 → 사용자가 검토 후 가계부에 반영

## 처음 한 번만

```bash
pnpm install
npx playwright install chromium
```

## 플랫폼별 로그인 (헤드풀, 한 번만)

```bash
node scripts/login.mjs airbnb
node scripts/login.mjs booking
node scripts/login.mjs agoda
```

각 명령은 헤드풀 브라우저를 띄우고 로그인 페이지로 이동합니다. 직접 로그인 (이메일/OTP/2FA 모두 가능)을 마친 뒤 터미널에 **ENTER** 를 누르면 세션이 `scripts/auth-state-<platform>.json` 에 저장돼요.

세션 만료 시 `--force` 로 재로그인:

```bash
node scripts/login.mjs airbnb --force
```

## 예약 수집

```bash
# 모든 플랫폼 한 번에
node scripts/sync.mjs all

# 특정 플랫폼만
node scripts/sync.mjs airbnb
node scripts/sync.mjs booking
node scripts/sync.mjs agoda

# 디버깅: 브라우저 창 보면서 실행
node scripts/sync.mjs all --headed
```

### Supabase 자동 매칭 + 업데이트 (--push)

iCal 동기화로 만들어진 "매출 미입력" pending 예약을 자동으로 채우려면 `--push`:

```bash
node scripts/sync.mjs airbnb --push
node scripts/sync.mjs all --push
```

매칭 키: `confirmation_code` (Airbnb HM... 코드).
업데이트 필드: `guest_name`, `country`, `guests`, `nights`, `revenue`,
그리고 매출이 0보다 크면 status `pending → confirmed` 전이.

**선결**: `scripts/.env.local` (또는 프로젝트 루트 `.env.local`) 에 Supabase
service role key 추가:

```bash
# .env.local (gitignore 처리됨)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

키 발급: Supabase 대시보드 → Project Settings → API → `service_role` 키 복사.
주의: service_role 은 RLS 우회. 절대 외부에 공유 금지.

---

결과는 `scripts/downloads/bookings-YYYY-MM-DDTHH-MM-SS.json` 으로 저장됩니다. 형식:

```json
{
  "fetchedAt": "2026-05-04T10:00:00.000Z",
  "results": [
    {
      "platform": "airbnb",
      "rows": [
        { "platform": "airbnb", "guestName": "Mango Lee", "checkIn": "2026-05-10", "revenue": 320000, "rawText": "..." }
      ]
    },
    { "platform": "booking", "rows": [...] },
    { "platform": "agoda", "rows": [...] }
  ]
}
```

## 셀렉터 깨졌을 때

플랫폼 UI 변경으로 추출 0건이 나오면:

1. `--headed` 로 실행해 화면 확인
2. `scripts/debug/*.png` 에 실패 시점 스크린샷 자동 저장됨
3. `scripts/platforms/<platform>.mjs` 의 `RESERVATION_URLS` 와 `rowSelectors` 배열에 셀렉터 후보 추가
4. Booking / Agoda 는 호텔별 컨텍스트 선택이 필요할 수 있음 → 처음 진입한 URL 을 그대로 `RESERVATION_URLS` 에 넣어주면 됨

## 보안

- `auth-state-*.json` 은 로그인 세션 쿠키 포함 → 외부 유출 금지 (`.gitignore` 차단)
- 공용 PC 에서 실행하지 마세요
- 사용 빈도 낮으면 작업 후 세션 파일 삭제 권장

## 레거시 스크립트

기존 `airbnb-fetch.mjs` (CSV 다운로드 전용) 도 그대로 유지됩니다:

```bash
pnpm fetch:airbnb --month 2026-04
```

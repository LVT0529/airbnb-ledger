-- iCal 동기화 + 임시(pending) 예약 지원

alter table properties add column if not exists ical_url text;

alter table bookings add column if not exists confirmation_code text;
alter table bookings add column if not exists status text not null default 'confirmed';

-- 같은 사용자 내 confirmation_code 중복 방지 (iCal 재동기화 시 업서트 키)
create unique index if not exists bookings_user_code_idx
  on bookings(user_id, confirmation_code)
  where confirmation_code is not null;

-- pending 예약은 매출 0이어도 OK
alter table bookings drop constraint if exists bookings_revenue_check;

notify pgrst, 'reload schema';

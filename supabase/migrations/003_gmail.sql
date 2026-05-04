-- Gmail OAuth 토큰 저장
create table if not exists user_google_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scopes text,
  email text,
  updated_at timestamptz default now()
);

alter table user_google_tokens enable row level security;

drop policy if exists "own_tokens" on user_google_tokens;
create policy "own_tokens" on user_google_tokens for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Gmail 동기화 상태 (마지막 처리 시점, 누적 통계)
create table if not exists gmail_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_sync_at timestamptz,
  last_processed_at timestamptz,
  total_processed int default 0,
  last_error text
);

alter table gmail_sync_state enable row level security;

drop policy if exists "own_state" on gmail_sync_state;
create policy "own_state" on gmail_sync_state for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 처리한 Gmail 메시지 ID 기록 (중복 방지)
create table if not exists gmail_processed_messages (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id text not null,
  processed_at timestamptz default now(),
  result_kind text, -- 'reservation' | 'cancellation' | 'payout' | 'unmatched'
  primary key (user_id, message_id)
);

alter table gmail_processed_messages enable row level security;

drop policy if exists "own_msgs" on gmail_processed_messages;
create policy "own_msgs" on gmail_processed_messages for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

notify pgrst, 'reload schema';

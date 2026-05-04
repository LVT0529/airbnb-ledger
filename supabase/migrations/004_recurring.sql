-- 정기 결제 비용 (매월 자동 추가)

create table if not exists recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid references properties(id) on delete cascade,
  category text not null,
  amount bigint not null,
  day_of_month int not null check (day_of_month between 1 and 31),
  notes text,
  active boolean not null default true,
  start_month text, -- 'YYYY-MM' (null이면 즉시)
  created_at timestamptz default now()
);

alter table recurring_expenses enable row level security;

drop policy if exists "own_recurring" on recurring_expenses;
create policy "own_recurring" on recurring_expenses for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- expenses에 추가: 어느 정기 결제에서 / 어느 월에 발생했는지 기록
alter table expenses add column if not exists source_recurring_id uuid;
alter table expenses add column if not exists source_year_month text;

-- (recurring_id, year_month) 한 쌍은 한 번만 — 중복 자동 추가 방지
create unique index if not exists expenses_recurring_unique
  on expenses(source_recurring_id, source_year_month)
  where source_recurring_id is not null;

alter publication supabase_realtime add table recurring_expenses;

notify pgrst, 'reload schema';

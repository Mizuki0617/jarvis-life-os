-- =====================================================
-- J.A.R.V.I.S. Personal OS — Supabase Schema
-- =====================================================

-- profiles（auth.usersを拡張）
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- daily_entries（日次入力データ）
create table if not exists public.daily_entries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  date date not null,
  scores jsonb not null default '{}'::jsonb,
  total integer default 0,
  label text,
  raw_inputs jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, date)
);

-- goals（目標管理）
create table if not exists public.goals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  dim text not null,
  target integer not null default 80,
  current_score integer default 0,
  created_at timestamptz default now()
);

-- =====================================================
-- Row Level Security（各ユーザーは自分のデータのみ）
-- =====================================================
alter table public.profiles enable row level security;
alter table public.daily_entries enable row level security;
alter table public.goals enable row level security;

create policy "own_profile" on public.profiles
  for all using (auth.uid() = id);

create policy "own_entries" on public.daily_entries
  for all using (auth.uid() = user_id);

create policy "own_goals" on public.goals
  for all using (auth.uid() = user_id);

-- =====================================================
-- サインアップ時にprofileを自動作成
-- =====================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', '')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

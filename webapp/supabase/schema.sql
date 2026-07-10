-- Run this once in your Supabase project's SQL Editor (Dashboard -> SQL Editor -> New query).
-- Creates the two tables LeetLocal uses to store your progress and saved code,
-- each scoped to your own account via Row Level Security.

create table if not exists progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  problem_id text not null,
  solved boolean not null default false,
  starred boolean not null default false,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, problem_id)
);

create table if not exists saved_code (
  user_id uuid not null references auth.users(id) on delete cascade,
  problem_id text not null,
  language text not null,
  code text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, problem_id, language)
);

alter table progress enable row level security;
alter table saved_code enable row level security;

create policy "Users manage their own progress"
  on progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own saved code"
  on saved_code for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Run this in your Supabase project's SQL Editor (Dashboard -> SQL Editor -> New query).
-- Creates the tables LeetLocal uses to store your progress, saved drafts, and solution
-- history, each scoped to your own account via Row Level Security.
--
-- Safe to re-run in full any time this file changes (e.g. after a schema update) --
-- table creation is guarded with IF NOT EXISTS and policies are dropped and recreated.

create table if not exists progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  problem_id text not null,
  solved boolean not null default false,
  starred boolean not null default false,
  notes text not null default '',
  solved_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, problem_id)
);

-- Added after the initial release, for existing databases created before this column existed.
alter table progress add column if not exists solved_at timestamptz;

-- Your current in-progress draft per problem/language, overwritten as you type.
create table if not exists saved_code (
  user_id uuid not null references auth.users(id) on delete cascade,
  problem_id text not null,
  language text not null,
  code text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, problem_id, language)
);

-- Timestamped snapshots created explicitly via "Save Solution" -- a problem can have many.
create table if not exists solution_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  problem_id text not null,
  language text not null,
  code text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists solution_history_user_problem_idx
  on solution_history (user_id, problem_id, created_at desc);

-- Custom test cases you add on top of a problem's built-in examples -- shared across languages,
-- since the input/output are stored as language-agnostic literal syntax (same as examples).
create table if not exists custom_test_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  problem_id text not null,
  input_text text not null,
  output_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists custom_test_cases_user_problem_idx
  on custom_test_cases (user_id, problem_id, created_at);

alter table progress enable row level security;
alter table saved_code enable row level security;
alter table solution_history enable row level security;
alter table custom_test_cases enable row level security;

drop policy if exists "Users manage their own progress" on progress;
create policy "Users manage their own progress"
  on progress for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage their own saved code" on saved_code;
create policy "Users manage their own saved code"
  on saved_code for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- History entries are append-only from the client: select/insert/delete, no update.
drop policy if exists "Users read their own solution history" on solution_history;
create policy "Users read their own solution history"
  on solution_history for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert their own solution history" on solution_history;
create policy "Users insert their own solution history"
  on solution_history for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users delete their own solution history" on solution_history;
create policy "Users delete their own solution history"
  on solution_history for delete
  using (auth.uid() = user_id);

drop policy if exists "Users read their own custom test cases" on custom_test_cases;
create policy "Users read their own custom test cases"
  on custom_test_cases for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert their own custom test cases" on custom_test_cases;
create policy "Users insert their own custom test cases"
  on custom_test_cases for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update their own custom test cases" on custom_test_cases;
create policy "Users update their own custom test cases"
  on custom_test_cases for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete their own custom test cases" on custom_test_cases;
create policy "Users delete their own custom test cases"
  on custom_test_cases for delete
  using (auth.uid() = user_id);

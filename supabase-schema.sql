-- ============================================================
-- SKEMA DATABASE — jalankan di SQL Editor Supabase
-- (Dashboard Supabase → SQL Editor → New query → paste → Run)
-- Aman dijalankan berulang (IF NOT EXISTS), tidak menghapus data lama.
-- ============================================================

-- 1. Tabel hasil latihan (satu sumber data untuk Writing & Speaking)
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('writing', 'speaking')),
  original_text text not null,
  corrected_text text,
  score numeric not null default 0 check (score >= 0 and score <= 100),
  error_categories jsonb not null default '[]'::jsonb,
  feedback jsonb not null default '{}'::jsonb,
  suggestions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists submissions_user_created_idx
  on public.submissions (user_id, created_at desc);

-- 2. Tabel rekomendasi YouTube (terhubung ke hasil latihan)
create table if not exists public.youtube_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid references public.submissions(id) on delete cascade,
  topic text not null default '',
  subtopic text not null default '',
  query text not null default '',
  video_id text not null,
  title text not null default '',
  channel_title text not null default '',
  thumbnail_url text not null default '',
  description text not null default '',
  published_at text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists yt_recs_submission_idx
  on public.youtube_recommendations (submission_id, created_at desc);

-- 3. RLS: user hanya boleh melihat/mengubah datanya sendiri
alter table public.submissions enable row level security;
alter table public.youtube_recommendations enable row level security;

drop policy if exists "submissions_select_own" on public.submissions;
create policy "submissions_select_own" on public.submissions
  for select using (auth.uid() = user_id);

drop policy if exists "submissions_insert_own" on public.submissions;
create policy "submissions_insert_own" on public.submissions
  for insert with check (auth.uid() = user_id);

drop policy if exists "submissions_delete_own" on public.submissions;
create policy "submissions_delete_own" on public.submissions
  for delete using (auth.uid() = user_id);

drop policy if exists "yt_recs_select_own" on public.youtube_recommendations;
create policy "yt_recs_select_own" on public.youtube_recommendations
  for select using (auth.uid() = user_id);

drop policy if exists "yt_recs_insert_own" on public.youtube_recommendations;
create policy "yt_recs_insert_own" on public.youtube_recommendations
  for insert with check (auth.uid() = user_id);

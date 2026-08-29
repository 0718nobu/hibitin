create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

drop policy if exists "Admins can read their own admin record" on public.admin_users;
create policy "Admins can read their own admin record"
  on public.admin_users
  for select
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.welcome_comment_master (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  comment text not null,
  is_active boolean not null default true,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists welcome_comment_master_active_order_idx
  on public.welcome_comment_master (is_active, sort_order);

create or replace function public.set_welcome_comment_master_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_welcome_comment_master_updated_at on public.welcome_comment_master;
create trigger set_welcome_comment_master_updated_at
  before update on public.welcome_comment_master
  for each row
  execute function public.set_welcome_comment_master_updated_at();

alter table public.welcome_comment_master enable row level security;

drop policy if exists "Anyone can read active welcome comments" on public.welcome_comment_master;
create policy "Anyone can read active welcome comments"
  on public.welcome_comment_master
  for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "Admins can read all welcome comments" on public.welcome_comment_master;
create policy "Admins can read all welcome comments"
  on public.welcome_comment_master
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );

drop policy if exists "Admins can insert welcome comments" on public.welcome_comment_master;
create policy "Admins can insert welcome comments"
  on public.welcome_comment_master
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );

drop policy if exists "Admins can update welcome comments" on public.welcome_comment_master;
create policy "Admins can update welcome comments"
  on public.welcome_comment_master
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );

drop policy if exists "Admins can delete welcome comments" on public.welcome_comment_master;
create policy "Admins can delete welcome comments"
  on public.welcome_comment_master
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );

create table if not exists public.welcome_comment_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_date date not null,
  streak_count integer not null default 1 check (streak_count >= 1),
  selected_comment_id text not null,
  selected_comment text not null,
  shown_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists welcome_comment_status_seen_date_idx
  on public.welcome_comment_status (last_seen_date);

create or replace function public.set_welcome_comment_status_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_welcome_comment_status_updated_at on public.welcome_comment_status;
create trigger set_welcome_comment_status_updated_at
  before update on public.welcome_comment_status
  for each row
  execute function public.set_welcome_comment_status_updated_at();

alter table public.welcome_comment_status enable row level security;

drop policy if exists "Users can read own welcome status" on public.welcome_comment_status;
create policy "Users can read own welcome status"
  on public.welcome_comment_status
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own welcome status" on public.welcome_comment_status;
create policy "Users can insert own welcome status"
  on public.welcome_comment_status
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own welcome status" on public.welcome_comment_status;
create policy "Users can update own welcome status"
  on public.welcome_comment_status
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

insert into public.welcome_comment_master
  (slug, comment, is_active, sort_order)
values
  ('welcome-comment-1', '今日も来てくれてうれしい。ゆるっといこう。', true, 10),
  ('welcome-comment-2', '待ってたよ。さて、今日はどんな日にしようか。', true, 20),
  ('welcome-comment-3', 'おかえり。今日もひとつずつ遊んでこう。', true, 30),
  ('welcome-comment-4', '今日もいい日にしちゃおう。', true, 40),
  ('welcome-comment-5', '今日のページ、開幕です。', true, 50),
  ('welcome-comment-6', '無理せず、でもちょっと楽しくいこう。', true, 60),
  ('welcome-comment-7', '今日もここから。よい一日を。', true, 70),
  ('welcome-comment-8', '来た来た。今日も遊んでこう。', true, 80),
  ('welcome-comment-9', 'なんでもない今日も、けっこういい日かもしれない。', true, 90),
  ('welcome-comment-10', '今日もよろしく。ぼちぼちいこう。', true, 100),
  ('welcome-comment-11', 'よく来たね。まずは今日を開いただけで一歩。', true, 110),
  ('welcome-comment-12', 'おはよう。今日も自分のペースでいこう。', true, 120),
  ('welcome-comment-13', 'さあ、日々ティンの今日が始まります。', true, 130),
  ('welcome-comment-14', '今日もゆるく、でもちょっといい感じに。', true, 140),
  ('welcome-comment-15', 'おかえり。ここから今日を整えていこう。', true, 150)
on conflict (slug) do nothing;

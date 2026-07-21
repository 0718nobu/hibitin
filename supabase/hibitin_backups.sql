create table if not exists public.hibitin_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  backup_data jsonb not null,
  backup_version integer not null,
  data_count integer not null,
  updated_at timestamptz not null default now()
);

alter table public.hibitin_backups enable row level security;

drop policy if exists "Users can select own hibitin backup" on public.hibitin_backups;
create policy "Users can select own hibitin backup"
on public.hibitin_backups
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own hibitin backup" on public.hibitin_backups;
create policy "Users can insert own hibitin backup"
on public.hibitin_backups
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own hibitin backup" on public.hibitin_backups;
create policy "Users can update own hibitin backup"
on public.hibitin_backups
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own hibitin backup" on public.hibitin_backups;
create policy "Users can delete own hibitin backup"
on public.hibitin_backups
for delete
using (auth.uid() = user_id);

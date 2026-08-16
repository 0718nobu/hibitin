create extension if not exists pgcrypto;

create table if not exists public.hibitin_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  save_name text not null,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_played_at timestamptz,
  constraint hibitin_saves_user_id_id_key unique (user_id, id)
);

create table if not exists public.hibitin_save_backups (
  user_id uuid not null references auth.users(id) on delete cascade,
  save_id uuid not null,
  backup_data jsonb not null,
  backup_version integer not null,
  data_count integer not null,
  updated_at timestamptz not null default now(),
  constraint hibitin_save_backups_pkey primary key (user_id, save_id),
  constraint hibitin_save_backups_save_fk
    foreign key (user_id, save_id)
    references public.hibitin_saves(user_id, id)
    on delete cascade
);

create index if not exists hibitin_saves_user_updated_idx
on public.hibitin_saves(user_id, updated_at desc);

create index if not exists hibitin_saves_user_last_played_idx
on public.hibitin_saves(user_id, last_played_at desc nulls last);

create index if not exists hibitin_save_backups_save_id_idx
on public.hibitin_save_backups(save_id);

create index if not exists hibitin_save_backups_user_updated_idx
on public.hibitin_save_backups(user_id, updated_at desc);

create or replace function public.set_hibitin_save_slots_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_hibitin_saves_updated_at on public.hibitin_saves;
create trigger set_hibitin_saves_updated_at
before update on public.hibitin_saves
for each row
execute function public.set_hibitin_save_slots_updated_at();

drop trigger if exists set_hibitin_save_backups_updated_at on public.hibitin_save_backups;
create trigger set_hibitin_save_backups_updated_at
before update on public.hibitin_save_backups
for each row
execute function public.set_hibitin_save_slots_updated_at();

alter table public.hibitin_saves enable row level security;
alter table public.hibitin_save_backups enable row level security;

drop policy if exists "Users can select own hibitin saves" on public.hibitin_saves;
create policy "Users can select own hibitin saves"
on public.hibitin_saves
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own hibitin saves" on public.hibitin_saves;
create policy "Users can insert own hibitin saves"
on public.hibitin_saves
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own hibitin saves" on public.hibitin_saves;
create policy "Users can update own hibitin saves"
on public.hibitin_saves
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can select own hibitin save backups" on public.hibitin_save_backups;
create policy "Users can select own hibitin save backups"
on public.hibitin_save_backups
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own hibitin save backups" on public.hibitin_save_backups;
create policy "Users can insert own hibitin save backups"
on public.hibitin_save_backups
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own hibitin save backups" on public.hibitin_save_backups;
create policy "Users can update own hibitin save backups"
on public.hibitin_save_backups
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

alter table public.daily_quest_master
  add column if not exists is_favorite boolean not null default false;

alter table public.nightly_quest_master
  add column if not exists is_favorite boolean not null default false;

comment on column public.daily_quest_master.is_favorite is
  'Admin-only marker used to pin frequently edited login quest candidates in the admin UI. It does not affect player assignment.';

comment on column public.nightly_quest_master.is_favorite is
  'Admin-only marker used to pin frequently edited nightly quest candidates in the admin UI. It does not affect player assignment.';

create index if not exists daily_quest_master_favorite_order_idx
  on public.daily_quest_master (is_favorite desc, sort_order);

create index if not exists nightly_quest_master_favorite_order_idx
  on public.nightly_quest_master (is_favorite desc, sort_order);

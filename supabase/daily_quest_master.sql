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

create table if not exists public.daily_quest_master (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  prompt text not null,
  completion_message text,
  category text,
  is_active boolean not null default true,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists daily_quest_master_active_order_idx
  on public.daily_quest_master (is_active, sort_order);

create or replace function public.set_daily_quest_master_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_daily_quest_master_updated_at on public.daily_quest_master;
create trigger set_daily_quest_master_updated_at
  before update on public.daily_quest_master
  for each row
  execute function public.set_daily_quest_master_updated_at();

alter table public.daily_quest_master enable row level security;

drop policy if exists "Anyone can read active daily quest master" on public.daily_quest_master;
create policy "Anyone can read active daily quest master"
  on public.daily_quest_master
  for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "Admins can read all daily quest master" on public.daily_quest_master;
create policy "Admins can read all daily quest master"
  on public.daily_quest_master
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );

drop policy if exists "Admins can insert daily quest master" on public.daily_quest_master;
create policy "Admins can insert daily quest master"
  on public.daily_quest_master
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );

drop policy if exists "Admins can update daily quest master" on public.daily_quest_master;
create policy "Admins can update daily quest master"
  on public.daily_quest_master
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

drop policy if exists "Admins can delete daily quest master" on public.daily_quest_master;
create policy "Admins can delete daily quest master"
  on public.daily_quest_master
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );

insert into public.daily_quest_master
  (slug, prompt, completion_message, category, is_active, sort_order)
values
  ('daily-nudge-water', '水を一杯飲もう', '水分補給クリア。体にやさしい一歩。', '健康', true, 10),
  ('daily-nudge-water-sip', '水を一口飲もう', '一口補給完了。体が少し助かった。', '休息', true, 20),
  ('daily-nudge-stretch-10', '10秒だけ背伸びしよう', '背伸び完了。少し空気が入れ替わった。', '健康', true, 30),
  ('daily-nudge-breath', '深呼吸をひとつしよう', '深呼吸完了。いま、ここに戻れた。', '休息', true, 40),
  ('daily-nudge-breath-one', '深呼吸を一回しよう', '深呼吸一回完了。ちゃんと整えた。', '休息', true, 50),
  ('daily-nudge-shoulder', '肩を3回まわそう', '肩まわし完了。こわばりを少し解除。', '健康', true, 60),
  ('daily-nudge-shoulder-drop', '肩の力を抜こう', '力みリセット完了。少し軽くなった。', '休息', true, 70),
  ('daily-nudge-step', '立ち上がって一歩歩こう', '一歩完了。ちゃんと動き出した。', '行動開始', true, 80),
  ('daily-nudge-stand-up', '立ち上がろう', '立ち上がり完了。もう始まってる。', '行動開始', true, 90),
  ('daily-nudge-three-seconds', '3秒だけ始めよう', '3秒着手完了。入口に立てた。', '行動開始', true, 100),
  ('daily-nudge-one-time', 'まず1回だけやろう', '1回完了。小さく突破した。', '行動開始', true, 110),
  ('daily-nudge-far-look', '遠くを10秒眺めよう', '視界リセット完了。目にも休憩を。', '休息', true, 120),
  ('daily-nudge-look-sky', '空を見よう', '空チェック完了。少し視界が広がった。', '休息', true, 130),
  ('daily-nudge-close-eyes', '目を閉じて5秒休もう', '5秒休憩完了。小さく回復。', '休息', true, 140),
  ('daily-nudge-desk-one', '机の上を一つだけ片付けよう', '一つ片付いた。場が少し軽くなった。', '行動開始', true, 150),
  ('daily-nudge-posture', '背筋を伸ばそう', '姿勢リセット完了。ちょっといい感じ。', '健康', true, 160),
  ('daily-nudge-thanks-self', '自分にありがとうと言おう', '自分へのありがとう完了。ナイス存在。', '感謝', true, 170),
  ('daily-nudge-say-thanks', 'ありがとうを一回言おう', 'ありがとう完了。小さなあたたかさを渡せた。', '感謝', true, 180),
  ('daily-nudge-greeting', 'あいさつを一回しよう', 'あいさつ完了。今日の扉を少し開けた。', '感謝', true, 190),
  ('daily-nudge-window', '窓の外をちらっと見よう', '外の世界を確認。視点が少し広がった。', '休息', true, 200),
  ('daily-nudge-smile', '口角を少しだけ上げてみよう', '表情ミニ調整完了。気分に小さなバフ。', '遊び', true, 210),
  ('daily-nudge-smile-once', '笑顔を一回つくろう', '笑顔一回完了。表情に小さな灯り。', '感謝', true, 220),
  ('daily-nudge-hands', '手をぎゅっと握って開こう', '手のリセット完了。操作感が戻った。', '健康', true, 230),
  ('daily-nudge-hand-warm', '手のひらを温めよう', '手のひら回復。少し落ち着いた。', '休息', true, 240),
  ('daily-nudge-neck', '首をゆっくり一回まわそう', '首まわし完了。こりを少しほどいた。', '健康', true, 250),
  ('daily-nudge-foot', '足を一回伸ばそう', '足のばし完了。体に小さな余白。', '健康', true, 260),
  ('daily-nudge-open-door', 'ドアか窓を少し開けよう', '空気入れ替え完了。場が少し変わった。', '休息', true, 270),
  ('daily-nudge-put-one-away', '目の前の物を一つ戻そう', '一つ戻した。周りが少し整った。', '行動開始', true, 280),
  ('daily-nudge-touch-tool', '使う物を一つ手に取ろう', '道具を持った。始める準備クリア。', '行動開始', true, 290),
  ('daily-nudge-floor', '足の裏を床に感じてみよう', '接地完了。ここからまた始められる。', '休息', true, 300)
on conflict (slug) do update
set
  prompt = excluded.prompt,
  completion_message = excluded.completion_message,
  category = excluded.category,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

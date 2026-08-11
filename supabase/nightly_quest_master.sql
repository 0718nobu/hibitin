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

create table if not exists public.nightly_quest_master (
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

alter table public.nightly_quest_master
  add column if not exists slug text,
  add column if not exists prompt text,
  add column if not exists completion_message text,
  add column if not exists category text,
  add column if not exists is_active boolean not null default true,
  add column if not exists sort_order integer not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

create unique index if not exists nightly_quest_master_slug_idx
  on public.nightly_quest_master (slug);

create index if not exists nightly_quest_master_active_order_idx
  on public.nightly_quest_master (is_active, sort_order);

create or replace function public.set_nightly_quest_master_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_nightly_quest_master_updated_at on public.nightly_quest_master;
create trigger set_nightly_quest_master_updated_at
  before update on public.nightly_quest_master
  for each row
  execute function public.set_nightly_quest_master_updated_at();

alter table public.nightly_quest_master enable row level security;

drop policy if exists "Anyone can read active nightly quest master" on public.nightly_quest_master;
create policy "Anyone can read active nightly quest master"
  on public.nightly_quest_master
  for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "Admins can read all nightly quest master" on public.nightly_quest_master;
create policy "Admins can read all nightly quest master"
  on public.nightly_quest_master
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );

drop policy if exists "Admins can insert nightly quest master" on public.nightly_quest_master;
create policy "Admins can insert nightly quest master"
  on public.nightly_quest_master
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );

drop policy if exists "Admins can update nightly quest master" on public.nightly_quest_master;
create policy "Admins can update nightly quest master"
  on public.nightly_quest_master
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

drop policy if exists "Admins can delete nightly quest master" on public.nightly_quest_master;
create policy "Admins can delete nightly quest master"
  on public.nightly_quest_master
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where admin_users.user_id = auth.uid()
    )
  );

insert into public.nightly_quest_master
  (slug, prompt, completion_message, category, is_active, sort_order)
values
  ('nightly-nudge-feet-thanks', '足をさすりながら「今日も運んでくれてありがとう。」と感謝してあげよう。', '足にありがとうを渡せた。今日もお疲れさま。', null, true, 10),
  ('nightly-nudge-shoulder-goodwork', '肩に手を置きながら「今日もお疲れさま。」と労ってあげよう。', '肩の力を少しほどけた。今日もお疲れさま。', null, true, 20),
  ('nightly-nudge-chest-enough', '胸に手を当てながら「今日も十分だったよ。」と認めてあげよう。', '今日の自分を認められた。今日もお疲れさま。', null, true, 30),
  ('nightly-nudge-mirror-best', '鏡の自分を見ながら「お前って最高。」と褒めてあげよう。', '自分にいい言葉を渡せた。今日もお疲れさま。', null, true, 40),
  ('nightly-nudge-eyes-rest', '目を閉じながら「今日はもう休もう。」と休ませてあげよう。', '休む許可を出せた。今日もお疲れさま。', null, true, 50),
  ('nightly-nudge-breathe-safe', '深呼吸しながら「もう大丈夫。」と安心させてあげよう。', '自分を安心させられた。今日もお疲れさま。', null, true, 60),
  ('nightly-nudge-bed-kind', '布団に入りながら「ここまで来てくれてありがとう。」とねぎらってあげよう。', '今日の終わりにねぎらえた。今日もお疲れさま。', null, true, 70),
  ('nightly-nudge-today-self', '今日の自分を思い浮かべながら「なんだかんだ乗り切ったね。」と受け入れてあげよう。', '今日の自分を受け入れた。今日もお疲れさま。', null, true, 80),
  ('nightly-nudge-hands-wrap', '手を包みながら「よく頑張ったね。」といたわってあげよう。', '手の中で自分をいたわれた。今日もお疲れさま。', null, true, 90),
  ('nightly-nudge-smile-day', '笑顔を作りながら「今日も悪くなかったね。」と笑ってあげよう。', '今日へ小さく笑えた。今日もお疲れさま。', null, true, 100),
  ('nightly-nudge-feet-sorry', '足首をゆっくり回しながら「いっぱい使ってごめんね。」と許してあげよう。', '体にやさしく謝れた。今日もお疲れさま。', null, true, 110),
  ('nightly-nudge-neck-loosen', '首をなでながら「重たいもの持ってくれてありがとう。」と感謝してあげよう。', '首を少し休ませられた。今日もお疲れさま。', null, true, 120),
  ('nightly-nudge-belly-warm', 'お腹に手を置きながら「今日も生きてくれてありがとう。」と大切にしてあげよう。', '体を大切にできた。今日もお疲れさま。', null, true, 130),
  ('nightly-nudge-back-kind', '背中を軽くさすりながら「今日も背負ってくれてありがとう。」と労ってあげよう。', '背中を労えた。今日もお疲れさま。', null, true, 140),
  ('nightly-nudge-forehead-soft', '額に手を当てながら「考えすぎても大丈夫だったよ。」と安心させてあげよう。', '頭を少し安心させた。今日もお疲れさま。', null, true, 150),
  ('nightly-nudge-pillow-done', '枕に頭を置きながら「今日の役目はここまで。」と休ませてあげよう。', '休む区切りを作れた。今日もお疲れさま。', null, true, 160),
  ('nightly-nudge-light-off', '部屋の明かりを落としながら「今日はもう閉店です。」と優しくしてあげよう。', '一日をやさしく閉じた。今日もお疲れさま。', null, true, 170),
  ('nightly-nudge-blanket-hug', '布団をかけながら「今日は守られていいよ。」と抱きしめてあげよう。', '自分を守る夜にできた。今日もお疲れさま。', null, true, 180),
  ('nightly-nudge-hand-heart', '片手を胸に置きながら「ちゃんと前に進んでるよ。」と励ましてあげよう。', '静かな励ましを渡せた。今日もお疲れさま。', null, true, 190),
  ('nightly-nudge-day-thanks', '今日という一日を思い浮かべながら「今日も付き合ってくれてありがとう。」と感謝してあげよう。', '今日へありがとうを置けた。今日もお疲れさま。', null, true, 200),
  ('nightly-nudge-cheeks-soft', '頬を軽く包みながら「今日も自分らしかったね。」と認めてあげよう。', '自分らしさを認めた。今日もお疲れさま。', null, true, 210),
  ('nightly-nudge-arms-cross', '腕をゆるく組みながら「ここにいてくれてありがとう。」と抱きしめてあげよう。', '自分を少し抱きしめた。今日もお疲れさま。', null, true, 220),
  ('nightly-nudge-toes-thanks', 'つま先を動かしながら「小さくても進んだね。」と褒めてあげよう。', '小さな前進を褒めた。今日もお疲れさま。', null, true, 230),
  ('nightly-nudge-knees-care', 'ひざをなでながら「今日も支えてくれてありがとう。」といたわってあげよう。', 'ひざをいたわれた。今日もお疲れさま。', null, true, 240),
  ('nightly-nudge-palms-rest', '手のひらを見ながら「今日はもう何もしなくていいよ。」と休ませてあげよう。', '手を休ませる気持ちになれた。今日もお疲れさま。', null, true, 250),
  ('nightly-nudge-window-soft', '窓の外を眺めながら「また明日も大丈夫。」と安心させてあげよう。', '明日への安心を少し置けた。今日もお疲れさま。', null, true, 260),
  ('nightly-nudge-water-reward', '水をひと口飲みながら「今日のご褒美だよ。」とご褒美をあげよう。', '小さなご褒美を渡せた。今日もお疲れさま。', null, true, 270),
  ('nightly-nudge-lips-smile', '口角を少し上げながら「なんとかやれたね。」と笑ってあげよう。', '自分に小さく笑えた。今日もお疲れさま。', null, true, 280),
  ('nightly-nudge-breath-proud', '息を長く吐きながら「今日もえらかったよ。」と褒めてあげよう。', '今日の自分を褒めた。今日もお疲れさま。', null, true, 290),
  ('nightly-nudge-chest-forgive', '胸に手を当てながら「うまくできない日もあっていいよ。」と許してあげよう。', '自分を少し許せた。今日もお疲れさま。', null, true, 300),
  ('nightly-nudge-eyes-kind', 'まぶたを閉じながら「たくさん見てくれてありがとう。」と感謝してあげよう。', '目にありがとうを渡せた。今日もお疲れさま。', null, true, 310),
  ('nightly-nudge-ears-quiet', '耳の近くを軽くなでながら「静かに休んでいいよ。」と安心させてあげよう。', '静かな休みを作れた。今日もお疲れさま。', null, true, 320),
  ('nightly-nudge-hair-soft', '髪を軽くなでながら「今日もよくここまで来たね。」とねぎらってあげよう。', '自分をねぎらえた。今日もお疲れさま。', null, true, 330),
  ('nightly-nudge-room-look', '部屋を一度見回しながら「ここまでで十分。」と認めてあげよう。', '十分の線を引けた。今日もお疲れさま。', null, true, 340),
  ('nightly-nudge-clothes-loosen', '服の力を抜きながら「もう楽にしていいよ。」と優しくしてあげよう。', '体を楽にできた。今日もお疲れさま。', null, true, 350),
  ('nightly-nudge-socks-off', '靴下を脱ぎながら「今日の足、よくやったね。」と褒めてあげよう。', '足を褒められた。今日もお疲れさま。', null, true, 360),
  ('nightly-nudge-bed-sit', 'ベッドに座りながら「今日も帰ってこられたね。」と安心させてあげよう。', '帰ってきた安心を感じた。今日もお疲れさま。', null, true, 370),
  ('nightly-nudge-one-good', '今日のよかったことを一つ思い出しながら「喜んでいいよ。」と喜んであげよう。', '小さなよかったを喜べた。今日もお疲れさま。', null, true, 380),
  ('nightly-nudge-one-hard', '今日しんどかった場面を思い浮かべながら「それでも来たね。」と認めてあげよう。', 'しんどさごと認めた。今日もお疲れさま。', null, true, 390),
  ('nightly-nudge-mistake-forgive', '今日の失敗を一つ思い出しながら「もう責めなくていいよ。」と許してあげよう。', '責める手を少しゆるめた。今日もお疲れさま。', null, true, 400),
  ('nightly-nudge-blanket-thanks', '布団を整えながら「休む場所があるね。」と安心させてあげよう。', '休む場所を確かめた。今日もお疲れさま。', null, true, 410),
  ('nightly-nudge-hands-clap-soft', '手をそっと合わせながら「今日もありがとう。」と感謝してあげよう。', '今日へ感謝を置けた。今日もお疲れさま。', null, true, 420),
  ('nightly-nudge-shoulders-drop', '肩を落としながら「もう背負わなくていいよ。」と休ませてあげよう。', '肩の荷を少し降ろせた。今日もお疲れさま。', null, true, 430),
  ('nightly-nudge-jaw-loose', 'あごの力を抜きながら「こわばっても大丈夫だったよ。」と受け入れてあげよう。', 'こわばりごと受け入れた。今日もお疲れさま。', null, true, 440),
  ('nightly-nudge-breathe-slow', 'ゆっくり息を吸いながら「今は安全だよ。」と安心させてあげよう。', '今の安全を確かめた。今日もお疲れさま。', null, true, 450),
  ('nightly-nudge-breathe-out', 'ゆっくり息を吐きながら「今日の分は置いていいよ。」と休ませてあげよう。', '今日の重さを少し置けた。今日もお疲れさま。', null, true, 460),
  ('nightly-nudge-mirror-gentle', '鏡の自分を見ながら「味方でいるよ。」と励ましてあげよう。', '自分の味方でいられた。今日もお疲れさま。', null, true, 470),
  ('nightly-nudge-hand-cheek', '手のひらを頬に当てながら「大切な自分だよ。」と大切にしてあげよう。', '自分を大切に扱えた。今日もお疲れさま。', null, true, 480),
  ('nightly-nudge-stomach-kind', 'お腹をさすりながら「今日も働いてくれてありがとう。」と感謝してあげよう。', 'お腹にありがとうを渡せた。今日もお疲れさま。', null, true, 490),
  ('nightly-nudge-legs-stretch', '脚を伸ばしながら「今日もよく支えたね。」と労ってあげよう。', '脚を労えた。今日もお疲れさま。', null, true, 500),
  ('nightly-nudge-fingers-count', '指を一本ずつゆるめながら「もう力を抜いていいよ。」と休ませてあげよう。', '指先まで休ませた。今日もお疲れさま。', null, true, 510),
  ('nightly-nudge-voice-soft', '小さな声で「今日もよくやったね。」と褒めてあげよう。', '声にして褒められた。今日もお疲れさま。', null, true, 520),
  ('nightly-nudge-silent-nod', '静かにうなずきながら「それでよかったよ。」と認めてあげよう。', '今日の選択を認めた。今日もお疲れさま。', null, true, 530),
  ('nightly-nudge-palm-heart', '手のひらを胸に重ねながら「ちゃんとここにいるね。」と安心させてあげよう。', 'ここにいる安心を感じた。今日もお疲れさま。', null, true, 540),
  ('nightly-nudge-day-close', '今日の終わりを思い浮かべながら「いい一日だったね。」と喜んであげよう。', '一日をやさしく喜べた。今日もお疲れさま。', null, true, 550),
  ('nightly-nudge-hard-day', '疲れた体を感じながら「疲れるまで生きたね。」とねぎらってあげよう。', '疲れごとねぎらえた。今日もお疲れさま。', null, true, 560),
  ('nightly-nudge-no-score', '目を閉じながら「今日は採点しなくていいよ。」と許してあげよう。', '評価しない夜にできた。今日もお疲れさま。', null, true, 570),
  ('nightly-nudge-soft-hug', '腕で体を包みながら「ここまで来た自分を抱きしめよう。」と抱きしめてあげよう。', '自分を抱きしめられた。今日もお疲れさま。', null, true, 580),
  ('nightly-nudge-pillow-thanks', '枕に頬をつけながら「休ませてくれてありがとう。」と感謝してあげよう。', '休む準備ができた。今日もお疲れさま。', null, true, 590),
  ('nightly-nudge-smile-self', '自分に向けて少し笑いながら「今日の自分、好きだよ。」と優しくしてあげよう。', '自分にやさしく笑えた。今日もお疲れさま。', null, true, 600),
  ('nightly-nudge-door-close', 'ドアを閉めながら「今日の外側はここまで。」と安心させてあげよう。', '夜の境目を作れた。今日もお疲れさま。', null, true, 610),
  ('nightly-nudge-phone-down', 'スマホを置きながら「もう離れていいよ。」と休ませてあげよう。', '手放す時間を作れた。今日もお疲れさま。', null, true, 620),
  ('nightly-nudge-blanket-reward', '布団を少し整えながら「これは今日のご褒美。」とご褒美をあげよう。', '休むご褒美を渡せた。今日もお疲れさま。', null, true, 630),
  ('nightly-nudge-eyebrows-soft', '眉間の力を抜きながら「難しい顔もおしまい。」と笑ってあげよう。', '顔の力をゆるめた。今日もお疲れさま。', null, true, 640),
  ('nightly-nudge-body-thanks', '体全体を感じながら「今日も動いてくれてありがとう。」と感謝してあげよう。', '体全体にありがとうを渡せた。今日もお疲れさま。', null, true, 650),
  ('nightly-nudge-heart-kind', '胸のあたりをゆっくり撫でながら「今日もいてくれてありがとう。」と大切にしてあげよう。', '自分を大切にできた。今日もお疲れさま。', null, true, 660),
  ('nightly-nudge-small-win', '今日できた小さなことを思い出しながら「それ、よかったよ。」と褒めてあげよう。', '小さなできたを褒めた。今日もお疲れさま。', null, true, 670),
  ('nightly-nudge-sad-ok', '今日のしょんぼりを思い浮かべながら「そういう日もあるよ。」と受け入れてあげよう。', 'しょんぼりも受け入れた。今日もお疲れさま。', null, true, 680),
  ('nightly-nudge-angry-ok', '今日のもやもやを思い浮かべながら「感じてもよかったよ。」と許してあげよう。', 'もやもやを許せた。今日もお疲れさま。', null, true, 690),
  ('nightly-nudge-lonely-care', '手をぎゅっと握りながら「ひとりにしないよ。」と安心させてあげよう。', '自分をひとりにしなかった。今日もお疲れさま。', null, true, 700),
  ('nightly-nudge-tired-care', '疲れた場所に手を当てながら「ここ、よく使ったね。」といたわってあげよう。', '疲れた場所をいたわれた。今日もお疲れさま。', null, true, 710),
  ('nightly-nudge-night-air', '夜の空気を吸いながら「ここから休む時間だよ。」と休ませてあげよう。', '休む時間に入れた。今日もお疲れさま。', null, true, 720),
  ('nightly-nudge-today-friend', '今日の自分に向けて「味方でいてくれてありがとう。」と感謝してあげよう。', '自分への感謝ができた。今日もお疲れさま。', null, true, 730),
  ('nightly-nudge-quiet-proud', '静かに目を閉じながら「今日も誇っていいよ。」と認めてあげよう。', '誇っていい夜にできた。今日もお疲れさま。', null, true, 740),
  ('nightly-nudge-bed-smile', '布団の中で少し笑いながら「今日もかわいげあったね。」と笑ってあげよう。', '自分へやさしく笑えた。今日もお疲れさま。', null, true, 750),
  ('nightly-nudge-shoulder-hug', '自分の肩を抱きながら「よく耐えたね。」と抱きしめてあげよう。', '自分を抱きしめて労えた。今日もお疲れさま。', null, true, 760),
  ('nightly-nudge-memory-good', '今日うれしかった瞬間を思い出しながら「よかったね。」と喜んであげよう。', 'うれしさを喜べた。今日もお疲れさま。', null, true, 770),
  ('nightly-nudge-memory-normal', '普通に過ぎた時間を思い出しながら「普通もありがたいね。」と感謝してあげよう。', '普通の一日にも感謝できた。今日もお疲れさま。', null, true, 780),
  ('nightly-nudge-body-ok', '体をゆるめながら「そのままで大丈夫。」と安心させてあげよう。', 'そのままを安心させた。今日もお疲れさま。', null, true, 790),
  ('nightly-nudge-sleep-permit', '目を閉じながら「眠っていいよ。」と許してあげよう。', '眠る許可を出せた。今日もお疲れさま。', null, true, 800),
  ('nightly-nudge-tomorrow-soft', '布団をかけながら「明日のことは明日に渡そう。」と休ませてあげよう。', '明日を明日に渡せた。今日もお疲れさま。', null, true, 810),
  ('nightly-nudge-face-care', '顔を軽くなでながら「今日も表情を作ってくれてありがとう。」と感謝してあげよう。', '顔にもありがとうを渡せた。今日もお疲れさま。', null, true, 820),
  ('nightly-nudge-voice-kind', '小さく息を吐きながら「今日の自分、悪くなかったよ。」と認めてあげよう。', '今日の自分を認められた。今日もお疲れさま。', null, true, 830),
  ('nightly-nudge-self-reward', '好きな姿勢を取りながら「これが今日のご褒美だよ。」とご褒美をあげよう。', '体にご褒美を渡せた。今日もお疲れさま。', null, true, 840),
  ('nightly-nudge-breath-hug', '深呼吸しながら「自分を大事にするよ。」と大切にしてあげよう。', '自分を大事にする夜にできた。今日もお疲れさま。', null, true, 850),
  ('nightly-nudge-bed-forgive', '布団に沈みながら「今日の全部を責めなくていいよ。」と許してあげよう。', '今日を責めずに閉じられた。今日もお疲れさま。', null, true, 860),
  ('nightly-nudge-palm-encourage', '手を包みながら「また休めば戻ってくるよ。」と励ましてあげよう。', 'やわらかい励ましを渡せた。今日もお疲れさま。', null, true, 870),
  ('nightly-nudge-heart-welcome', '胸に手を当てながら「どんな自分でも帰っておいで。」と受け入れてあげよう。', '自分の帰る場所を作れた。今日もお疲れさま。', null, true, 880),
  ('nightly-nudge-knees-hug', 'ひざを抱えながら「小さく丸まってもいいよ。」と安心させてあげよう。', '丸まって休む許可を出せた。今日もお疲れさま。', null, true, 890),
  ('nightly-nudge-ankle-soft', '足首をさすりながら「今日も最後までありがとう。」と感謝してあげよう。', '足首まで労えた。今日もお疲れさま。', null, true, 900),
  ('nightly-nudge-room-thanks', '寝る場所を見ながら「今日の自分を迎えてくれてありがとう。」と喜んであげよう。', '休む場所に戻れたことを喜べた。今日もお疲れさま。', null, true, 910),
  ('nightly-nudge-soft-word', '自分に向けて「今日も大事な一日だったよ。」と認めてあげよう。', '今日を大事に閉じられた。今日もお疲れさま。', null, true, 920),
  ('nightly-nudge-wrist-care', '手首をゆっくり回しながら「細かいことまでありがとう。」といたわってあげよう。', '手首をいたわれた。今日もお疲れさま。', null, true, 930),
  ('nightly-nudge-eyes-smile', '目元をゆるめながら「やさしい顔に戻っていいよ。」と優しくしてあげよう。', '顔をやさしく戻せた。今日もお疲れさま。', null, true, 940),
  ('nightly-nudge-today-wrap', '今日の一日を包むように思い浮かべながら「今日もここまで。」とねぎらってあげよう。', '一日を包んでねぎらえた。今日もお疲れさま。', null, true, 950),
  ('nightly-nudge-heart-thanks', '胸に手を置きながら「生きてくれてありがとう。」と感謝してあげよう。', '自分に深くありがとうを渡せた。今日もお疲れさま。', null, true, 960),
  ('nightly-nudge-soft-yes', '小さくうなずきながら「うん、今日もよくやった。」と褒めてあげよう。', '今日を褒めて終われた。今日もお疲れさま。', null, true, 970),
  ('nightly-nudge-rest-now', '布団に手を置きながら「今から休ませてあげるね。」と休ませてあげよう。', '休ませる準備ができた。今日もお疲れさま。', null, true, 980),
  ('nightly-nudge-gentle-name', '自分の名前を小さく呼びながら「今日もお疲れさま。」と労ってあげよう。', '名前ごと労えた。今日もお疲れさま。', null, true, 990),
  ('nightly-nudge-today-ok', '今日の自分を思い浮かべながら「それでも大丈夫だったよ。」と安心させてあげよう。', '今日を安心で閉じた。今日もお疲れさま。', null, true, 1000),
  ('nightly-nudge-last-smile', '寝る前に少し笑いながら「また明日ね。」と優しくしてあげよう。', '明日へやさしく渡せた。今日もお疲れさま。', null, true, 1010),
  ('nightly-nudge-body-hug', '腕で体を包みながら「今日の体、ありがとう。」と抱きしめてあげよう。', '体を抱きしめられた。今日もお疲れさま。', null, true, 1020),
  ('nightly-nudge-day-forgive', '今日の一日を思い浮かべながら「足りないところがあってもいいよ。」と許してあげよう。', '足りなさごと許せた。今日もお疲れさま。', null, true, 1030),
  ('nightly-nudge-self-cheer', '胸を軽く叩きながら「ちゃんとここまで来たよ。」と励ましてあげよう。', '自分を静かに励ませた。今日もお疲れさま。', null, true, 1040),
  ('nightly-nudge-soft-finish', '目を閉じながら「今日もいい締めくくりにしよう。」と大切にしてあげよう。', '今日を大切に締められた。今日もお疲れさま。', null, true, 1050)
on conflict (slug) do nothing;

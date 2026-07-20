import {
  ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  defaultCoreRoutinePlacements,
  coreRoutineDefinitions,
  getCoreRoutineCompletion,
  hasMeaningfulText,
  type CoreRoutineDefinition,
  type CoreRoutineId,
  type CoreRoutineKind,
  type CoreRoutinePlacements,
} from './coreRoutines';

type RoutineSource = 'default' | 'user' | 'ai';
type TemplateKind = 'normal' | 'holiday';
type GameMode = 'player' | 'developer';
type PageName = 'today' | 'history' | 'schedule' | 'records' | 'shop' | 'settings';
type RecordViewName = 'memo' | 'events' | 'anyMemo' | 'achievements';
type ScheduleViewName = 'schedule' | 'todos';
type RoutineKind = TemplateKind | 'custom';
type StartSection = 'morning' | 'noon' | 'evening' | 'night';
type WeekdayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';
type EditTargetKey = TemplateKind;

const recordViewOptions: { key: RecordViewName; icon: string; label: string }[] = [
  { key: 'memo', icon: '✍️', label: 'ひとこと' },
  { key: 'events', icon: '📅', label: 'できごと' },
  { key: 'anyMemo', icon: '📝', label: 'メモ' },
  { key: 'achievements', icon: '🏆', label: '実績' },
];

const scheduleViewOptions: { key: ScheduleViewName; icon: string; label: string }[] = [
  { key: 'schedule', icon: '📅', label: '予定' },
  { key: 'todos', icon: '☑️', label: 'やること' },
];

const recordViewHeadings: Record<RecordViewName, string> = {
  memo: '今日のひとこと',
  events: '今日のできごと',
  anyMemo: 'なんでもメモ',
  achievements: '実績',
};

const scheduleViewHeadings: Record<ScheduleViewName, string> = {
  schedule: 'スケジュール',
  todos: 'やること',
};

const mainPageOptions: { key: PageName; icon: string; label: string }[] = [
  { key: 'today', icon: '🎮', label: '今日' },
  { key: 'history', icon: '📅', label: 'スタンプ帳' },
  { key: 'schedule', icon: '🗓️', label: 'スケジュール' },
  { key: 'records', icon: '📖', label: '記録' },
  { key: 'shop', icon: '🎁', label: 'ショップ' },
  { key: 'settings', icon: '⚙️', label: '設定' },
];

type RoutineItem = {
  id: string;
  label: string;
  order: number;
  source: RoutineSource;
  createdAt: string;
  fixedKind?: 'wake' | 'sleep';
  time?: string;
  timerMinutes?: number;
  timerSeconds?: number;
};

type RoutineSection = {
  id: string;
  title: string;
  order: number;
  items: RoutineItem[];
};

type RoutineTemplateSettings = {
  templates: {
    normal: RoutineSection[];
    holiday: RoutineSection[];
  };
  weekdayTypeMap: Record<WeekdayKey, TemplateKind>;
};

type RankRule = {
  rank: number;
  requiredLifetimeStars: number;
  pointMultiplier: number;
};

type PointSettings = {
  rounding: 'round' | 'floor' | 'ceil';
  wake: {
    enabled: boolean;
    basePoints: number;
  };
  normal: {
    enabled: boolean;
    basePoints: number;
  };
  sleep: {
    enabled: boolean;
    basePoints: number;
  };
  advanced: {
    enabled: boolean;
    basePoints: number;
  };
  dailyNudge: {
    enabled: boolean;
    basePoints: number;
  };
  coreMemo: {
    enabled: boolean;
    basePoints: number;
  };
  coreEvents: {
    enabled: boolean;
    basePoints: number;
  };
};

type PointTargetKind =
  | 'wake'
  | 'normal'
  | 'sleep'
  | 'advanced'
  | 'dailyNudge'
  | 'coreMemo'
  | 'coreEvents';

type QuestSlotExchangeRule = {
  enabled: boolean;
  initialTotalSlots: number;
  maxTotalSlots: number;
  price: number;
};

type ShopCategory = 'questSlot' | 'feature' | 'customize' | 'item' | 'gacha';

type ShopItem = {
  id: string;
  category: ShopCategory;
  label: string;
  price: number;
  enabled: boolean;
  maxPurchases?: number;
};

type PlayerIconId = 'smile' | 'cool' | 'chick' | 'cat' | 'dog' | 'fox' | 'bear' | 'sprout';

type PlayerIconOption = {
  id: PlayerIconId;
  emoji: string;
  label: string;
};

type PlayerProfile = {
  displayName: string;
  iconId: PlayerIconId;
};

type LegacyPointSettings = {
  baseQuestPoints?: number;
  rounding?: PointSettings['rounding'];
  includeWake?: boolean;
  includeSleep?: boolean;
  includeAdvanced?: boolean;
};

type GameBalanceSettings = {
  schemaVersion: 3;
  pointSettings: PointSettings;
  rankRules: RankRule[];
  questSlotExchange: QuestSlotExchangeRule;
};

type PointLedgerEntry = {
  id: string;
  achievementKey: string;
  dateKey: string;
  itemId: string;
  itemLabel: string;
  sectionId: string;
  type: 'earn' | 'reversal' | 'spend';
  points: number;
  basePoints: number;
  multiplier: number;
  createdAt: string;
  reason?: string;
};

type PointAwardRecord = {
  achievementKey: string;
  dateKey: string;
  itemId: string;
  itemLabel: string;
  sectionId: string;
  points: number;
  basePoints: number;
  multiplier: number;
  active: boolean;
  awardedAt: string;
  reversedAt?: string;
};

type PlayerEconomy = {
  currentPoints: number;
  lifetimeEarnedPoints: number;
  lifetimeSpentPoints: number;
  lifetimeStarsEarned: number;
  playerRank: number;
  pointLedger: PointLedgerEntry[];
  pointAwards: Record<string, PointAwardRecord>;
};

type PlayerUnlocks = {
  totalQuestSlots: number;
};

type PointToast = {
  id: string;
  points: number;
  itemLabel: string;
  message?: string;
  icon?: string;
  variant?: 'default' | 'memory';
};

type QuestEmote = {
  id: string;
  message: string;
  points: number | null;
};

type ExchangeToast = {
  id: string;
  message: string;
};

type PendingDelete = {
  id: string;
  label: string;
  sectionId: string;
};

type ResolvedEditTarget =
  | { kind: 'template'; template: TemplateKind }
  | { kind: 'date'; dateKey: string; baseTemplate: TemplateKind };

type ArchivedItem = {
  item: RoutineItem;
  sectionId: string;
  sectionTitle: string;
  target: ResolvedEditTarget;
  archivedAt: string;
};

type BackupFile = {
  backupVersion: 1;
  exportedAt: string;
  appName: 'hibitin';
  data: {
    storage: Record<string, unknown>;
  };
};

type BackupDownload = {
  url: string;
  fileName: string;
};

type ItemNotes = Record<string, Record<string, string>>;

type DailyNudgeCandidate = {
  id: string;
  text: string;
  completionMessage: string;
  category: string;
  enabled: boolean;
  order: number;
  createdAt: string;
};

type DailyNudgeRecord = {
  candidateId: string;
  text: string;
  completionMessage: string;
  celebrationMessage?: string;
  category: string;
  completed: boolean;
  assignedAt: string;
  completedAt?: string;
};

type DailyNudgeRecords = Record<string, DailyNudgeRecord>;

type NoteEditorTarget = {
  dateKey: string;
  itemId: string;
};

type RoutineRenderEntry =
  | {
      kind: 'routine';
      key: string;
      order: number;
      item: RoutineItem;
    }
  | {
      kind: 'core';
      key: string;
      order: number;
      coreRoutine: CoreRoutineDefinition;
    };

const questCompletionEmotes = [
  'ナイス！',
  'よし！',
  '一歩！',
  'クリア！',
  'いい感じ。',
  '積んだ！',
  '前進。',
  'やった。',
  'その調子。',
  '今日も一つ。',
  '小さく勝ち。',
  'グッジョブ。',
  'ひとつ完了。',
  '一歩いただき。',
  'ちゃんと進んだ。',
];

type TimerStatus = 'running' | 'paused' | 'finished';

type ActiveTimer = {
  itemId: string;
  label: string;
  durationSeconds: number;
  totalSeconds: number;
  remainingSeconds: number;
  startedAt: string | null;
  endsAt: string | null;
  status: TimerStatus;
  isRunning: boolean;
  isComplete: boolean;
};

type PausedTimer = {
  label: string;
  durationSeconds: number;
  totalSeconds: number;
  remainingSeconds: number;
  status: 'paused';
};

type StoredTimerState = {
  activeTimer: ActiveTimer | null;
  pausedTimers: Record<string, PausedTimer>;
};

type TimerNotificationPermission = NotificationPermission | 'unsupported';

type MasteryStats = {
  itemId: string;
  label: string;
  sectionId: string;
  sectionTitle: string;
  order: number;
  totalCompletions: number;
  currentStreak: number;
  bestStreak: number;
  starCount: number;
  trophyCount: number;
  isHallOfFame: boolean;
  isCurrentItem: boolean;
  lastSeenDateKey: string;
};

type MasteryProgressState = {
  totalCompletions: number;
  currentStreak: number;
  bestStreak: number;
  starCount: number;
  trophyCount: number;
  achievedStreakForNextStar: number;
  missedStreak: number;
};

const BACKUP_VERSION = 1;
const LEGACY_ROUTINES_STORAGE_KEY = 'hibitin-routines:v1';
const TEMPLATES_STORAGE_KEY = 'hibitin:templates:v1';
const DATE_SNAPSHOTS_STORAGE_KEY = 'hibitin:dateSnapshots:v1';
const DATE_OVERRIDES_STORAGE_KEY = 'hibitin:dateOverrides:v1';
const ARCHIVED_ITEMS_STORAGE_KEY = 'hibitin:archivedItems:v1';
const TIMER_STATE_STORAGE_KEY = 'hibitin:timerState:v1';
const ITEM_NOTES_STORAGE_KEY = 'hibitin:itemNotes:v1';
const CORE_ROUTINE_PLACEMENTS_STORAGE_KEY = 'hibitin:coreRoutinePlacements:v1';
const DAILY_NUDGE_CANDIDATES_STORAGE_KEY = 'hibitin:dailyNudgeCandidates:v1';
const DAILY_NUDGE_RECORDS_STORAGE_KEY = 'hibitin:dailyNudgeRecords:v1';
const LEGACY_RHYTHM_SETTINGS_STORAGE_KEY = 'hibitin:lifestyleSettings:v1';
const RHYTHM_SETTINGS_STORAGE_KEY = 'hibitin:rhythmSettings:v1';
const GAME_MODE_STORAGE_KEY = 'hibitin:gameMode:v1';
const GAME_BALANCE_STORAGE_KEY = 'hibitin:gameBalance:v1';
const PLAYER_ECONOMY_STORAGE_KEY = 'hibitin:playerEconomy:v1';
const PLAYER_PROFILE_STORAGE_KEY = 'hibitin:playerProfile:v1';
const PLAYER_UNLOCKS_STORAGE_KEY = 'hibitin:playerUnlocks:v2';
const LEGACY_PLAYER_UNLOCKS_STORAGE_KEY = 'hibitin:playerUnlocks:v1';

const isHibitinStorageKey = (key: string) =>
  key.startsWith('hibitin:') || key.startsWith('hibitin-');

const isDailyTextStorageKey = (key: string) =>
  /^hibitin:(memo|events):\d{4}-\d{2}-\d{2}$/.test(key);

const serializeRestoredStorageValue = (key: string, value: unknown) => {
  if (isDailyTextStorageKey(key) && typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
};

const isBackupFile = (value: unknown): value is BackupFile => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const backup = value as Partial<BackupFile>;

  if (
    backup.backupVersion !== BACKUP_VERSION ||
    backup.appName !== 'hibitin' ||
    typeof backup.exportedAt !== 'string' ||
    Number.isNaN(Date.parse(backup.exportedAt)) ||
    !backup.data ||
    typeof backup.data !== 'object' ||
    !backup.data.storage ||
    typeof backup.data.storage !== 'object' ||
    Array.isArray(backup.data.storage)
  ) {
    return false;
  }

  const storage = backup.data.storage;
  const requiredKeys = [
    TEMPLATES_STORAGE_KEY,
    DATE_SNAPSHOTS_STORAGE_KEY,
    DATE_OVERRIDES_STORAGE_KEY,
    RHYTHM_SETTINGS_STORAGE_KEY,
  ];

  return (
    Object.keys(storage).every(isHibitinStorageKey) &&
    requiredKeys.every(
      (key) =>
        key in storage &&
        storage[key] !== null &&
        typeof storage[key] === 'object' &&
        !Array.isArray(storage[key]),
    )
  );
};

type RhythmConfig = {
  wakeTime: string;
  sleepTime: string;
  startSection: StartSection;
};

type RhythmSettings = Record<TemplateKind, RhythmConfig>;

const defaultRhythmConfig: RhythmConfig = {
  wakeTime: '06:30',
  sleepTime: '22:30',
  startSection: 'morning',
};

const defaultRhythmSettings: RhythmSettings = {
  normal: { ...defaultRhythmConfig },
  holiday: { ...defaultRhythmConfig },
};

const fixedRoutineIds = new Set(['morning-wake-up', 'night-sleep']);

const sectionIconLabels: Record<string, string> = {
  morning: '🌅',
  noon: '☀️',
  evening: '🌇',
  night: '🌙',
  advanced: '⚙️',
};

const shopCategoryLabels: Record<ShopCategory, string> = {
  questSlot: 'フリークエスト枠',
  feature: '機能',
  customize: 'カスタマイズ',
  item: 'アイテム',
  gacha: 'ガチャ',
};

const timerPresetSeconds = [30, 60, 180, 300, 600, 900, 1200, 1800];
const timerHourOptions = [0, 1, 2];
const timerMinuteOptions = Array.from({ length: 60 }, (_, index) => index);
const timerSecondOptions = Array.from({ length: 60 }, (_, index) => index);

const dailyMessages = [
  '📖 今日も、自分のページを一枚。',
  '🌿 ゆるっと、今日を遊ぼう。',
  '🌱 今日も、ゆるく一歩。',
  '☀️ 今日はどんな物語になるかな。',
  '✨ 一歩だけでも、それで十分。',
  '🧭 迷ったら、今できる一個から。',
];

const dailyOneLineExamples = [
  { id: 'coffee-break', text: 'ひとくちコーヒー。ふう、ひとやすみひとやすみ。', category: 'rest', source: 'system' },
  { id: 'nice-wind', text: '今日は風が気持ちよかった。', category: 'nature', source: 'system' },
  { id: 'woke-up', text: '朝ちゃんと起きた。それだけでもよし。', category: 'smallWin', source: 'system' },
  { id: 'ramen', text: 'ラーメンうまかった。今日はそれで満足。', category: 'food', source: 'system' },
  { id: 'early-sleep', text: 'ちょっと疲れた。今日は早く寝よう。', category: 'emotion', source: 'system' },
  { id: 'five-minute-walk', text: '五分だけ歩いた。少し頭がすっきり。', category: 'smallWin', source: 'system' },
  { id: 'not-bad', text: '今日はなんだか、まあ悪くなかった。', category: 'emotion', source: 'system' },
  { id: 'bath', text: 'お風呂が気持ちよかった。', category: 'rest', source: 'system' },
  { id: 'plant-water', text: '植物に水をあげた。今日も元気そう。', category: 'dailyLife', source: 'system' },
  { id: 'better-than-expected', text: '思ったよりちゃんとやれた。', category: 'smallWin', source: 'system' },
  { id: 'slow-day', text: '今日はゆっくりでいい日にした。', category: 'rest', source: 'system' },
  { id: 'one-done', text: 'ひとつ終わった。それで十分。', category: 'smallWin', source: 'system' },
  { id: 'rain-sound', text: '雨の音がなんだか落ち着いた。', category: 'nature', source: 'system' },
  { id: 'laughed', text: '今日はよく笑った。', category: 'dailyLife', source: 'system' },
  { id: 'nothing-day', text: '何もない日。こういう日もいい。', category: 'rest', source: 'system' },
  { id: 'sleepy-day', text: '眠かったけど、なんとか一日やった。', category: 'emotion', source: 'system' },
  { id: 'lunch', text: 'お昼ごはん、おいしかった。', category: 'food', source: 'system' },
  { id: 'kind-to-self', text: '今日は少しだけ自分に優しくできた。', category: 'emotion', source: 'system' },
  { id: 'deep-breath', text: 'とりあえず深呼吸。ふう。', category: 'rest', source: 'system' },
  { id: 'tomorrow-me', text: '明日は明日の俺に任せよう。', category: 'humor', source: 'system' },
  { id: 'good-snack', text: 'おやつがうまい。小さい幸せ。', category: 'food', source: 'system' },
  { id: 'clean-corner', text: '机のすみだけ片付いた。ちょっとすっきり。', category: 'dailyLife', source: 'system' },
  { id: 'warm-sun', text: '日なたがあったかかった。', category: 'nature', source: 'system' },
  { id: 'just-enough', text: '今日はここまで。まあ、十分。', category: 'rest', source: 'system' },
];

const dailyEventExamples = [
  { id: 'early-wakeup', text: '朝、いつもより少し早く起きた。', category: 'dailyLife', source: 'system', kind: 'event' },
  { id: 'lunch-curry', text: 'お昼にカレーを食べた。うまかった。', category: 'food', source: 'system', kind: 'event' },
  { id: 'new-work', text: '仕事で新しい作業をひとつ覚えた。', category: 'work', source: 'system', kind: 'event' },
  { id: 'sunset', text: '帰り道、夕焼けがきれいだった。', category: 'nature', source: 'system', kind: 'event' },
  { id: 'friend-talk', text: '久しぶりに友だちと話した。', category: 'dailyLife', source: 'system', kind: 'event' },
  { id: 'rainy-day', text: '今日は雨がよく降った。', category: 'nature', source: 'system', kind: 'event' },
  { id: 'cat-walk', text: '散歩をしたら、猫を見かけた。', category: 'dailyLife', source: 'system', kind: 'event' },
  { id: 'shopping', text: '美吹と買い物に行った。', category: 'dailyLife', source: 'system', kind: 'event' },
  { id: 'fridge', text: '冷蔵庫の中を少し片付けた。', category: 'dailyLife', source: 'system', kind: 'event' },
  { id: 'slow-bath', text: 'いつもよりゆっくりお風呂に入った。', category: 'rest', source: 'system', kind: 'event' },
  { id: 'work-early', text: '仕事が思ったより早く終わった。', category: 'work', source: 'system', kind: 'event' },
  { id: 'nap', text: '眠かったので、少し昼寝した。', category: 'rest', source: 'system', kind: 'event' },
  { id: 'new-snack', text: 'コンビニで新しいお菓子を買った。', category: 'food', source: 'system', kind: 'event' },
  { id: 'short-run', text: '五分だけ走った。', category: 'activity', source: 'system', kind: 'event' },
  { id: 'plant-water-event', text: '植物に水をあげた。', category: 'dailyLife', source: 'system', kind: 'event' },
  { id: 'dinner', text: '夕飯がおいしかった。', category: 'food', source: 'system', kind: 'event' },
  { id: 'desk-clear', text: '机の上を少し整理した。', category: 'dailyLife', source: 'system', kind: 'event' },
  { id: 'funny-video', text: '動画を一本見て笑った。', category: 'fun', source: 'system', kind: 'event' },
  { id: 'quiet-day', text: '今日は特に何もなかった。穏やかな日。', category: 'dailyLife', source: 'system', kind: 'event' },
  { id: 'bedtime-book', text: '寝る前に本を少し読んだ。', category: 'dailyLife', source: 'system', kind: 'event' },
  { id: 'forgotten-task', text: '忘れていた用事をひとつ片付けた。', category: 'smallWin', source: 'system', kind: 'event' },
  { id: 'cool-wind', text: '外の風が少し涼しかった。', category: 'nature', source: 'system', kind: 'event' },
  { id: 'laundry', text: '洗濯物をたたんだ。部屋が少し落ち着いた。', category: 'dailyLife', source: 'system', kind: 'event' },
  { id: 'message', text: '返そうと思っていた連絡を返した。', category: 'dailyLife', source: 'system', kind: 'event' },
];

const defaultDailyNudgeCompletionMessage = '日替わりクエスト完了。今日も一歩。';
const dailyNudgeCelebrationMessages = [
  '今日の勝ち！まず一歩、いただきました。',
  'いいスタート。動いた時点でもう前進。',
  '小さくても確かな一歩。',
  '今日も自分を動かせた。ナイス。',
  'その一歩が、次の一歩を呼んでくる。',
  'まず動いた。それが強い。',
  '今日も習慣側に一票。',
  'やる気を待たずに動けた。勝ち。',
  '日替わり成功。ここからはボーナスタイム。',
  '今日を始めた。それだけでも十分。',
  'よし、今日のエンジン始動。',
  '一歩目クリア。あとは遊ぶだけ。',
  '今日もちゃんと前へ進んだ。',
  '小さな行動、でっかい価値。',
  'OK！今日も一つ積み上がった。',
];
const defaultDailyNudgeCandidates: DailyNudgeCandidate[] = [
  ['daily-nudge-water', '水を一杯飲もう', '水分補給クリア。体にやさしい一歩。', '健康'],
  ['daily-nudge-stretch-10', '10秒だけ背伸びしよう', '背伸び完了。少し空気が入れ替わった。', '健康'],
  ['daily-nudge-breath', '深呼吸をひとつしよう', '深呼吸完了。いま、ここに戻れた。', '休息'],
  ['daily-nudge-shoulder', '肩を3回まわそう', '肩まわし完了。こわばりを少し解除。', '健康'],
  ['daily-nudge-step', '立ち上がって一歩歩こう', '一歩完了。ちゃんと動き出した。', '行動開始'],
  ['daily-nudge-far-look', '遠くを10秒眺めよう', '視界リセット完了。目にも休憩を。', '休息'],
  ['daily-nudge-close-eyes', '目を閉じて5秒休もう', '5秒休憩完了。小さく回復。', '休息'],
  ['daily-nudge-desk-one', '机の上を一つだけ片付けよう', '一つ片付いた。場が少し軽くなった。', '行動開始'],
  ['daily-nudge-posture', '背筋を伸ばそう', '姿勢リセット完了。ちょっといい感じ。', '健康'],
  ['daily-nudge-done-one', '今日できたことを一つ思い出そう', 'できたこと発見。今日にもちゃんと進捗あり。', '感謝'],
  ['daily-nudge-like-one', '好きなものを一つ思い出そう', '好きなもの確認。心の燃料を補給。', '感謝'],
  ['daily-nudge-thanks-self', '自分にありがとうと言おう', '自分へのありがとう完了。ナイス存在。', '感謝'],
  ['daily-nudge-survive', '今日ここまで生きた。それだけで勝利。', '生存勝利。今日はもう土台クリア。', '休息'],
  ['daily-nudge-window', '窓の外をちらっと見よう', '外の世界を確認。視点が少し広がった。', '休息'],
  ['daily-nudge-smile', '口角を少しだけ上げてみよう', '表情ミニ調整完了。気分に小さなバフ。', '遊び'],
  ['daily-nudge-hands', '手をぎゅっと握って開こう', '手のリセット完了。操作感が戻った。', '健康'],
  ['daily-nudge-one-word', '今の気分を一言で言ってみよう', '気分ログ完了。自分の現在地を確認。', '記録'],
  ['daily-nudge-kind', '誰かにやさしくする作戦を一つ考えよう', 'やさしさ作戦セット。実行できたらボーナス。', '感謝'],
  ['daily-nudge-tiny-start', 'やることを一つだけ小さくしよう', '小さく分解完了。着手しやすくなった。', '行動開始'],
  ['daily-nudge-floor', '足の裏を床に感じてみよう', '接地完了。ここからまた始められる。', '休息'],
].map(([id, text, completionMessage, category], index) => ({
  id,
  text,
  completionMessage,
  category,
  enabled: true,
  order: (index + 1) * 10,
  createdAt: '2026-07-11T00:00:00.000Z',
}));

const weekdayOptions: { key: WeekdayKey; label: string }[] = [
  { key: 'monday', label: '月' },
  { key: 'tuesday', label: '火' },
  { key: 'wednesday', label: '水' },
  { key: 'thursday', label: '木' },
  { key: 'friday', label: '金' },
  { key: 'saturday', label: '土' },
  { key: 'sunday', label: '日' },
];

const defaultWeekdayTypeMap: Record<WeekdayKey, TemplateKind> = {
  monday: 'normal',
  tuesday: 'normal',
  wednesday: 'normal',
  thursday: 'normal',
  friday: 'normal',
  saturday: 'holiday',
  sunday: 'holiday',
};

const defaultRoutineSections: RoutineSection[] = [
  {
    id: 'morning',
    title: '朝',
    order: 10,
    items: [
      {
        id: 'morning-walk-or-running',
        label: '散歩 or ランニング',
        order: 10,
        source: 'default',
        createdAt: '2026-06-01T00:00:00.000Z',
        timerSeconds: 600,
      },
    ],
  },
  {
    id: 'noon',
    title: '昼',
    order: 20,
    items: [
      {
        id: 'noon-chores',
        label: '雑務',
        order: 10,
        source: 'default',
        createdAt: '2026-06-01T00:00:00.000Z',
        timerSeconds: 600,
      },
    ],
  },
  {
    id: 'evening',
    title: '夕',
    order: 30,
    items: [
      {
        id: 'evening-workout-or-stretch',
        label: '筋トレ or ストレッチ',
        order: 10,
        source: 'default',
        createdAt: '2026-06-01T00:00:00.000Z',
        timerSeconds: 300,
      },
    ],
  },
  {
    id: 'night',
    title: '夜',
    order: 40,
    items: [
      {
        id: 'night-reading',
        label: '読書',
        order: 10,
        source: 'default',
        createdAt: '2026-06-01T00:00:00.000Z',
        timerSeconds: 600,
      },
    ],
  },
  {
    id: 'advanced',
    title: 'アドバンスト',
    order: 50,
    items: [],
  },
];

const monthFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'long',
});

const questDateFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
});

const copySections = (sections: RoutineSection[]) =>
  sections.map((section) => ({
    ...section,
    items: section.items
      .map((item) => ({ ...item }))
      .sort((first, second) => first.order - second.order),
  }));

const areSectionsEqual = (
  firstSections: RoutineSection[] | null,
  secondSections: RoutineSection[],
) => {
  if (!firstSections) {
    return false;
  }

  return JSON.stringify(firstSections) === JSON.stringify(secondSections);
};

const removeFixedRoutineItems = (sections: RoutineSection[]) =>
  sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => !fixedRoutineIds.has(item.id)),
  }));

const createDefaultSettings = (): RoutineTemplateSettings => ({
  templates: {
    normal: copySections(defaultRoutineSections),
    holiday: copySections(defaultRoutineSections),
  },
  weekdayTypeMap: { ...defaultWeekdayTypeMap },
});

const createRoutineId = (sectionId: string) => {
  if (crypto.randomUUID) {
    return `${sectionId}-${crypto.randomUUID()}`;
  }

  return `${sectionId}-${Date.now()}`;
};

const mergeSections = (sections: RoutineSection[] | undefined) => {
  if (!sections) {
    return copySections(defaultRoutineSections);
  }

  const sectionMap = new Map(sections.map((section) => [section.id, section]));

  return copySections(
    defaultRoutineSections.map((defaultSection) => ({
      ...defaultSection,
      items: sectionMap.get(defaultSection.id)?.items ?? defaultSection.items,
    })),
  );
};

const loadLegacyRoutineSections = () => {
  const savedRoutines = localStorage.getItem(LEGACY_ROUTINES_STORAGE_KEY);

  if (!savedRoutines) {
    return undefined;
  }

  try {
    return mergeSections(JSON.parse(savedRoutines) as RoutineSection[]);
  } catch {
    return undefined;
  }
};

const loadTemplateSettings = () => {
  const defaultSettings = createDefaultSettings();
  const savedTemplates = localStorage.getItem(TEMPLATES_STORAGE_KEY);

  if (!savedTemplates) {
    const legacySections = loadLegacyRoutineSections();

    if (!legacySections) {
      return defaultSettings;
    }

    return {
      templates: {
        normal: legacySections,
        holiday: copySections(legacySections),
      },
      weekdayTypeMap: { ...defaultWeekdayTypeMap },
    };
  }

  try {
    const parsedSettings = JSON.parse(savedTemplates) as RoutineTemplateSettings;
    const parsedWeekdayTypeMap = Object.fromEntries(
      Object.entries(parsedSettings.weekdayTypeMap ?? {}).filter(
        ([, type]) => type === 'normal' || type === 'holiday',
      ),
    ) as Partial<Record<WeekdayKey, TemplateKind>>;

    return {
      templates: {
        normal: mergeSections(parsedSettings.templates?.normal),
        holiday: mergeSections(parsedSettings.templates?.holiday),
      },
      weekdayTypeMap: {
        ...defaultWeekdayTypeMap,
        ...parsedWeekdayTypeMap,
      },
    };
  } catch {
    return defaultSettings;
  }
};

const loadArchivedItems = () => {
  const savedArchivedItems = localStorage.getItem(ARCHIVED_ITEMS_STORAGE_KEY);

  if (!savedArchivedItems) {
    return {};
  }

  try {
    const parsedItems = JSON.parse(savedArchivedItems) as Record<string, ArchivedItem>;

    return Object.fromEntries(
      Object.entries(parsedItems).filter(([, archivedItem]) => (
        Boolean(archivedItem?.item?.id) &&
        Boolean(archivedItem?.item?.label) &&
        Boolean(archivedItem?.sectionId) &&
        Boolean(archivedItem?.sectionTitle) &&
        Boolean(archivedItem?.archivedAt)
      )),
    ) as Record<string, ArchivedItem>;
  } catch {
    return {};
  }
};

const loadItemNotes = (): ItemNotes => {
  const savedNotes = localStorage.getItem(ITEM_NOTES_STORAGE_KEY);

  if (!savedNotes) {
    return {};
  }

  try {
    const parsedNotes = JSON.parse(savedNotes) as Record<string, unknown>;

    return Object.fromEntries(
      Object.entries(parsedNotes)
        .filter(([, notesByItem]) => (
          notesByItem &&
          typeof notesByItem === 'object' &&
          !Array.isArray(notesByItem)
        ))
        .map(([dateKey, notesByItem]) => [
          dateKey,
          Object.fromEntries(
            Object.entries(notesByItem as Record<string, unknown>).filter(
              ([, note]) => typeof note === 'string',
            ),
          ),
        ]),
    ) as ItemNotes;
  } catch {
    return {};
  }
};

const normalizeCoreRoutinePlacements = (value: unknown): CoreRoutinePlacements => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...defaultCoreRoutinePlacements };
  }

  const parsedPlacements = value as Partial<Record<CoreRoutineId, Partial<{
    sectionId: unknown;
    order: unknown;
  }>>>;

  return Object.fromEntries(
    coreRoutineDefinitions.map((definition) => {
      const defaultPlacement = defaultCoreRoutinePlacements[definition.id];
      const parsedPlacement = parsedPlacements[definition.id];
      const sectionId = isStartSection(parsedPlacement?.sectionId)
        ? parsedPlacement.sectionId
        : defaultPlacement.sectionId;
      const order = Number.isFinite(Number(parsedPlacement?.order))
        ? Number(parsedPlacement?.order)
        : defaultPlacement.order;

      return [
        definition.id,
        {
          sectionId,
          order,
        },
      ];
    }),
  ) as CoreRoutinePlacements;
};

const loadCoreRoutinePlacements = () => {
  const savedPlacements = localStorage.getItem(CORE_ROUTINE_PLACEMENTS_STORAGE_KEY);

  if (!savedPlacements) {
    return { ...defaultCoreRoutinePlacements };
  }

  try {
    return normalizeCoreRoutinePlacements(JSON.parse(savedPlacements) as unknown);
  } catch {
    return { ...defaultCoreRoutinePlacements };
  }
};

const normalizeDailyNudgeCandidate = (
  candidate: Partial<DailyNudgeCandidate>,
  index: number,
): DailyNudgeCandidate | null => {
  if (typeof candidate.id !== 'string' || !candidate.id.trim()) {
    return null;
  }

  return {
    id: candidate.id,
    text: typeof candidate.text === 'string' && candidate.text.trim()
      ? candidate.text
      : '小さな一歩をひとつ選ぼう',
    completionMessage:
      typeof candidate.completionMessage === 'string' && candidate.completionMessage.trim()
        ? candidate.completionMessage
        : defaultDailyNudgeCompletionMessage,
    category: typeof candidate.category === 'string' && candidate.category.trim()
      ? candidate.category
      : 'その他',
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : true,
    order: Number.isFinite(Number(candidate.order))
      ? Number(candidate.order)
      : (index + 1) * 10,
    createdAt: typeof candidate.createdAt === 'string'
      ? candidate.createdAt
      : new Date().toISOString(),
  };
};

const loadDailyNudgeCandidates = () => {
  const savedCandidates = localStorage.getItem(DAILY_NUDGE_CANDIDATES_STORAGE_KEY);

  if (!savedCandidates) {
    return defaultDailyNudgeCandidates.map((candidate) => ({ ...candidate }));
  }

  try {
    const parsedCandidates = JSON.parse(savedCandidates) as unknown;

    if (!Array.isArray(parsedCandidates)) {
      return defaultDailyNudgeCandidates.map((candidate) => ({ ...candidate }));
    }

    const normalizedCandidates = parsedCandidates
      .map((candidate, index) =>
        normalizeDailyNudgeCandidate(candidate as Partial<DailyNudgeCandidate>, index),
      )
      .filter((candidate): candidate is DailyNudgeCandidate => candidate !== null)
      .sort((first, second) => first.order - second.order);

    return normalizedCandidates;
  } catch {
    return defaultDailyNudgeCandidates.map((candidate) => ({ ...candidate }));
  }
};

const loadDailyNudgeRecords = (): DailyNudgeRecords => {
  const savedRecords = localStorage.getItem(DAILY_NUDGE_RECORDS_STORAGE_KEY);

  if (!savedRecords) {
    return {};
  }

  try {
    const parsedRecords = JSON.parse(savedRecords) as Record<string, Partial<DailyNudgeRecord>>;

    if (!parsedRecords || typeof parsedRecords !== 'object' || Array.isArray(parsedRecords)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsedRecords)
        .filter(([dateKey, record]) => (
          /^\d{4}-\d{2}-\d{2}$/.test(dateKey) &&
          typeof record.candidateId === 'string' &&
          typeof record.text === 'string' &&
          typeof record.completionMessage === 'string' &&
          typeof record.category === 'string' &&
          typeof record.assignedAt === 'string'
        ))
        .map(([dateKey, record]) => [
          dateKey,
          {
            candidateId: record.candidateId ?? '',
            text: record.text ?? '',
            completionMessage: record.completionMessage ?? defaultDailyNudgeCompletionMessage,
            celebrationMessage: typeof record.celebrationMessage === 'string'
              ? record.celebrationMessage
              : undefined,
            category: record.category ?? 'その他',
            completed: Boolean(record.completed),
            assignedAt: record.assignedAt ?? new Date().toISOString(),
            completedAt: typeof record.completedAt === 'string' ? record.completedAt : undefined,
          },
        ]),
    ) as DailyNudgeRecords;
  } catch {
    return {};
  }
};

const loadGameMode = (): GameMode => {
  try {
    const savedMode = localStorage.getItem(GAME_MODE_STORAGE_KEY);

    if (!savedMode) {
      return 'player';
    }

    if (savedMode === 'developer') {
      return 'developer';
    }

    const parsedMode = JSON.parse(savedMode) as unknown;

    return parsedMode === 'developer' ? 'developer' : 'player';
  } catch {
    return 'player';
  }
};

const playerIconOptions: PlayerIconOption[] = [
  { id: 'smile', emoji: '🙂', label: 'スマイル' },
  { id: 'cool', emoji: '😎', label: 'クール' },
  { id: 'chick', emoji: '🐣', label: 'ひよこ' },
  { id: 'cat', emoji: '🐱', label: 'ねこ' },
  { id: 'dog', emoji: '🐶', label: 'いぬ' },
  { id: 'fox', emoji: '🦊', label: 'きつね' },
  { id: 'bear', emoji: '🐻', label: 'くま' },
  { id: 'sprout', emoji: '🌱', label: '芽' },
];

const defaultPlayerIconId: PlayerIconId = 'smile';

const isPlayerIconId = (value: unknown): value is PlayerIconId =>
  typeof value === 'string' && playerIconOptions.some((option) => option.id === value);

const getPlayerIconOption = (iconId: PlayerIconId) =>
  playerIconOptions.find((option) => option.id === iconId) ?? playerIconOptions[0];

const normalizePlayerProfile = (value: unknown): PlayerProfile => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { displayName: '', iconId: defaultPlayerIconId };
  }

  const parsedProfile = value as Partial<PlayerProfile>;

  return {
    displayName: typeof parsedProfile.displayName === 'string'
      ? parsedProfile.displayName.trim().slice(0, 20)
      : '',
    iconId: isPlayerIconId(parsedProfile.iconId) ? parsedProfile.iconId : defaultPlayerIconId,
  };
};

const loadPlayerProfile = () => {
  try {
    const savedProfile = localStorage.getItem(PLAYER_PROFILE_STORAGE_KEY);

    return savedProfile
      ? normalizePlayerProfile(JSON.parse(savedProfile) as unknown)
      : { displayName: '', iconId: defaultPlayerIconId };
  } catch {
    return { displayName: '', iconId: defaultPlayerIconId };
  }
};

const createDefaultPlayerUnlocks = (): PlayerUnlocks => ({
  totalQuestSlots: 4,
});

const normalizePlayerUnlocks = (value: unknown): PlayerUnlocks => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createDefaultPlayerUnlocks();
  }

  const parsedUnlocks = value as Partial<PlayerUnlocks & {
    questSlots?: Partial<Record<StartSection, unknown>>;
  }>;

  if (Number.isFinite(Number(parsedUnlocks.totalQuestSlots))) {
    return {
      totalQuestSlots: Math.max(4, Math.floor(Number(parsedUnlocks.totalQuestSlots))),
    };
  }

  const parsedQuestSlots = (
    parsedUnlocks.questSlots &&
    typeof parsedUnlocks.questSlots === 'object' &&
    !Array.isArray(parsedUnlocks.questSlots)
  )
    ? parsedUnlocks.questSlots as Partial<Record<StartSection, unknown>>
    : {};
  const purchasedSlots = dailySectionIds.reduce((total, sectionId) => {
    const legacySlots = Math.max(1, Math.floor(Number(parsedQuestSlots[sectionId]) || 1));

    return total + Math.max(0, legacySlots - 1);
  }, 0);

  return {
    totalQuestSlots: 4 + purchasedSlots,
  };
};

const loadPlayerUnlocks = () => {
  try {
    const savedUnlocks = localStorage.getItem(PLAYER_UNLOCKS_STORAGE_KEY);

    if (savedUnlocks) {
      return normalizePlayerUnlocks(JSON.parse(savedUnlocks) as unknown);
    }

    const legacyUnlocks = localStorage.getItem(LEGACY_PLAYER_UNLOCKS_STORAGE_KEY);

    return legacyUnlocks
      ? normalizePlayerUnlocks(JSON.parse(legacyUnlocks) as unknown)
      : createDefaultPlayerUnlocks();
  } catch {
    return createDefaultPlayerUnlocks();
  }
};

const getEffectiveQuestSlotLimit = (
  unlocks: PlayerUnlocks,
  balanceSettings: GameBalanceSettings,
) => {
  const exchangeRule = balanceSettings.questSlotExchange;
  const unlockedSlots = unlocks.totalQuestSlots;

  return Math.min(
    Math.max(unlockedSlots, exchangeRule.initialTotalSlots),
    exchangeRule.maxTotalSlots,
  );
};

const countFreeQuestItems = (sections: RoutineSection[]) =>
  sections
    .filter((section) => dailySectionIds.includes(section.id as StartSection))
    .reduce((total, section) =>
      total + section.items.filter((item) => !item.fixedKind).length,
    0);

const countCoreRoutineItems = () => fixedRoutineIds.size + coreRoutineDefinitions.length;

const normalizePointSettings = (settings: unknown): PointSettings => {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return defaultPointSettings;
  }

  const parsedSettings = settings as Partial<PointSettings & LegacyPointSettings>;
  const rounding = (
    parsedSettings.rounding === 'floor' ||
    parsedSettings.rounding === 'ceil' ||
    parsedSettings.rounding === 'round'
  )
    ? parsedSettings.rounding
    : defaultPointSettings.rounding;
  const normalizeTarget = (
    target: unknown,
    defaultTarget: PointSettings[PointTargetKind],
  ) => {
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
      return defaultTarget;
    }

    const parsedTarget = target as Partial<PointSettings[PointTargetKind]>;

    return {
      enabled: typeof parsedTarget.enabled === 'boolean'
        ? parsedTarget.enabled
        : defaultTarget.enabled,
      basePoints: Math.max(
        0,
        Number.isFinite(Number(parsedTarget.basePoints))
          ? Math.floor(Number(parsedTarget.basePoints))
          : defaultTarget.basePoints,
      ),
    };
  };

  return {
    rounding,
    wake: parsedSettings.wake
      ? normalizeTarget(parsedSettings.wake, defaultPointSettings.wake)
      : {
          enabled: Boolean(parsedSettings.includeWake ?? defaultPointSettings.wake.enabled),
          basePoints: defaultPointSettings.wake.basePoints,
        },
    normal: parsedSettings.normal
      ? normalizeTarget(parsedSettings.normal, defaultPointSettings.normal)
      : {
          enabled: true,
          basePoints: Math.max(
            0,
            Number.isFinite(Number(parsedSettings.baseQuestPoints))
              ? Math.floor(Number(parsedSettings.baseQuestPoints))
              : defaultPointSettings.normal.basePoints,
          ),
        },
    sleep: parsedSettings.sleep
      ? normalizeTarget(parsedSettings.sleep, defaultPointSettings.sleep)
      : {
          enabled: Boolean(parsedSettings.includeSleep ?? defaultPointSettings.sleep.enabled),
          basePoints: defaultPointSettings.sleep.basePoints,
        },
    advanced: parsedSettings.advanced
      ? normalizeTarget(parsedSettings.advanced, defaultPointSettings.advanced)
      : {
          enabled: Boolean(parsedSettings.includeAdvanced ?? defaultPointSettings.advanced.enabled),
          basePoints: defaultPointSettings.advanced.basePoints,
        },
    dailyNudge: normalizeTarget(parsedSettings.dailyNudge, defaultPointSettings.dailyNudge),
    coreMemo: normalizeTarget(parsedSettings.coreMemo, defaultPointSettings.coreMemo),
    coreEvents: normalizeTarget(parsedSettings.coreEvents, defaultPointSettings.coreEvents),
  };
};

const normalizeRankRules = (rules: unknown): RankRule[] => {
  const parsedRules = Array.isArray(rules)
    ? rules
      .map((rule) => ({
        rank: Math.floor(Number(rule?.rank)),
        requiredLifetimeStars: Math.floor(Number(rule?.requiredLifetimeStars)),
        pointMultiplier: Number(rule?.pointMultiplier),
      }))
      .filter((rule) => (
        Number.isFinite(rule.rank) &&
        Number.isFinite(rule.requiredLifetimeStars) &&
        Number.isFinite(rule.pointMultiplier) &&
        rule.rank >= 1 &&
        rule.requiredLifetimeStars >= 0 &&
        rule.pointMultiplier > 0
      ))
    : [];

  const rulesByRank = new Map(defaultRankRules.map((rule) => [rule.rank, rule]));

  parsedRules.forEach((rule) => {
    rulesByRank.set(rule.rank, rule);
  });

  const normalizedRules: RankRule[] = [];
  let previousRequiredLifetimeStars = 0;

  Array.from(rulesByRank.values())
    .sort((first, second) => first.rank - second.rank)
    .forEach((rule) => {
      let requiredLifetimeStars = rule.requiredLifetimeStars;

      if (rule.rank === 1) {
        requiredLifetimeStars = 0;
      } else {
        requiredLifetimeStars = Math.max(
          requiredLifetimeStars,
          rule.rank === 2 ? 5 : previousRequiredLifetimeStars + 1,
        );
      }

      normalizedRules.push({
        rank: rule.rank,
        requiredLifetimeStars,
        pointMultiplier: Math.max(0.1, rule.pointMultiplier),
      });
      previousRequiredLifetimeStars = requiredLifetimeStars;
    });

  return normalizedRules.length > 0 ? normalizedRules : defaultRankRules;
};

const normalizeQuestSlotExchange = (settings: unknown): QuestSlotExchangeRule => {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return defaultQuestSlotExchangeSettings;
  }

  const parsedSettings = settings as Partial<QuestSlotExchangeRule> &
    Partial<Record<StartSection, Partial<{
      enabled: boolean;
      initialSlots: number;
      maxSlots: number;
      price: number;
    }>>>;
  const legacyMorningSettings = parsedSettings.morning;
  const initialTotalSlots = Number(parsedSettings.initialTotalSlots);
  const maxTotalSlots = Number(parsedSettings.maxTotalSlots);
  const price = Number(parsedSettings.price ?? legacyMorningSettings?.price);
  const normalizedInitialTotalSlots = Math.max(
    1,
    Math.floor(
      Number.isFinite(initialTotalSlots)
        ? initialTotalSlots
        : defaultQuestSlotExchangeSettings.initialTotalSlots,
    ),
  );
  const normalizedMaxTotalSlots = Math.max(
    normalizedInitialTotalSlots,
    Math.floor(
      Number.isFinite(maxTotalSlots)
        ? maxTotalSlots
        : defaultQuestSlotExchangeSettings.maxTotalSlots,
    ),
  );

  return {
    enabled: typeof parsedSettings.enabled === 'boolean'
      ? parsedSettings.enabled
      : typeof legacyMorningSettings?.enabled === 'boolean'
      ? legacyMorningSettings.enabled
      : defaultQuestSlotExchangeSettings.enabled,
    initialTotalSlots: normalizedInitialTotalSlots,
    maxTotalSlots: normalizedMaxTotalSlots,
    price: Math.max(
      0,
      Math.floor(Number.isFinite(price) ? price : defaultQuestSlotExchangeSettings.price),
    ),
  };
};

const normalizeGameBalanceSettings = (settings: unknown): GameBalanceSettings => {
  if (!settings || typeof settings !== 'object') {
    return defaultGameBalanceSettings;
  }

  const parsedSettings = settings as Partial<GameBalanceSettings>;

  return {
    schemaVersion: GAME_BALANCE_SCHEMA_VERSION,
    pointSettings: normalizePointSettings(parsedSettings.pointSettings),
    rankRules: normalizeRankRules(parsedSettings.rankRules),
    questSlotExchange: normalizeQuestSlotExchange(parsedSettings.questSlotExchange),
  };
};

const loadGameBalanceSettings = () => {
  try {
    const savedSettings = localStorage.getItem(GAME_BALANCE_STORAGE_KEY);

    return savedSettings
      ? normalizeGameBalanceSettings(JSON.parse(savedSettings) as unknown)
      : defaultGameBalanceSettings;
  } catch {
    return defaultGameBalanceSettings;
  }
};

const createDefaultPlayerEconomy = (): PlayerEconomy => ({
  currentPoints: 0,
  lifetimeEarnedPoints: 0,
  lifetimeSpentPoints: 0,
  lifetimeStarsEarned: 0,
  playerRank: 1,
  pointLedger: [],
  pointAwards: {},
});

const normalizePlayerEconomy = (value: unknown): PlayerEconomy => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createDefaultPlayerEconomy();
  }

  const parsedEconomy = value as Partial<PlayerEconomy>;
  const rawPointAwards = (
    parsedEconomy.pointAwards &&
    typeof parsedEconomy.pointAwards === 'object' &&
    !Array.isArray(parsedEconomy.pointAwards)
  )
    ? parsedEconomy.pointAwards as Record<string, Partial<PointAwardRecord>>
    : {};
  const pointAwards = Object.fromEntries(
    Object.entries(rawPointAwards)
      .filter(([, award]) => (
        typeof award.achievementKey === 'string' &&
        typeof award.dateKey === 'string' &&
        typeof award.itemId === 'string' &&
        typeof award.itemLabel === 'string' &&
        typeof award.sectionId === 'string' &&
        Number.isFinite(Number(award.points))
      ))
      .map(([key, award]) => [
        key,
        {
          achievementKey: award.achievementKey ?? key,
          dateKey: award.dateKey ?? '',
          itemId: award.itemId ?? '',
          itemLabel: award.itemLabel ?? '',
          sectionId: award.sectionId ?? '',
          points: Math.max(0, Math.round(Number(award.points) || 0)),
          basePoints: Math.max(0, Math.round(Number(award.basePoints) || 0)),
          multiplier: Number.isFinite(Number(award.multiplier)) ? Number(award.multiplier) : 1,
          active: Boolean(award.active),
          awardedAt: typeof award.awardedAt === 'string' ? award.awardedAt : new Date().toISOString(),
          reversedAt: typeof award.reversedAt === 'string' ? award.reversedAt : undefined,
        },
      ]),
  );
  const pointLedger = Array.isArray(parsedEconomy.pointLedger)
    ? parsedEconomy.pointLedger.filter((entry): entry is PointLedgerEntry => (
        entry &&
        typeof entry === 'object' &&
        typeof entry.id === 'string' &&
        typeof entry.achievementKey === 'string' &&
        typeof entry.dateKey === 'string' &&
        typeof entry.itemId === 'string' &&
        typeof entry.itemLabel === 'string' &&
        typeof entry.sectionId === 'string' &&
        (entry.type === 'earn' || entry.type === 'reversal' || entry.type === 'spend') &&
        Number.isFinite(Number(entry.points))
      ))
    : [];

  return {
    currentPoints: Math.max(0, Math.round(Number(parsedEconomy.currentPoints) || 0)),
    lifetimeEarnedPoints: Math.max(0, Math.round(Number(parsedEconomy.lifetimeEarnedPoints) || 0)),
    lifetimeSpentPoints: Math.max(0, Math.round(Number(parsedEconomy.lifetimeSpentPoints) || 0)),
    lifetimeStarsEarned: Math.max(0, Math.round(Number(parsedEconomy.lifetimeStarsEarned) || 0)),
    playerRank: Math.max(1, Math.round(Number(parsedEconomy.playerRank) || 1)),
    pointLedger,
    pointAwards,
  };
};

const loadPlayerEconomy = () => {
  try {
    const savedEconomy = localStorage.getItem(PLAYER_ECONOMY_STORAGE_KEY);

    return savedEconomy
      ? normalizePlayerEconomy(JSON.parse(savedEconomy) as unknown)
      : createDefaultPlayerEconomy();
  } catch {
    return createDefaultPlayerEconomy();
  }
};

const getPlayerRankProgress = (
  lifetimeStarsEarned: number,
  gameBalance: GameBalanceSettings,
) => {
  const safeStars = Math.max(0, Math.floor(lifetimeStarsEarned));
  const rankRules = normalizeRankRules(gameBalance.rankRules);
  const currentRule = [...rankRules]
    .reverse()
    .find((rule) => safeStars >= rule.requiredLifetimeStars) ?? rankRules[0];
  const nextRule = rankRules.find((rule) => rule.requiredLifetimeStars > safeStars);

  return {
    rank: currentRule.rank,
    multiplier: currentRule.pointMultiplier,
    nextRank: nextRule?.rank ?? null,
    starsUntilNextRank: nextRule ? Math.max(nextRule.requiredLifetimeStars - safeStars, 0) : 0,
  };
};

const roundPoints = (points: number, rounding: PointSettings['rounding']) => {
  if (rounding === 'floor') {
    return Math.floor(points);
  }

  if (rounding === 'ceil') {
    return Math.ceil(points);
  }

  return Math.round(points);
};

const calculateQuestPoints = (
  gameBalance: GameBalanceSettings,
  multiplier: number,
  targetKind: PointTargetKind,
) => roundPoints(
  gameBalance.pointSettings[targetKind].basePoints * multiplier,
  gameBalance.pointSettings.rounding,
);

const isStartSection = (value: unknown): value is StartSection =>
  value === 'morning' || value === 'noon' || value === 'evening' || value === 'night';

const getMigratedStartSection = (settings: {
  startSection?: unknown;
  lifestyleType?: unknown;
}) => {
  if (isStartSection(settings.startSection)) {
    return settings.startSection;
  }

  if (settings.lifestyleType === 'night') {
    return 'night';
  }

  return 'morning';
};

const parseRhythmConfig = (settings: unknown): RhythmConfig => {
  if (!settings || typeof settings !== 'object') {
    return { ...defaultRhythmConfig };
  }

  const parsedSettings = settings as Partial<RhythmConfig> & {
    lifestyleType?: unknown;
  };

  return {
    ...defaultRhythmConfig,
    wakeTime: parsedSettings.wakeTime ?? defaultRhythmConfig.wakeTime,
    sleepTime: parsedSettings.sleepTime ?? defaultRhythmConfig.sleepTime,
    startSection: getMigratedStartSection(parsedSettings),
  };
};

const loadRhythmSettings = () => {
  const savedSettings =
    localStorage.getItem(RHYTHM_SETTINGS_STORAGE_KEY) ??
    localStorage.getItem(LEGACY_RHYTHM_SETTINGS_STORAGE_KEY);

  if (!savedSettings) {
    return defaultRhythmSettings;
  }

  try {
    const parsedSettings = JSON.parse(savedSettings) as
      | Partial<RhythmSettings>
      | (Partial<RhythmConfig> & { lifestyleType?: unknown });

    if (
      parsedSettings &&
      typeof parsedSettings === 'object' &&
      ('normal' in parsedSettings || 'holiday' in parsedSettings)
    ) {
      return {
        normal: parseRhythmConfig(parsedSettings.normal),
        holiday: parseRhythmConfig(parsedSettings.holiday),
      };
    }

    const migratedConfig = parseRhythmConfig(parsedSettings);

    return {
      normal: migratedConfig,
      holiday: { ...migratedConfig },
    };
  } catch {
    return defaultRhythmSettings;
  }
};

const loadDateSectionMap = (
  storageKey: string,
  legacyTemplateKey: 'dateOverrides' | 'dateSnapshots',
) => {
  const savedMap = localStorage.getItem(storageKey);

  if (savedMap) {
    try {
      const parsedMap = JSON.parse(savedMap) as Record<string, RoutineSection[]>;

      return Object.fromEntries(
        Object.entries(parsedMap).map(([dateKey, sections]) => [
          dateKey,
          mergeSections(sections),
        ]),
      );
    } catch {
      return {};
    }
  }

  const savedTemplates = localStorage.getItem(TEMPLATES_STORAGE_KEY);

  if (!savedTemplates) {
    return {};
  }

  try {
    const parsedSettings = JSON.parse(savedTemplates) as {
      templates?: Record<string, unknown>;
    };
    const legacyMap = parsedSettings.templates?.[legacyTemplateKey] as
      | Record<string, RoutineSection[]>
      | undefined;

    return Object.fromEntries(
      Object.entries(legacyMap ?? {}).map(([dateKey, sections]) => [
        dateKey,
        mergeSections(sections),
      ]),
    );
  } catch {
    return {};
  }
};

const getDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const weekdayShortLabels = ['日', '月', '火', '水', '木', '金', '土'];

const getNthMondayDate = (year: number, monthIndex: number, nth: number) => {
  const firstDate = new Date(year, monthIndex, 1);
  const firstMondayOffset = (8 - firstDate.getDay()) % 7;

  return 1 + firstMondayOffset + (nth - 1) * 7;
};

const getVernalEquinoxDay = (year: number) => {
  if (year <= 1979) {
    return Math.floor(20.8357 + 0.242194 * (year - 1980) - Math.floor((year - 1983) / 4));
  }

  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
};

const getAutumnalEquinoxDay = (year: number) => {
  if (year <= 1979) {
    return Math.floor(23.2588 + 0.242194 * (year - 1980) - Math.floor((year - 1983) / 4));
  }

  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
};

const setHoliday = (
  holidays: Map<string, string>,
  year: number,
  monthIndex: number,
  day: number,
  name: string,
) => {
  holidays.set(getDateKey(new Date(year, monthIndex, day)), name);
};

const getJapaneseNationalHolidayMap = (year: number) => {
  const holidays = new Map<string, string>();

  setHoliday(holidays, year, 0, 1, '元日');
  setHoliday(
    holidays,
    year,
    0,
    year >= 2000 ? getNthMondayDate(year, 0, 2) : 15,
    '成人の日',
  );
  if (year >= 1967) {
    setHoliday(holidays, year, 1, 11, '建国記念の日');
  }
  if (year >= 2020) {
    setHoliday(holidays, year, 1, 23, '天皇誕生日');
  } else if (year >= 1989 && year <= 2018) {
    setHoliday(holidays, year, 11, 23, '天皇誕生日');
  }
  setHoliday(holidays, year, 2, getVernalEquinoxDay(year), '春分の日');
  setHoliday(holidays, year, 3, 29, '昭和の日');
  setHoliday(holidays, year, 4, 3, '憲法記念日');
  setHoliday(holidays, year, 4, 4, 'みどりの日');
  setHoliday(holidays, year, 4, 5, 'こどもの日');

  if (year === 2020) {
    setHoliday(holidays, year, 6, 23, '海の日');
  } else if (year === 2021) {
    setHoliday(holidays, year, 6, 22, '海の日');
  } else if (year >= 2003) {
    setHoliday(holidays, year, 6, getNthMondayDate(year, 6, 3), '海の日');
  } else if (year >= 1996) {
    setHoliday(holidays, year, 6, 20, '海の日');
  }

  if (year === 2020) {
    setHoliday(holidays, year, 7, 10, '山の日');
  } else if (year === 2021) {
    setHoliday(holidays, year, 7, 8, '山の日');
  } else if (year >= 2016) {
    setHoliday(holidays, year, 7, 11, '山の日');
  }

  setHoliday(
    holidays,
    year,
    8,
    year >= 2003 ? getNthMondayDate(year, 8, 3) : 15,
    '敬老の日',
  );
  setHoliday(holidays, year, 8, getAutumnalEquinoxDay(year), '秋分の日');

  if (year === 2020) {
    setHoliday(holidays, year, 6, 24, 'スポーツの日');
  } else if (year === 2021) {
    setHoliday(holidays, year, 6, 23, 'スポーツの日');
  } else {
    setHoliday(
      holidays,
      year,
      9,
      year >= 2000 ? getNthMondayDate(year, 9, 2) : 10,
      year >= 2020 ? 'スポーツの日' : '体育の日',
    );
  }

  setHoliday(holidays, year, 10, 3, '文化の日');
  setHoliday(holidays, year, 10, 23, '勤労感謝の日');

  if (year === 2019) {
    setHoliday(holidays, year, 4, 1, '即位の日');
    setHoliday(holidays, year, 9, 22, '即位礼正殿の儀');
  }

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    for (let day = 2; day < daysInMonth; day += 1) {
      const dateKey = getDateKey(new Date(year, monthIndex, day));
      const previousDateKey = getDateKey(new Date(year, monthIndex, day - 1));
      const nextDateKey = getDateKey(new Date(year, monthIndex, day + 1));

      if (!holidays.has(dateKey) && holidays.has(previousDateKey) && holidays.has(nextDateKey)) {
        holidays.set(dateKey, '国民の休日');
      }
    }
  }

  Array.from(holidays.entries())
    .sort(([firstDateKey], [secondDateKey]) => firstDateKey.localeCompare(secondDateKey))
    .forEach(([dateKey]) => {
      const holidayDate = getDateFromKey(dateKey);

      if (holidayDate.getDay() !== 0) {
        return;
      }

      let substituteDate = new Date(
        holidayDate.getFullYear(),
        holidayDate.getMonth(),
        holidayDate.getDate() + 1,
      );

      while (holidays.has(getDateKey(substituteDate))) {
        substituteDate = new Date(
          substituteDate.getFullYear(),
          substituteDate.getMonth(),
          substituteDate.getDate() + 1,
        );
      }

      holidays.set(getDateKey(substituteDate), '振替休日');
    });

  return holidays;
};

const getHolidayName = (date: Date) =>
  getJapaneseNationalHolidayMap(date.getFullYear()).get(getDateKey(date)) ?? '';

const formatQuestDateLabel = (date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = weekdayShortLabels[date.getDay()];
  const holidayName = getHolidayName(date);
  const weekdayLabel = holidayName ? `${weekday}・${holidayName}` : `${weekday}曜日`;

  return `${year}年${month}月${day}日（${weekdayLabel}）`;
};

const getStableStringHash = (value: string) =>
  [...value].reduce((total, character) => total + character.charCodeAt(0), 0);

const getDailyOneLineExample = (dateKey: string) =>
  dailyOneLineExamples[
    getStableStringHash(`daily-one-line-example:${dateKey}`) % dailyOneLineExamples.length
  ];

const getDailyEventExample = (dateKey: string) =>
  dailyEventExamples[
    getStableStringHash(`daily-event-example:${dateKey}`) % dailyEventExamples.length
  ];

const getDailyNudgeRecentCandidateIds = (
  dateKey: string,
  records: DailyNudgeRecords,
) => {
  const date = getDateFromKey(dateKey);

  return Array.from({ length: 3 }, (_, index) => {
    const previousDateKey = getDateKey(addDays(date, -(index + 1)));

    return records[previousDateKey]?.candidateId;
  }).filter((candidateId): candidateId is string => Boolean(candidateId));
};

const selectDailyNudgeCandidate = (
  dateKey: string,
  candidates: DailyNudgeCandidate[],
  records: DailyNudgeRecords,
) => {
  const enabledCandidates = candidates
    .filter((candidate) => candidate.enabled)
    .sort((first, second) => first.order - second.order);

  if (enabledCandidates.length === 0) {
    return null;
  }

  const recentCandidateIds = new Set(getDailyNudgeRecentCandidateIds(dateKey, records));
  const candidatesWithoutRecent = enabledCandidates.filter(
    (candidate) => !recentCandidateIds.has(candidate.id),
  );
  const selectableCandidates =
    candidatesWithoutRecent.length > 0 ? candidatesWithoutRecent : enabledCandidates;
  const selectedIndex = getStableStringHash(dateKey) % selectableCandidates.length;

  return selectableCandidates[selectedIndex];
};

const createDailyNudgeRecord = (
  candidate: DailyNudgeCandidate,
): DailyNudgeRecord => ({
  candidateId: candidate.id,
  text: candidate.text,
  completionMessage: candidate.completionMessage,
  category: candidate.category,
  completed: false,
  assignedAt: new Date().toISOString(),
});

const getDailyNudgeCelebrationMessage = (dateKey: string, candidateId: string) => {
  const messageIndex = getStableStringHash(`${dateKey}:${candidateId}`) %
    dailyNudgeCelebrationMessages.length;

  return dailyNudgeCelebrationMessages[messageIndex];
};

const getDailyNudgeStreakCount = (records: DailyNudgeRecords, dateKey: string) => {
  let cursorDate = getDateFromKey(dateKey);

  if (!records[dateKey]?.completed) {
    cursorDate = addDays(cursorDate, -1);
  }

  let streakCount = 0;

  while (records[getDateKey(cursorDate)]?.completed) {
    streakCount += 1;
    cursorDate = addDays(cursorDate, -1);
  }

  return streakCount;
};

const getChecksStorageKey = (date: Date) => `hibitin:checks:${getDateKey(date)}`;
const getDailyMemoStorageKey = (date: Date) => `hibitin:memo:${getDateKey(date)}`;
const getDailyEventStorageKey = (date: Date) => `hibitin:events:${getDateKey(date)}`;
const getDailyTodosStorageKey = (date: Date) => `hibitin:todos:${getDateKey(date)}`;
const getDailyAnyMemoStorageKey = (date: Date) => `hibitin:anyMemo:${getDateKey(date)}`;
const getDailyScheduleStorageKey = (date: Date) => `hibitin:schedule:${getDateKey(date)}`;

type DailyTodoItem = {
  id: string;
  text: string;
  completed: boolean;
};

type DailyTodos = DailyTodoItem[];

type DailyScheduleItem = {
  id: string;
  time: string;
  text: string;
};

type DailySchedule = DailyScheduleItem[];
type DailyScheduleDrafts = Record<string, Pick<DailyScheduleItem, 'time' | 'text'>>;

type NormalizeDailyTodoOptions = {
  preserveEmptyIds?: Iterable<string>;
};

const createDailyTodoId = () =>
  `todo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const createDailyScheduleId = () =>
  `schedule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const createDailyTodoItem = (
  text = '',
  completed = false,
  id = createDailyTodoId(),
): DailyTodoItem => ({
  id,
  text,
  completed,
});

const hasTodoText = (todo: DailyTodoItem) => todo.text.trim().length > 0;

const normalizeDailyTodos = (
  todos: unknown,
  options: NormalizeDailyTodoOptions = {},
): DailyTodos => {
  if (!Array.isArray(todos)) {
    return [createDailyTodoItem()];
  }

  const preserveEmptyIds = new Set(options.preserveEmptyIds ?? []);
  const normalizedTodos = todos
    .map((todo) => {
      if (!todo || typeof todo !== 'object' || Array.isArray(todo)) {
        return null;
      }

      const parsedTodo = todo as Partial<DailyTodoItem>;
      const text = typeof parsedTodo.text === 'string' ? parsedTodo.text : '';

      return createDailyTodoItem(
        text,
        Boolean(parsedTodo.completed) && text.trim().length > 0,
        typeof parsedTodo.id === 'string' && parsedTodo.id.trim()
          ? parsedTodo.id
          : createDailyTodoId(),
      );
    })
    .filter((todo): todo is DailyTodoItem => Boolean(todo))
    .filter((todo) => hasTodoText(todo) || preserveEmptyIds.has(todo.id));

  if (normalizedTodos.every(hasTodoText)) {
    normalizedTodos.push(createDailyTodoItem());
  }

  return normalizedTodos;
};

const parseDailyTodos = (rawValue: string | null): DailyTodos => {
  if (!rawValue) {
    return [createDailyTodoItem()];
  }

  try {
    return normalizeDailyTodos(JSON.parse(rawValue) as unknown);
  } catch {
    return [createDailyTodoItem()];
  }
};

const serializeDailyTodos = (todos: DailyTodos) =>
  JSON.stringify(todos.filter(hasTodoText));

const loadDailyTodos = (date: Date) =>
  parseDailyTodos(localStorage.getItem(getDailyTodosStorageKey(date)));

const updateDailyTodoText = (
  todos: DailyTodos,
  id: string,
  text: string,
  options: NormalizeDailyTodoOptions = {},
): DailyTodos =>
  normalizeDailyTodos(
    todos.map((todo) =>
      todo.id === id
        ? {
            ...todo,
            text,
            completed: todo.completed && text.trim().length > 0,
          }
        : todo,
    ),
    {
      ...options,
      preserveEmptyIds: [...(options.preserveEmptyIds ?? []), id],
    },
  );

const toggleDailyTodoCompleted = (
  todos: DailyTodos,
  id: string,
  completed: boolean,
): DailyTodos =>
  normalizeDailyTodos(
    todos.map((todo) =>
      todo.id === id && hasTodoText(todo)
        ? {
            ...todo,
            completed,
          }
        : todo,
    ),
  );

const deleteDailyTodo = (todos: DailyTodos, id: string): DailyTodos =>
  normalizeDailyTodos(todos.filter((todo) => todo.id !== id));

const getDailyTodoStats = (todos: DailyTodos) => {
  const filledTodos = todos.filter(hasTodoText);
  const completedCount = filledTodos.filter((todo) => todo.completed).length;

  return {
    completedCount,
    totalCount: filledTodos.length,
  };
};

const hasScheduleText = (scheduleItem: DailyScheduleItem) =>
  scheduleItem.text.trim().length > 0;

const createDailyScheduleItem = (
  time = '',
  text = '',
  id = createDailyScheduleId(),
): DailyScheduleItem => ({
  id,
  time,
  text,
});

const sortDailySchedule = (schedule: DailySchedule) =>
  [...schedule].sort((first, second) => {
    const firstTime = first.time.trim();
    const secondTime = second.time.trim();

    if (firstTime && secondTime && firstTime !== secondTime) {
      return firstTime.localeCompare(secondTime);
    }

    if (firstTime && !secondTime) {
      return -1;
    }

    if (!firstTime && secondTime) {
      return 1;
    }

    return first.id.localeCompare(second.id);
  });

const normalizeDailySchedule = (schedule: unknown): DailySchedule => {
  if (!Array.isArray(schedule)) {
    return [];
  }

  return sortDailySchedule(
    schedule
      .map((scheduleItem) => {
        if (!scheduleItem || typeof scheduleItem !== 'object' || Array.isArray(scheduleItem)) {
          return null;
        }

        const parsedScheduleItem = scheduleItem as Partial<DailyScheduleItem>;

        return createDailyScheduleItem(
          typeof parsedScheduleItem.time === 'string' ? parsedScheduleItem.time : '',
          typeof parsedScheduleItem.text === 'string' ? parsedScheduleItem.text : '',
          typeof parsedScheduleItem.id === 'string' && parsedScheduleItem.id.trim()
            ? parsedScheduleItem.id
            : createDailyScheduleId(),
        );
      })
      .filter((scheduleItem): scheduleItem is DailyScheduleItem => Boolean(scheduleItem))
      .filter(hasScheduleText),
  );
};

const parseDailySchedule = (rawValue: string | null): DailySchedule => {
  if (!rawValue) {
    return [];
  }

  try {
    return normalizeDailySchedule(JSON.parse(rawValue) as unknown);
  } catch {
    return [];
  }
};

const serializeDailySchedule = (schedule: DailySchedule) =>
  JSON.stringify(sortDailySchedule(schedule.filter(hasScheduleText)));

const loadDailySchedule = (date: Date) =>
  parseDailySchedule(localStorage.getItem(getDailyScheduleStorageKey(date)));

const upsertDailyScheduleItem = (
  schedule: DailySchedule,
  item: DailyScheduleItem,
): DailySchedule => {
  const exists = schedule.some((scheduleItem) => scheduleItem.id === item.id);

  return normalizeDailySchedule(exists
    ? schedule.map((scheduleItem) => (scheduleItem.id === item.id ? item : scheduleItem))
    : [...schedule, item]);
};

const deleteDailyScheduleItem = (schedule: DailySchedule, id: string): DailySchedule =>
  normalizeDailySchedule(schedule.filter((scheduleItem) => scheduleItem.id !== id));

type DailyRecordEntry = {
  text: string;
  saved: boolean;
};

type DailyRecordEntries = DailyRecordEntry[];

const createDailyRecordEntry = (text = '', saved = false): DailyRecordEntry => ({
  text,
  saved,
});

const hasSavedDailyRecordEntries = (entries: DailyRecordEntries) =>
  entries.some((entry) => entry.saved && hasMeaningfulText(entry.text));

const normalizeDailyRecordEntries = (entries: unknown): DailyRecordEntries => {
  if (!Array.isArray(entries)) {
    return [createDailyRecordEntry()];
  }

  const normalizedEntries = entries
    .map((entry) => {
      if (typeof entry === 'string') {
        return createDailyRecordEntry(entry, hasMeaningfulText(entry));
      }

      if (
        entry &&
        typeof entry === 'object' &&
        'text' in entry &&
        typeof (entry as { text: unknown }).text === 'string'
      ) {
        const text = (entry as { text: string }).text;
        const saved =
          'saved' in entry && typeof (entry as { saved: unknown }).saved === 'boolean'
            ? (entry as { saved: boolean }).saved
            : hasMeaningfulText(text);

        return createDailyRecordEntry(text, saved && hasMeaningfulText(text));
      }

      return null;
    })
    .filter((entry): entry is DailyRecordEntry => Boolean(entry))
    .filter((entry) => entry.saved || hasMeaningfulText(entry.text));

  const hasDraft = normalizedEntries.some((entry) => !entry.saved);

  if (!hasDraft) {
    normalizedEntries.push(createDailyRecordEntry());
  }

  return normalizedEntries.length > 0 ? normalizedEntries : [createDailyRecordEntry()];
};

const parseDailyRecordEntries = (rawValue: string | null): DailyRecordEntries => {
  if (!rawValue) {
    return [createDailyRecordEntry()];
  }

  try {
    const parsedValue = JSON.parse(rawValue) as unknown;

    if (Array.isArray(parsedValue)) {
      return normalizeDailyRecordEntries(parsedValue);
    }
  } catch {
    // Legacy records were stored as a plain string. Treat it as the first entry.
  }

  return normalizeDailyRecordEntries([rawValue]);
};

const serializeDailyRecordEntries = (entries: DailyRecordEntries) =>
  JSON.stringify(
    entries
      .filter((entry) => entry.saved && hasMeaningfulText(entry.text))
      .map((entry) => entry.text),
  );

const updateDailyRecordEntry = (
  entries: DailyRecordEntries,
  index: number,
  value: string,
): DailyRecordEntries => {
  const nextEntries = [...entries];
  const currentEntry = nextEntries[index] ?? createDailyRecordEntry();

  nextEntries[index] = {
    ...currentEntry,
    text: value,
    saved: currentEntry.saved && hasMeaningfulText(value),
  };

  return normalizeDailyRecordEntries(nextEntries);
};

const updateDailyRecordEntryAsSaved = (
  entries: DailyRecordEntries,
  index: number,
  value: string,
): DailyRecordEntries => {
  const nextEntries = [...entries];
  const currentEntry = nextEntries[index] ?? createDailyRecordEntry();

  nextEntries[index] = {
    ...currentEntry,
    text: value,
    saved: hasMeaningfulText(value),
  };

  return normalizeDailyRecordEntries(
    nextEntries.map((entry) => ({
      ...entry,
      saved: hasMeaningfulText(entry.text),
    })),
  );
};

const saveDailyRecordEntry = (
  entries: DailyRecordEntries,
  index: number,
): DailyRecordEntries => {
  const nextEntries = [...entries];
  const currentEntry = nextEntries[index] ?? createDailyRecordEntry();

  if (!hasMeaningfulText(currentEntry.text)) {
    return normalizeDailyRecordEntries(nextEntries);
  }

  nextEntries[index] = {
    ...currentEntry,
    saved: true,
  };

  return normalizeDailyRecordEntries(nextEntries);
};

const adjustTextareaHeight = (textarea: HTMLTextAreaElement | null) => {
  if (!textarea) {
    return;
  }

  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
};

const loadDailyMemo = (date: Date) =>
  parseDailyRecordEntries(localStorage.getItem(getDailyMemoStorageKey(date)));

const loadDailyEvent = (date: Date) =>
  parseDailyRecordEntries(localStorage.getItem(getDailyEventStorageKey(date)));

const loadDailyAnyMemo = (date: Date) =>
  localStorage.getItem(getDailyAnyMemoStorageKey(date)) ?? '';

const getDateFromKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number);

  return new Date(year, month - 1, day);
};

const addDays = (date: Date, days: number) => {
  const nextDate = new Date(date);

  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
};

const getDailyMessage = (dateKey: string, displayName = '') => {
  const messageIndex = [...dateKey].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  ) % dailyMessages.length;
  const safeDisplayName = displayName.trim();

  if (safeDisplayName && messageIndex === 0) {
    return `📖 ${safeDisplayName}、今日も自分のページを一枚。`;
  }

  if (safeDisplayName && messageIndex === 1) {
    return `🌿 ${safeDisplayName}、ゆるっと今日を遊ぼう。`;
  }

  return dailyMessages[messageIndex];
};

const isDateKeyBefore = (dateKey: string, compareDateKey: string) => dateKey < compareDateKey;

const addMonths = (date: Date, months: number) => {
  const nextDate = new Date(date.getFullYear(), date.getMonth(), 1);

  nextDate.setMonth(nextDate.getMonth() + months);

  return nextDate;
};

const getMonthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const getMonthDateCells = (monthDate: Date) => {
  const firstDate = getMonthStart(monthDate);
  const daysInMonth = new Date(
    firstDate.getFullYear(),
    firstDate.getMonth() + 1,
    0,
  ).getDate();
  const leadingBlankCount = (firstDate.getDay() + 6) % 7;
  const dates = Array.from(
    { length: daysInMonth },
    (_, index) => new Date(firstDate.getFullYear(), firstDate.getMonth(), index + 1),
  );

  return [
    ...Array.from({ length: leadingBlankCount }, () => null),
    ...dates,
  ];
};

const getWeekdayKey = (date: Date): WeekdayKey => {
  const weekdays: WeekdayKey[] = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];

  return weekdays[date.getDay()];
};

const loadCheckedItems = (date: Date) => {
  const savedChecks = localStorage.getItem(getChecksStorageKey(date));

  if (!savedChecks) {
    return {};
  }

  try {
    return JSON.parse(savedChecks) as Record<string, boolean>;
  } catch {
    return {};
  }
};

const getBaseTemplateForDate = (settings: RoutineTemplateSettings, date: Date) => {
  const weekday = getWeekdayKey(date);

  return settings.weekdayTypeMap[weekday] ?? 'normal';
};

const resolveDateTarget = (
  settings: RoutineTemplateSettings,
  dateOverrides: Record<string, RoutineSection[]>,
  dateSnapshots: Record<string, RoutineSection[]>,
  date: Date,
  todayKey: string,
): ResolvedEditTarget => {
  const dateKey = getDateKey(date);

  if (dateOverrides[dateKey]) {
    return { kind: 'date', dateKey, baseTemplate: getBaseTemplateForDate(settings, date) };
  }

  if (isDateKeyBefore(dateKey, todayKey) && dateSnapshots[dateKey]) {
    return { kind: 'date', dateKey, baseTemplate: getBaseTemplateForDate(settings, date) };
  }

  return { kind: 'template', template: getBaseTemplateForDate(settings, date) };
};

const resolveEditTarget = (
  editTargetKey: EditTargetKey,
): ResolvedEditTarget => {
  return { kind: 'template', template: editTargetKey };
};

const getSectionsForTarget = (
  settings: RoutineTemplateSettings,
  dateOverrides: Record<string, RoutineSection[]>,
  dateSnapshots: Record<string, RoutineSection[]>,
  target: ResolvedEditTarget,
  todayKey: string,
) => {
  if (target.kind === 'template') {
    return settings.templates[target.template];
  }

  return (
    dateOverrides[target.dateKey] ??
    (isDateKeyBefore(target.dateKey, todayKey) ? dateSnapshots[target.dateKey] : undefined) ??
    settings.templates[target.baseTemplate]
  );
};

const getTargetLabel = (target: ResolvedEditTarget) => {
  if (target.kind === 'template') {
    return target.template === 'normal' ? 'ノーマルルーティン' : '休日ルーティン';
  }

  return `${target.dateKey}だけのルーティン`;
};

const getTemplateLabel = (template: TemplateKind) =>
  template === 'normal' ? 'ノーマル' : '休日';

const getRoutineKindLabel = (kind: RoutineKind) => {
  if (kind === 'custom') {
    return '個別カスタム';
  }

  return kind === 'normal' ? 'ノーマルルーティン' : '休日ルーティン';
};

const dailySectionIds: StartSection[] = ['morning', 'noon', 'evening', 'night'];
const bonusSectionId = 'advanced';
const GAME_BALANCE_SCHEMA_VERSION = 3;
const defaultPointSettings: PointSettings = {
  rounding: 'round',
  wake: {
    enabled: true,
    basePoints: 5,
  },
  normal: {
    enabled: true,
    basePoints: 10,
  },
  sleep: {
    enabled: true,
    basePoints: 5,
  },
  advanced: {
    enabled: false,
    basePoints: 0,
  },
  dailyNudge: {
    enabled: true,
    basePoints: 10,
  },
  coreMemo: {
    enabled: true,
    basePoints: 5,
  },
  coreEvents: {
    enabled: true,
    basePoints: 5,
  },
};
const defaultRankRules: RankRule[] = [
  { rank: 1, requiredLifetimeStars: 0, pointMultiplier: 1 },
  { rank: 2, requiredLifetimeStars: 5, pointMultiplier: 1.1 },
  { rank: 3, requiredLifetimeStars: 15, pointMultiplier: 1.2 },
  { rank: 4, requiredLifetimeStars: 30, pointMultiplier: 1.3 },
  { rank: 5, requiredLifetimeStars: 50, pointMultiplier: 1.4 },
  { rank: 6, requiredLifetimeStars: 80, pointMultiplier: 1.5 },
  { rank: 7, requiredLifetimeStars: 120, pointMultiplier: 1.75 },
];
const defaultQuestSlotExchangeSettings: QuestSlotExchangeRule = {
  enabled: true,
  initialTotalSlots: 4,
  maxTotalSlots: 10,
  price: 100,
};
const defaultGameBalanceSettings: GameBalanceSettings = {
  schemaVersion: GAME_BALANCE_SCHEMA_VERSION,
  pointSettings: defaultPointSettings,
  rankRules: defaultRankRules,
  questSlotExchange: defaultQuestSlotExchangeSettings,
};
const MASTERY_RULES = {
  earlyStarMax: 3,
  earlyStarStreakDays: 5,
  fourthStarStreakDays: 15,
  fifthStarStreakDays: 30,
  missedDaysForStarLoss: 2,
};
const TROPHY_RULES = {
  starsRequired: 5,
  maxTrophies: 5,
};

const sectionOrderByStartSection: Record<StartSection, string[]> = {
  morning: ['morning', 'noon', 'evening', 'night', 'advanced'],
  noon: ['noon', 'evening', 'night', 'morning', 'advanced'],
  evening: ['evening', 'night', 'morning', 'noon', 'advanced'],
  night: ['night', 'morning', 'noon', 'evening', 'advanced'],
};

const createFixedRoutineItem = (
  kind: 'wake' | 'sleep',
  time: string,
): RoutineItem => ({
  id: kind === 'wake' ? 'morning-wake-up' : 'night-sleep',
  label: kind === 'wake' ? '起床' : '就寝',
  order: kind === 'wake' ? -20 : 9990,
  source: 'default',
  createdAt: '2026-06-01T00:00:00.000Z',
  fixedKind: kind,
  time,
});

const buildDisplaySections = (
  sections: RoutineSection[],
  rhythmConfig: RhythmConfig,
) => {
  const sectionOrder = sectionOrderByStartSection[rhythmConfig.startSection];
  const dailySectionOrder = sectionOrder.filter((sectionId) =>
    dailySectionIds.includes(sectionId as StartSection),
  );
  const wakeSectionId = rhythmConfig.startSection;
  const sleepSectionId = dailySectionOrder[dailySectionOrder.length - 1];

  return removeFixedRoutineItems(sections)
    .map((section) => {
      const fixedItems: RoutineItem[] = [];

      if (section.id === wakeSectionId) {
        fixedItems.push(createFixedRoutineItem('wake', rhythmConfig.wakeTime));
      }

      if (section.id === sleepSectionId) {
        fixedItems.push(createFixedRoutineItem('sleep', rhythmConfig.sleepTime));
      }

      return {
        ...section,
        items: [...fixedItems, ...section.items].sort(
          (first, second) => first.order - second.order,
        ),
      };
    })
    .sort(
      (first, second) =>
        sectionOrder.indexOf(first.id) - sectionOrder.indexOf(second.id),
    );
};

const calculateCompletionStats = (
  sections: RoutineSection[],
  checks: Record<string, boolean>,
) => {
  const routineItems = sections
    .filter((section) => section.id !== bonusSectionId)
    .flatMap((section) => section.items);
  const totalCount = routineItems.length;

  if (totalCount === 0) {
    return { completedCount: 0, totalCount, rate: null };
  }

  const completedCount = routineItems.filter((item) => checks[item.id]).length;

  return {
    completedCount,
    totalCount,
    rate: Math.round((completedCount / totalCount) * 100),
  };
};

const getCompletionRank = (rate: number | null) => {
  if (rate === null) {
    return { icon: '', label: '', level: 'empty' };
  }

  if (rate === 100) {
    return { icon: '🏆', label: 'PERFECT!!', level: 'perfect' };
  }

  if (rate >= 75) {
    return { icon: '🌟', label: 'EXCELLENT!', level: 'excellent' };
  }

  if (rate >= 50) {
    return { icon: '🎉', label: 'GREAT!', level: 'great' };
  }

  if (rate >= 25) {
    return { icon: '👍', label: 'GOOD!', level: 'good' };
  }

  if (rate >= 1) {
    return { icon: '👟', label: 'START!', level: 'start' };
  }

  return { icon: '☕', label: 'READY?', level: 'ready' };
};

const getVisualProgressRank = (
  completionRank: ReturnType<typeof getCompletionRank>,
  completedCount: number,
  isDailyNudgeCompleted: boolean,
) => {
  if (completedCount === 0 && isDailyNudgeCompleted) {
    return { icon: '🐣', label: 'FIRST', level: 'first' };
  }

  return completionRank;
};

const getItemTimerSeconds = (item: RoutineItem) => {
  if (item.timerSeconds && item.timerSeconds > 0) {
    return Math.round(item.timerSeconds);
  }

  if (item.timerMinutes && item.timerMinutes > 0) {
    return Math.round(item.timerMinutes * 60);
  }

  return undefined;
};

const getTimerParts = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const restSeconds = safeSeconds % 60;

  return { hours, minutes, seconds: restSeconds };
};

const getSecondsFromTimerParts = (parts: {
  hours: number;
  minutes: number;
  seconds: number;
}) => (parts.hours * 3600) + (parts.minutes * 60) + parts.seconds;

const formatTimerDuration = (seconds: number) => {
  const parts = getTimerParts(seconds);
  const labels = [];

  if (parts.hours > 0) {
    labels.push(`${parts.hours}時間`);
  }

  if (parts.minutes > 0) {
    labels.push(`${parts.minutes}分`);
  }

  if (parts.seconds > 0 || labels.length === 0) {
    labels.push(`${parts.seconds}秒`);
  }

  return labels.join('');
};

const formatTimerSeconds = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;

  return `${minutes}:${String(restSeconds).padStart(2, '0')}`;
};

const createRunningTimer = (
  itemId: string,
  label: string,
  durationSeconds: number,
  remainingSeconds: number,
): ActiveTimer => {
  const now = Date.now();

  return {
    itemId,
    label,
    durationSeconds,
    totalSeconds: durationSeconds,
    remainingSeconds,
    startedAt: new Date(now).toISOString(),
    endsAt: new Date(now + remainingSeconds * 1000).toISOString(),
    status: 'running',
    isRunning: true,
    isComplete: false,
  };
};

const normalizeActiveTimer = (
  timer: ActiveTimer | null | undefined,
  now = Date.now(),
): ActiveTimer | null => {
  if (!timer) {
    return null;
  }

  const durationSeconds = timer.durationSeconds ?? timer.totalSeconds;
  const totalSeconds = timer.totalSeconds ?? durationSeconds;

  if (timer.status === 'running' && timer.endsAt) {
    const remainingSeconds = Math.ceil((new Date(timer.endsAt).getTime() - now) / 1000);

    if (remainingSeconds <= 0) {
      return {
        ...timer,
        durationSeconds,
        totalSeconds,
        remainingSeconds: 0,
        status: 'finished',
        isRunning: false,
        isComplete: true,
      };
    }

    return {
      ...timer,
      durationSeconds,
      totalSeconds,
      remainingSeconds,
      status: 'running',
      isRunning: true,
      isComplete: false,
    };
  }

  if (timer.status === 'finished' || timer.isComplete) {
    return {
      ...timer,
      durationSeconds,
      totalSeconds,
      remainingSeconds: 0,
      status: 'finished',
      isRunning: false,
      isComplete: true,
    };
  }

  return {
    ...timer,
    durationSeconds,
    totalSeconds,
    endsAt: null,
    status: 'paused',
    isRunning: false,
    isComplete: false,
  };
};

const normalizePausedTimers = (timers: Record<string, PausedTimer> | undefined) => {
  if (!timers) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(timers)
      .filter(([, timer]) => timer && timer.remainingSeconds > 0)
      .map(([itemId, timer]) => {
        const durationSeconds = timer.durationSeconds ?? timer.totalSeconds;

        return [
          itemId,
          {
            ...timer,
            durationSeconds,
            totalSeconds: timer.totalSeconds ?? durationSeconds,
            status: 'paused' as const,
          },
        ];
      }),
  );
};

const loadStoredTimerState = (): StoredTimerState => {
  const savedTimerState = localStorage.getItem(TIMER_STATE_STORAGE_KEY);

  if (!savedTimerState) {
    return {
      activeTimer: null,
      pausedTimers: {},
    };
  }

  try {
    const parsedTimerState = JSON.parse(savedTimerState) as Partial<StoredTimerState>;

    return {
      activeTimer: normalizeActiveTimer(parsedTimerState.activeTimer),
      pausedTimers: normalizePausedTimers(parsedTimerState.pausedTimers),
    };
  } catch {
    return {
      activeTimer: null,
      pausedTimers: {},
    };
  }
};

const isMasteryTargetSectionId = (sectionId: string): sectionId is StartSection =>
  dailySectionIds.includes(sectionId as StartSection);

const createEmptyMasteryProgress = (): MasteryProgressState => ({
  totalCompletions: 0,
  currentStreak: 0,
  bestStreak: 0,
  starCount: 0,
  trophyCount: 0,
  achievedStreakForNextStar: 0,
  missedStreak: 0,
});

const getNextMasteryStarThreshold = (starCount: number) => {
  if (starCount < MASTERY_RULES.earlyStarMax) {
    return MASTERY_RULES.earlyStarStreakDays;
  }

  if (starCount === 3) {
    return MASTERY_RULES.fourthStarStreakDays;
  }

  if (starCount === 4) {
    return MASTERY_RULES.fifthStarStreakDays;
  }

  return null;
};

const applyMasteryDayResult = (
  progress: MasteryProgressState,
  isCompleted: boolean,
): MasteryProgressState => {
  const nextProgress = { ...progress };

  if (isCompleted) {
    nextProgress.totalCompletions += 1;
    nextProgress.currentStreak += 1;
    nextProgress.bestStreak = Math.max(nextProgress.bestStreak, nextProgress.currentStreak);
    nextProgress.missedStreak = 0;
    nextProgress.achievedStreakForNextStar += 1;

    const nextStarThreshold = getNextMasteryStarThreshold(nextProgress.starCount);

    if (
      nextStarThreshold !== null &&
      nextProgress.achievedStreakForNextStar >= nextStarThreshold
    ) {
      nextProgress.starCount += 1;
      nextProgress.achievedStreakForNextStar = 0;

      if (nextProgress.starCount >= TROPHY_RULES.starsRequired) {
        nextProgress.trophyCount = Math.min(
          TROPHY_RULES.maxTrophies,
          nextProgress.trophyCount + 1,
        );
        nextProgress.starCount = 0;
        nextProgress.achievedStreakForNextStar = 0;
      }
    }

    return nextProgress;
  }

  nextProgress.currentStreak = 0;
  nextProgress.achievedStreakForNextStar = 0;
  nextProgress.missedStreak += 1;

  if (nextProgress.missedStreak >= MASTERY_RULES.missedDaysForStarLoss) {
    nextProgress.starCount = Math.max(0, nextProgress.starCount - 1);
    nextProgress.missedStreak = 0;
  }

  return nextProgress;
};

const formatMasteryStars = (starCount: number, trophyCount = 0) => {
  const stars = starCount > 0 ? '⭐'.repeat(starCount) : '';
  const trophies = trophyCount > 0 ? '🏆'.repeat(Math.min(trophyCount, TROPHY_RULES.maxTrophies)) : '';

  return [stars, trophies].filter(Boolean).join(' ');
};

const getMasteryAdminRuleText = () => [
  '対象：朝・昼・夕・夜のフリークエスト',
  `星1〜3：${MASTERY_RULES.earlyStarStreakDays}日連続達成ごとに+1`,
  `星4：星3到達後、${MASTERY_RULES.fourthStarStreakDays}日連続達成で獲得`,
  `星5：星4到達後、${MASTERY_RULES.fifthStarStreakDays}日連続達成で獲得`,
  `${MASTERY_RULES.missedDaysForStarLoss}日連続未達成で星-1`,
  '星5到達で🏆+1、その後星0へ戻る',
  `トロフィー上限：${TROPHY_RULES.maxTrophies}個`,
  '起床・就寝・アドバンストは対象外',
];

const getPointAchievementKey = (dateKey: string, itemId: string) => `${dateKey}:${itemId}`;
const getDailyNudgePointAchievementKey = (dateKey: string) => `daily-nudge:${dateKey}`;
const getCoreRoutinePointAchievementKey = (dateKey: string, kind: CoreRoutineKind) =>
  `core-${kind === 'memo' ? 'memo' : 'events'}:${dateKey}`;

const getCoreRoutinePointTargetKind = (kind: CoreRoutineKind): PointTargetKind =>
  kind === 'memo' ? 'coreMemo' : 'coreEvents';

const getCoreRoutinePointLabel = (kind: CoreRoutineKind) =>
  kind === 'memo' ? '今日のひとことを残す' : '今日のできごとを残す';

const getCoreRoutinePointMessage = (kind: CoreRoutineKind) =>
  kind === 'memo' ? '今日の想いを残しました' : '今日の記憶を残しました';

const calculateActiveEarnedPointsForDate = (
  pointAwards: Record<string, PointAwardRecord>,
  dateKey: string,
) =>
  Object.values(pointAwards).reduce((totalPoints, award) => {
    if (!award.active || award.dateKey !== dateKey || award.points <= 0) {
      return totalPoints;
    }

    return totalPoints + award.points;
  }, 0);

const findItemContext = (itemId: string, sections: RoutineSection[]) => {
  for (const section of sections) {
    const item = section.items.find((sectionItem) => sectionItem.id === itemId);

    if (item) {
      return { item, section };
    }
  }

  return null;
};

const getPointTargetKind = (
  item: RoutineItem,
  sectionId: string,
): PointTargetKind | null => {
  if (item.fixedKind === 'wake') {
    return 'wake';
  }

  if (item.fixedKind === 'sleep') {
    return 'sleep';
  }

  if (sectionId === bonusSectionId) {
    return 'advanced';
  }

  return isMasteryTargetSectionId(sectionId) ? 'normal' : null;
};

const isPointEligibleItem = (
  item: RoutineItem,
  sectionId: string,
  gameBalance: GameBalanceSettings,
) => {
  const targetKind = getPointTargetKind(item, sectionId);

  return targetKind ? gameBalance.pointSettings[targetKind].enabled : false;
};

const getStoredCheckDateKeys = () => {
  const prefix = 'hibitin:checks:';

  return Object.keys(localStorage)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length))
    .filter((dateKey) => /^\d{4}-\d{2}-\d{2}$/.test(dateKey))
    .sort();
};

const calculateArchivedItemMasteryStats = (
  itemId: string,
  todayKey: string,
  checkOverrides: Record<string, Record<string, boolean>>,
) => {
  const storedDateKeys = getStoredCheckDateKeys().filter((dateKey) => dateKey <= todayKey);
  let progress = createEmptyMasteryProgress();
  let lastSeenDateKey = todayKey;

  for (
    let date = getDateFromKey(storedDateKeys[0] ?? todayKey);
    getDateKey(date) <= todayKey;
    date = addDays(date, 1)
  ) {
    const dateKey = getDateKey(date);
    const checks = checkOverrides[dateKey] ?? loadCheckedItems(date);

    if (itemId in checks) {
      progress = applyMasteryDayResult(progress, Boolean(checks[itemId]));
      lastSeenDateKey = dateKey;
    }
  }

  return {
    ...progress,
    isHallOfFame: progress.trophyCount > 0,
    lastSeenDateKey,
  };
};

const calculateMasteryStats = (
  settings: RoutineTemplateSettings,
  dateOverrides: Record<string, RoutineSection[]>,
  dateSnapshots: Record<string, RoutineSection[]>,
  rhythmSettings: RhythmSettings,
  todayKey: string,
  currentDisplaySections: RoutineSection[],
  checkOverrides: Record<string, Record<string, boolean>>,
) => {
  const storedDateKeys = getStoredCheckDateKeys().filter((dateKey) => dateKey <= todayKey);
  const firstDateKey = storedDateKeys[0] ?? todayKey;
  const currentItemIds = new Set(
    currentDisplaySections
      .filter((section) => isMasteryTargetSectionId(section.id))
      .flatMap((section) => section.items.filter((item) => !item.fixedKind).map((item) => item.id)),
  );
  const currentItemOrder = new Map<string, number>();

  currentDisplaySections
    .filter((section) => isMasteryTargetSectionId(section.id))
    .forEach((section, sectionIndex) => {
      section.items.filter((item) => !item.fixedKind).forEach((item, itemIndex) => {
        currentItemOrder.set(item.id, sectionIndex * 1000 + itemIndex);
      });
    });

  const stats = new Map<string, MasteryStats>();
  const progressByItemId = new Map<string, MasteryProgressState>();

  for (
    let date = getDateFromKey(firstDateKey);
    getDateKey(date) <= todayKey;
    date = addDays(date, 1)
  ) {
    const dateKey = getDateKey(date);
    const baseTemplate = getBaseTemplateForDate(settings, date);
    const target = resolveDateTarget(settings, dateOverrides, dateSnapshots, date, todayKey);
    const sections = buildDisplaySections(
      removeFixedRoutineItems(
        getSectionsForTarget(settings, dateOverrides, dateSnapshots, target, todayKey),
      ),
      rhythmSettings[baseTemplate],
    ).filter((section) => isMasteryTargetSectionId(section.id));
    const checks = checkOverrides[dateKey] ?? loadCheckedItems(date);

    sections.forEach((section, sectionIndex) => {
      section.items.filter((item) => !item.fixedKind).forEach((item, itemIndex) => {
        const order = currentItemOrder.get(item.id) ?? sectionIndex * 1000 + itemIndex;
        const currentProgress = progressByItemId.get(item.id) ?? createEmptyMasteryProgress();
        const nextProgress = applyMasteryDayResult(currentProgress, Boolean(checks[item.id]));

        progressByItemId.set(item.id, nextProgress);
        stats.set(item.id, {
          itemId: item.id,
          label: item.label,
          sectionId: section.id,
          sectionTitle: section.title,
          order,
          totalCompletions: nextProgress.totalCompletions,
          currentStreak: nextProgress.currentStreak,
          bestStreak: nextProgress.bestStreak,
          starCount: nextProgress.starCount,
          trophyCount: nextProgress.trophyCount,
          isHallOfFame: nextProgress.trophyCount > 0,
          isCurrentItem: currentItemIds.has(item.id),
          lastSeenDateKey: dateKey,
        });
      });
    });
  }

  return Array.from(stats.values())
    .filter((itemStats) => itemStats.isCurrentItem || itemStats.totalCompletions > 0)
    .sort((first, second) => {
      if (first.isCurrentItem !== second.isCurrentItem) {
        return first.isCurrentItem ? -1 : 1;
      }

      if (first.order !== second.order) {
        return first.order - second.order;
      }

      return first.label.localeCompare(second.label, 'ja');
    });
};

function App() {
  const today = useMemo(() => new Date(), []);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const backupDownloadUrlRef = useRef<string | null>(null);
  const dailyMemoTextareaRef = useRef<HTMLTextAreaElement>(null);
  const dailyEventTextareaRef = useRef<HTMLTextAreaElement>(null);
  const historyDailyMemoTextareaRef = useRef<HTMLTextAreaElement>(null);
  const historyDailyEventTextareaRef = useRef<HTMLTextAreaElement>(null);
  const initialTimerStateRef = useRef<StoredTimerState | null>(null);
  const alertedFinishedTimerIdRef = useRef<string | null>(null);
  const exchangeLockRef = useRef(false);
  const questEmoteTimeoutsRef = useRef<Record<string, number>>({});
  const getInitialTimerState = () => {
    if (!initialTimerStateRef.current) {
      initialTimerStateRef.current = loadStoredTimerState();
    }

    return initialTimerStateRef.current;
  };
  const todayKey = getDateKey(today);
  const yesterday = useMemo(() => addDays(today, -1), [today]);
  const [page, setPage] = useState<PageName>('today');
  const [selectedDate, setSelectedDate] = useState(() => today);
  const [historySelectedDate, setHistorySelectedDate] = useState<Date | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => getMonthStart(today));
  const [scheduleMonth, setScheduleMonth] = useState(() => getMonthStart(today));
  const [scheduleView, setScheduleView] = useState<ScheduleViewName>('schedule');
  const [recordMonth, setRecordMonth] = useState(() => getMonthStart(today));
  const [recordView, setRecordView] = useState<RecordViewName>('memo');
  const [selectedScheduleDate, setSelectedScheduleDate] = useState<Date | null>(null);
  const [scheduleRevision, setScheduleRevision] = useState(0);
  const [scheduleDrafts, setScheduleDrafts] = useState<DailyScheduleDrafts>({});
  const [selectedRecordDate, setSelectedRecordDate] = useState<Date | null>(null);
  const [recordRevision, setRecordRevision] = useState(0);
  const selectedDateKey = getDateKey(selectedDate);
  const questDateLabel = formatQuestDateLabel(selectedDate);
  const historySelectedDateKey = historySelectedDate ? getDateKey(historySelectedDate) : '';
  const historyDateLabel = historySelectedDate ? formatQuestDateLabel(historySelectedDate) : '';
  const checksStorageKey = getChecksStorageKey(selectedDate);
  const memoStorageKey = getDailyMemoStorageKey(selectedDate);
  const eventStorageKey = getDailyEventStorageKey(selectedDate);
  const anyMemoStorageKey = getDailyAnyMemoStorageKey(selectedDate);
  const isToday = selectedDateKey === todayKey;
  const [templateSettings, setTemplateSettings] = useState<RoutineTemplateSettings>(() =>
    loadTemplateSettings(),
  );
  const [dateSnapshots, setDateSnapshots] = useState<Record<string, RoutineSection[]>>(() =>
    loadDateSectionMap(DATE_SNAPSHOTS_STORAGE_KEY, 'dateSnapshots'),
  );
  const [dateOverrides, setDateOverrides] = useState<Record<string, RoutineSection[]>>(() =>
    loadDateSectionMap(DATE_OVERRIDES_STORAGE_KEY, 'dateOverrides'),
  );
  const [archivedItems, setArchivedItems] = useState<Record<string, ArchivedItem>>(() =>
    loadArchivedItems(),
  );
  const [itemNotes, setItemNotes] = useState<ItemNotes>(() => loadItemNotes());
  const [coreRoutinePlacements, setCoreRoutinePlacements] = useState<CoreRoutinePlacements>(() =>
    loadCoreRoutinePlacements(),
  );
  const [dailyNudgeCandidates, setDailyNudgeCandidates] = useState<DailyNudgeCandidate[]>(() =>
    loadDailyNudgeCandidates(),
  );
  const [dailyNudgeRecords, setDailyNudgeRecords] = useState<DailyNudgeRecords>(() =>
    loadDailyNudgeRecords(),
  );
  const [gameMode, setGameMode] = useState<GameMode>(() => loadGameMode());
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile>(() => loadPlayerProfile());
  const [playerUnlocks, setPlayerUnlocks] = useState<PlayerUnlocks>(() => loadPlayerUnlocks());
  const dailyMessage = getDailyMessage(selectedDateKey, playerProfile.displayName);
  const dailyOneLineExample = getDailyOneLineExample(selectedDateKey);
  const dailyEventExample = getDailyEventExample(selectedDateKey);
  const dailyEventLabel = isToday ? '今日のできごと' : '昨日のできごと';
  const dailyOneLineLabel = isToday ? '今日のひとこと' : '昨日のひとこと';
  const dailyTodoLabel = isToday ? '今日のやること' : '昨日のやること';
  const dailyAnyMemoLabel = 'なんでもメモ';
  const dailyNudgeDisplayLabel = isToday ? '本日の日替わりクエスト' : '昨日の日替わりクエスト';
  const coreRoutineDateLabel = isToday ? '今日' : '昨日';
  const selectedDateEarnedPointsLabel = isToday ? '本日の獲得' : '昨日の獲得';
  const playerDisplayName = playerProfile.displayName.trim() || 'ゲストさん';
  const playerIcon = getPlayerIconOption(playerProfile.iconId);
  const [gameBalance, setGameBalance] = useState<GameBalanceSettings>(() =>
    loadGameBalanceSettings(),
  );
  const [gameBalanceDraft, setGameBalanceDraft] = useState<GameBalanceSettings>(() =>
    loadGameBalanceSettings(),
  );
  const [playerEconomy, setPlayerEconomy] = useState<PlayerEconomy>(() =>
    loadPlayerEconomy(),
  );
  const [pointToast, setPointToast] = useState<PointToast | null>(null);
  const [pointToastQueue, setPointToastQueue] = useState<PointToast[]>([]);
  const [dailyNudgePointFlash, setDailyNudgePointFlash] = useState<PointToast | null>(null);
  const [exchangeToast, setExchangeToast] = useState<ExchangeToast | null>(null);
  const [questEmotes, setQuestEmotes] = useState<Record<string, QuestEmote>>({});
  const [isRankPanelOpen, setIsRankPanelOpen] = useState(false);
  const [rhythmSettings, setRhythmSettings] = useState<RhythmSettings>(() =>
    loadRhythmSettings(),
  );
  const [editTargetKey, setEditTargetKey] = useState<EditTargetKey>('normal');
  const [isEditMode, setIsEditMode] = useState(false);
  const [isHistoryEditMode, setIsHistoryEditMode] = useState(false);
  const [editModeStartSections, setEditModeStartSections] =
    useState<RoutineSection[] | null>(null);
  const [lastCopiedSections, setLastCopiedSections] =
    useState<RoutineSection[] | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [timerSettingItemId, setTimerSettingItemId] = useState<string | null>(null);
  const [timerDraftParts, setTimerDraftParts] = useState(() => getTimerParts(300));
  const [noteEditorTarget, setNoteEditorTarget] = useState<NoteEditorTarget | null>(null);
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(
    () => getInitialTimerState().activeTimer,
  );
  const [pausedTimers, setPausedTimers] = useState<Record<string, PausedTimer>>(
    () => getInitialTimerState().pausedTimers,
  );
  const [timerAlertSilenced, setTimerAlertSilenced] = useState(false);
  const [notificationPermission, setNotificationPermission] =
    useState<TimerNotificationPermission>(() => {
      if (!('Notification' in window)) {
        return 'unsupported';
      }

      return window.Notification.permission;
    });
  const [sortingSectionId, setSortingSectionId] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>(() =>
    loadCheckedItems(today),
  );
  const [historyCheckedItems, setHistoryCheckedItems] = useState<Record<string, boolean>>({});
  const [backupMessage, setBackupMessage] = useState('');
  const [backupDownload, setBackupDownload] = useState<BackupDownload | null>(null);
  const [dailyEvent, setDailyEvent] = useState(() => loadDailyEvent(today));
  const [dailyEventDateKey, setDailyEventDateKey] = useState(() => todayKey);
  const [dailyMemo, setDailyMemo] = useState(() => loadDailyMemo(today));
  const [dailyMemoDateKey, setDailyMemoDateKey] = useState(() => todayKey);
  const [dailyTodos, setDailyTodos] = useState(() => loadDailyTodos(today));
  const [dailyTodosDateKey, setDailyTodosDateKey] = useState(() => todayKey);
  const [dailyAnyMemo, setDailyAnyMemo] = useState(() => loadDailyAnyMemo(today));
  const [dailyAnyMemoDateKey, setDailyAnyMemoDateKey] = useState(() => todayKey);
  const [historyDailyEvent, setHistoryDailyEvent] = useState<DailyRecordEntries>([
    createDailyRecordEntry(),
  ]);
  const [historyDailyEventDateKey, setHistoryDailyEventDateKey] = useState('');
  const [historyDailyMemo, setHistoryDailyMemo] = useState<DailyRecordEntries>([
    createDailyRecordEntry(),
  ]);
  const [historyDailyMemoDateKey, setHistoryDailyMemoDateKey] = useState('');
  const [historyDailyTodos, setHistoryDailyTodos] = useState<DailyTodos>([
    createDailyTodoItem(),
  ]);
  const [historyDailyTodosDateKey, setHistoryDailyTodosDateKey] = useState('');
  const [historyDailyAnyMemo, setHistoryDailyAnyMemo] = useState('');
  const [historyDailyAnyMemoDateKey, setHistoryDailyAnyMemoDateKey] = useState('');
  const dailyTodoStats = getDailyTodoStats(dailyTodos);
  const historyDailyTodoStats = getDailyTodoStats(historyDailyTodos);
  const editTarget = resolveEditTarget(editTargetKey);
  const selectedDateTemplate = getBaseTemplateForDate(templateSettings, selectedDate);
  const selectedDateEditTarget: ResolvedEditTarget = {
    kind: 'date',
    dateKey: selectedDateKey,
    baseTemplate: selectedDateTemplate,
  };
  const selectedDateTarget = resolveDateTarget(
    templateSettings,
    dateOverrides,
    dateSnapshots,
    selectedDate,
    todayKey,
  );
  const displayedTarget =
    page === 'today'
      ? isEditMode
        ? selectedDateEditTarget
        : selectedDateTarget
      : editTarget;
  const routineSections = removeFixedRoutineItems(getSectionsForTarget(
    templateSettings,
    dateOverrides,
    dateSnapshots,
    displayedTarget,
    todayKey,
  ));
  const rhythmForDisplay =
    page === 'today' ? rhythmSettings[selectedDateTemplate] : rhythmSettings[editTargetKey];
  const displaySections = buildDisplaySections(routineSections, rhythmForDisplay);
  const todayMasterySections = buildDisplaySections(
    removeFixedRoutineItems(
      getSectionsForTarget(
        templateSettings,
        dateOverrides,
        dateSnapshots,
        selectedDateTarget,
        todayKey,
      ),
    ),
    rhythmSettings[selectedDateTemplate],
  );
  const isCheckMode = page === 'today';
  const canEditRoutines = page === 'settings' || (page === 'today' && isEditMode);
  const totalQuestSlotLimit = getEffectiveQuestSlotLimit(playerUnlocks, gameBalance);
  const usedQuestSlots = countFreeQuestItems(displaySections);
  const remainingQuestSlots = Math.max(0, totalQuestSlotLimit - usedQuestSlots);
  const coreRoutineCount = countCoreRoutineItems();
  const freeQuestCount = countFreeQuestItems(displaySections);
  const selectedDateStats = calculateCompletionStats(displaySections, checkedItems);
  const selectedDateRank = getCompletionRank(selectedDateStats.rate);
  const selectedCoreRoutineCompletion = getCoreRoutineCompletion(dailyMemo, dailyEvent);
  const selectedCoreRoutineCanComplete = selectedDateKey <= todayKey;
  const selectedDailyNudgeRecord = dailyNudgeRecords[selectedDateKey] ?? null;
  const selectedDateVisualRank = getVisualProgressRank(
    selectedDateRank,
    selectedDateStats.completedCount,
    Boolean(selectedDailyNudgeRecord?.completed),
  );
  const selectedDailyNudgeStreak = useMemo(
    () => getDailyNudgeStreakCount(dailyNudgeRecords, selectedDateKey),
    [dailyNudgeRecords, selectedDateKey],
  );
  const selectedDailyNudgeAward =
    playerEconomy.pointAwards[getDailyNudgePointAchievementKey(selectedDateKey)];
  const selectedDateEarnedPoints = useMemo(
    () => calculateActiveEarnedPointsForDate(playerEconomy.pointAwards, selectedDateKey),
    [playerEconomy.pointAwards, selectedDateKey],
  );
  const historyDateTemplate = historySelectedDate
    ? getBaseTemplateForDate(templateSettings, historySelectedDate)
    : 'normal';
  const historyRoutineKind: RoutineKind | null = historySelectedDate
    ? dateOverrides[historySelectedDateKey]
      ? 'custom'
      : historyDateTemplate
    : null;
  const historyRoutineKindLabel = historyRoutineKind ? getRoutineKindLabel(historyRoutineKind) : '';
  const historyDateTarget = historySelectedDate
    ? resolveDateTarget(
        templateSettings,
        dateOverrides,
        dateSnapshots,
        historySelectedDate,
        todayKey,
      )
    : null;
  const historyDateEditTarget: ResolvedEditTarget | null = historySelectedDate
    ? {
        kind: 'date',
        dateKey: historySelectedDateKey,
        baseTemplate: historyDateTemplate,
      }
    : null;
  const historySections = historyDateTarget
    ? removeFixedRoutineItems(getSectionsForTarget(
        templateSettings,
        dateOverrides,
        dateSnapshots,
        historyDateTarget,
        todayKey,
      ))
    : [];
  const historyDisplaySections = historySelectedDate
    ? buildDisplaySections(
        historySections,
        rhythmSettings[historyDateTemplate],
      )
    : [];
  const historyDateStats = calculateCompletionStats(
    historyDisplaySections,
    historyCheckedItems,
  );
  const historyDateRank = getCompletionRank(historyDateStats.rate);
  const historyCoreRoutineCompletion = getCoreRoutineCompletion(
    historyDailyMemo,
    historyDailyEvent,
  );
  const historyCoreRoutineCanComplete = Boolean(
    historySelectedDateKey && historySelectedDateKey <= todayKey,
  );
  const masteryStats = useMemo(() => calculateMasteryStats(
    templateSettings,
    dateOverrides,
    dateSnapshots,
    rhythmSettings,
    todayKey,
    todayMasterySections,
    {
      [selectedDateKey]: checkedItems,
      ...(historySelectedDate ? { [historySelectedDateKey]: historyCheckedItems } : {}),
    },
  ), [
    checkedItems,
    dateOverrides,
    dateSnapshots,
    historyCheckedItems,
    historySelectedDate,
    historySelectedDateKey,
    rhythmSettings,
    selectedDateKey,
    templateSettings,
    todayKey,
    todayMasterySections,
  ]);
  const masteryStatsByItemId = useMemo(() => new Map(
    masteryStats.map((itemStats) => [itemStats.itemId, itemStats]),
  ), [masteryStats]);
  const estimatedLifetimeStarsEarned = useMemo(() => (
    masteryStats.reduce(
      (totalStars, itemStats) =>
        totalStars + itemStats.starCount + (itemStats.trophyCount * TROPHY_RULES.starsRequired),
      0,
    )
  ), [masteryStats]);
  const playerRankProgress = useMemo(
    () => getPlayerRankProgress(playerEconomy.lifetimeStarsEarned, gameBalance),
    [gameBalance, playerEconomy.lifetimeStarsEarned],
  );
  const archivedItemEntries = useMemo(() => (
    Object.values(archivedItems)
      .map((archivedItem) => ({
        archivedItem,
        stats: calculateArchivedItemMasteryStats(
          archivedItem.item.id,
          todayKey,
          {
            [selectedDateKey]: checkedItems,
            ...(historySelectedDate ? { [historySelectedDateKey]: historyCheckedItems } : {}),
          },
        ),
      }))
      .sort((first, second) =>
        second.archivedItem.archivedAt.localeCompare(first.archivedItem.archivedAt),
      )
  ), [
    archivedItems,
    checkedItems,
    historyCheckedItems,
    historySelectedDate,
    historySelectedDateKey,
    selectedDateKey,
    todayKey,
  ]);
  const calendarMonthLabel = monthFormatter.format(calendarMonth);
  const scheduleMonthLabel = monthFormatter.format(scheduleMonth);
  const scheduleMonthDates = useMemo(
    () => getMonthDateCells(scheduleMonth).filter((date): date is Date => Boolean(date)),
    [scheduleMonth, scheduleRevision],
  );
  const recordMonthLabel = monthFormatter.format(recordMonth);
  const recordMonthDates = useMemo(
    () => getMonthDateCells(recordMonth).filter((date): date is Date => Boolean(date)),
    [recordMonth, recordRevision],
  );
  const completionCalendarDays = useMemo(() => (
    getMonthDateCells(calendarMonth).map((date) => {
      if (!date) {
        return null;
      }

      const dateKey = getDateKey(date);
      const baseTemplate = getBaseTemplateForDate(templateSettings, date);
      const routineKind: RoutineKind = dateOverrides[dateKey] ? 'custom' : baseTemplate;
      const target = resolveDateTarget(
        templateSettings,
        dateOverrides,
        dateSnapshots,
        date,
        todayKey,
      );
      const sections = removeFixedRoutineItems(getSectionsForTarget(
        templateSettings,
        dateOverrides,
        dateSnapshots,
        target,
        todayKey,
      ));
      const daySections = buildDisplaySections(sections, rhythmSettings[baseTemplate]);
      const stats = calculateCompletionStats(daySections, loadCheckedItems(date));
      const rank = getCompletionRank(stats.rate);
      const calendarRank = getVisualProgressRank(
        rank,
        stats.completedCount,
        Boolean(dailyNudgeRecords[dateKey]?.completed),
      );
      const isDailyNudgeOnlyCompleted = calendarRank.level === 'first';
      const shouldShowCalendarStamp =
        isDailyNudgeOnlyCompleted || Boolean(stats.rate && stats.rate > 0);

      return {
        date,
        dateKey,
        day: date.getDate(),
        rate: stats.rate,
        rankIcon: calendarRank.icon,
        rankLabel: calendarRank.label.replace(/!+$/, ''),
        rankLevel: calendarRank.level,
        shouldShowStamp: shouldShowCalendarStamp,
        totalCount: stats.totalCount,
        isFuture: dateKey > todayKey,
        isToday: dateKey === todayKey,
        isSelected: historySelectedDate ? dateKey === historySelectedDateKey : false,
        routineKind,
      };
    })
  ), [
    calendarMonth,
    dateOverrides,
    dateSnapshots,
    dailyNudgeRecords,
    checkedItems,
    historyCheckedItems,
    historySelectedDateKey,
    rhythmSettings,
    templateSettings,
    todayKey,
  ]);
  useEffect(() => {
    setCheckedItems(loadCheckedItems(selectedDate));
  }, [selectedDate]);

  useEffect(() => {
    setDailyEvent(loadDailyEvent(selectedDate));
    setDailyEventDateKey(selectedDateKey);
    setDailyMemo(loadDailyMemo(selectedDate));
    setDailyMemoDateKey(selectedDateKey);
    setDailyTodos(loadDailyTodos(selectedDate));
    setDailyTodosDateKey(selectedDateKey);
    setDailyAnyMemo(loadDailyAnyMemo(selectedDate));
    setDailyAnyMemoDateKey(selectedDateKey);
  }, [selectedDate, selectedDateKey]);

  useEffect(() => {
    if (!historySelectedDate) {
      setHistoryCheckedItems({});
      setHistoryDailyEvent([createDailyRecordEntry()]);
      setHistoryDailyEventDateKey('');
      setHistoryDailyMemo([createDailyRecordEntry()]);
      setHistoryDailyMemoDateKey('');
      setHistoryDailyTodos([createDailyTodoItem()]);
      setHistoryDailyTodosDateKey('');
      setHistoryDailyAnyMemo('');
      setHistoryDailyAnyMemoDateKey('');
      return;
    }

    setHistoryCheckedItems(loadCheckedItems(historySelectedDate));
    setHistoryDailyEvent(loadDailyEvent(historySelectedDate));
    setHistoryDailyEventDateKey(historySelectedDateKey);
    setHistoryDailyMemo(loadDailyMemo(historySelectedDate));
    setHistoryDailyMemoDateKey(historySelectedDateKey);
    setHistoryDailyTodos(loadDailyTodos(historySelectedDate));
    setHistoryDailyTodosDateKey(historySelectedDateKey);
    setHistoryDailyAnyMemo(loadDailyAnyMemo(historySelectedDate));
    setHistoryDailyAnyMemoDateKey(historySelectedDateKey);
  }, [historySelectedDate, historySelectedDateKey]);

  useEffect(() => {
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templateSettings));
  }, [templateSettings]);

  useEffect(() => {
    localStorage.setItem(DATE_SNAPSHOTS_STORAGE_KEY, JSON.stringify(dateSnapshots));
  }, [dateSnapshots]);

  useEffect(() => {
    localStorage.setItem(DATE_OVERRIDES_STORAGE_KEY, JSON.stringify(dateOverrides));
  }, [dateOverrides]);

  useEffect(() => {
    localStorage.setItem(ARCHIVED_ITEMS_STORAGE_KEY, JSON.stringify(archivedItems));
  }, [archivedItems]);

  useEffect(() => {
    localStorage.setItem(ITEM_NOTES_STORAGE_KEY, JSON.stringify(itemNotes));
  }, [itemNotes]);

  useEffect(() => {
    localStorage.setItem(
      CORE_ROUTINE_PLACEMENTS_STORAGE_KEY,
      JSON.stringify(coreRoutinePlacements),
    );
  }, [coreRoutinePlacements]);

  useEffect(() => {
    localStorage.setItem(
      DAILY_NUDGE_CANDIDATES_STORAGE_KEY,
      JSON.stringify(dailyNudgeCandidates),
    );
  }, [dailyNudgeCandidates]);

  useEffect(() => {
    localStorage.setItem(DAILY_NUDGE_RECORDS_STORAGE_KEY, JSON.stringify(dailyNudgeRecords));
  }, [dailyNudgeRecords]);

  useEffect(() => {
    setDailyNudgeRecords((currentRecords) => {
      if (currentRecords[selectedDateKey]) {
        return currentRecords;
      }

      const candidate = selectDailyNudgeCandidate(
        selectedDateKey,
        dailyNudgeCandidates,
        currentRecords,
      );

      if (!candidate) {
        return currentRecords;
      }

      return {
        ...currentRecords,
        [selectedDateKey]: createDailyNudgeRecord(candidate),
      };
    });
  }, [dailyNudgeCandidates, selectedDateKey]);

  useEffect(() => {
    localStorage.setItem(GAME_MODE_STORAGE_KEY, JSON.stringify(gameMode));
  }, [gameMode]);

  useEffect(() => {
    localStorage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify(playerProfile));
  }, [playerProfile]);

  useEffect(() => {
    localStorage.setItem(PLAYER_UNLOCKS_STORAGE_KEY, JSON.stringify(playerUnlocks));
    localStorage.removeItem(LEGACY_PLAYER_UNLOCKS_STORAGE_KEY);
  }, [playerUnlocks]);

  useEffect(() => {
    localStorage.setItem(GAME_BALANCE_STORAGE_KEY, JSON.stringify(gameBalance));
  }, [gameBalance]);

  useEffect(() => {
    localStorage.removeItem('hibitin:sectionStars:v1');
  }, []);

  useEffect(() => {
    localStorage.setItem(PLAYER_ECONOMY_STORAGE_KEY, JSON.stringify(playerEconomy));
  }, [playerEconomy]);

  useEffect(() => {
    setPlayerEconomy((currentEconomy) => {
      const nextLifetimeStarsEarned = Math.max(
        currentEconomy.lifetimeStarsEarned,
        estimatedLifetimeStarsEarned,
      );
      const nextRank = getPlayerRankProgress(nextLifetimeStarsEarned, gameBalance).rank;

      if (
        currentEconomy.lifetimeStarsEarned === nextLifetimeStarsEarned &&
        currentEconomy.playerRank === nextRank
      ) {
        return currentEconomy;
      }

      return {
        ...currentEconomy,
        lifetimeStarsEarned: nextLifetimeStarsEarned,
        playerRank: nextRank,
      };
    });
  }, [estimatedLifetimeStarsEarned, gameBalance]);

  const enqueuePointToast = (toast: PointToast) => {
    setPointToastQueue((currentQueue) => [...currentQueue, toast]);
  };

  useEffect(() => {
    if (pointToast || pointToastQueue.length === 0) {
      return;
    }

    const [nextToast, ...remainingToasts] = pointToastQueue;

    setPointToast(nextToast);
    setPointToastQueue(remainingToasts);
  }, [pointToast, pointToastQueue]);

  useEffect(() => {
    if (!pointToast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setPointToast(null), 2800);

    return () => window.clearTimeout(timeoutId);
  }, [pointToast]);

  useEffect(() => {
    if (!dailyNudgePointFlash) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setDailyNudgePointFlash(null), 2800);

    return () => window.clearTimeout(timeoutId);
  }, [dailyNudgePointFlash]);

  useEffect(() => {
    if (!exchangeToast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setExchangeToast(null), 2200);

    return () => window.clearTimeout(timeoutId);
  }, [exchangeToast]);

  useEffect(() => {
    localStorage.setItem(
      RHYTHM_SETTINGS_STORAGE_KEY,
      JSON.stringify(rhythmSettings),
    );
  }, [rhythmSettings]);

  useEffect(() => {
    if (dateOverrides[selectedDateKey]) {
      return;
    }

    const nextSnapshot = copySections(routineSections);
    const currentSnapshot = dateSnapshots[selectedDateKey];

    if (JSON.stringify(currentSnapshot) === JSON.stringify(nextSnapshot)) {
      return;
    }

    setDateSnapshots((currentSnapshots) => ({
      ...currentSnapshots,
      [selectedDateKey]: nextSnapshot,
    }));
  }, [dateOverrides, dateSnapshots, routineSections, selectedDateKey]);

  useEffect(() => {
    localStorage.setItem(checksStorageKey, JSON.stringify(checkedItems));
  }, [checkedItems, checksStorageKey]);

  useEffect(() => {
    if (dailyEventDateKey !== selectedDateKey) {
      return;
    }

    localStorage.setItem(eventStorageKey, serializeDailyRecordEntries(dailyEvent));
  }, [dailyEvent, dailyEventDateKey, eventStorageKey, selectedDateKey]);

  useEffect(() => {
    if (dailyMemoDateKey !== selectedDateKey) {
      return;
    }

    localStorage.setItem(memoStorageKey, serializeDailyRecordEntries(dailyMemo));
  }, [dailyMemo, dailyMemoDateKey, memoStorageKey, selectedDateKey]);

  useEffect(() => {
    if (dailyTodosDateKey !== selectedDateKey) {
      return;
    }

    localStorage.setItem(getDailyTodosStorageKey(selectedDate), serializeDailyTodos(dailyTodos));
  }, [dailyTodos, dailyTodosDateKey, selectedDate, selectedDateKey]);

  useEffect(() => {
    if (dailyAnyMemoDateKey !== selectedDateKey) {
      return;
    }

    localStorage.setItem(anyMemoStorageKey, dailyAnyMemo);
  }, [anyMemoStorageKey, dailyAnyMemo, dailyAnyMemoDateKey, selectedDateKey]);

  useEffect(() => {
    if (!historySelectedDate || historyDailyEventDateKey !== historySelectedDateKey) {
      return;
    }

    localStorage.setItem(
      getDailyEventStorageKey(historySelectedDate),
      serializeDailyRecordEntries(historyDailyEvent),
    );
  }, [
    historyDailyEvent,
    historyDailyEventDateKey,
    historySelectedDate,
    historySelectedDateKey,
  ]);

  useEffect(() => {
    if (!historySelectedDate || historyDailyMemoDateKey !== historySelectedDateKey) {
      return;
    }

    localStorage.setItem(
      getDailyMemoStorageKey(historySelectedDate),
      serializeDailyRecordEntries(historyDailyMemo),
    );
  }, [
    historyDailyMemo,
    historyDailyMemoDateKey,
    historySelectedDate,
    historySelectedDateKey,
  ]);

  useEffect(() => {
    if (!historySelectedDate || historyDailyTodosDateKey !== historySelectedDateKey) {
      return;
    }

    localStorage.setItem(
      getDailyTodosStorageKey(historySelectedDate),
      serializeDailyTodos(historyDailyTodos),
    );
  }, [
    historyDailyTodos,
    historyDailyTodosDateKey,
    historySelectedDate,
    historySelectedDateKey,
  ]);

  useEffect(() => {
    if (!historySelectedDate || historyDailyAnyMemoDateKey !== historySelectedDateKey) {
      return;
    }

    localStorage.setItem(getDailyAnyMemoStorageKey(historySelectedDate), historyDailyAnyMemo);
  }, [
    historyDailyAnyMemo,
    historyDailyAnyMemoDateKey,
    historySelectedDate,
    historySelectedDateKey,
  ]);

  useEffect(() => {
    const closePopupPanels = () => {
      setTimerSettingItemId(null);
      setNoteEditorTarget(null);
      setIsRankPanelOpen(false);
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (target instanceof Element && target.closest('[data-popup-ui="true"]')) {
        return;
      }

      closePopupPanels();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePopupPanels();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const playTimerAlertSound = () => {
    try {
      const AudioContextClass =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextClass) {
        return;
      }

      const audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(660, audioContext.currentTime + 0.12);
      gain.gain.setValueAtTime(0.001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.28);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.3);
      window.setTimeout(() => {
        void audioContext.close();
      }, 450);
    } catch {
      // 音が鳴らない環境でも、画面内アラートは必ず表示します。
    }
  };

  const vibrateTimerAlert = () => {
    try {
      const vibrate = (navigator as Navigator & {
        vibrate?: (pattern: VibratePattern) => boolean;
      }).vibrate;

      vibrate?.([500, 300, 500]);
    } catch {
      // iPhone PWAなど、振動に未対応の環境では何もしません。
    }
  };

  const showTimerBrowserNotification = (label: string) => {
    if (window.Notification?.permission !== 'granted') {
      return;
    }

    new Notification('hibitin', {
      body: `${label} お疲れさま！`,
    });
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }

    const permission = await window.Notification.requestPermission();

    setNotificationPermission(permission);
  };

  const syncActiveTimerWithClock = (shouldAlert = true) => {
    setActiveTimer((currentTimer) => {
      if (!currentTimer) {
        return currentTimer;
      }

      const nextTimer = normalizeActiveTimer(currentTimer);
      const justFinished =
        currentTimer.status === 'running' &&
        nextTimer?.status === 'finished' &&
        currentTimer.remainingSeconds > 0;

      if (justFinished && shouldAlert && nextTimer) {
        setPausedTimers((currentTimers) => {
          const nextTimers = { ...currentTimers };

          delete nextTimers[nextTimer.itemId];

          return nextTimers;
        });
      }

      return nextTimer;
    });
  };

  useEffect(() => {
    localStorage.setItem(
      TIMER_STATE_STORAGE_KEY,
      JSON.stringify({
        activeTimer,
        pausedTimers,
      }),
    );
  }, [activeTimer, pausedTimers]);

  useEffect(() => {
    if (activeTimer?.status !== 'running' || !activeTimer.endsAt) {
      return undefined;
    }

    syncActiveTimerWithClock();

    const timerId = window.setInterval(() => {
      syncActiveTimerWithClock();
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [activeTimer?.endsAt, activeTimer?.itemId, activeTimer?.status]);

  useEffect(() => {
    const syncWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        syncActiveTimerWithClock();
      }
    };
    const syncWhenFocused = () => {
      syncActiveTimerWithClock();
    };

    syncActiveTimerWithClock();
    document.addEventListener('visibilitychange', syncWhenVisible);
    window.addEventListener('focus', syncWhenFocused);

    return () => {
      document.removeEventListener('visibilitychange', syncWhenVisible);
      window.removeEventListener('focus', syncWhenFocused);
    };
  }, []);

  useEffect(() => {
    if (!activeTimer?.isComplete) {
      return;
    }

    if (alertedFinishedTimerIdRef.current === activeTimer.itemId) {
      return;
    }

    alertedFinishedTimerIdRef.current = activeTimer.itemId;
    setTimerAlertSilenced(false);
    playTimerAlertSound();
    vibrateTimerAlert();
    showTimerBrowserNotification(activeTimer.label);
  }, [activeTimer?.isComplete, activeTimer?.itemId, activeTimer?.label]);

  useEffect(() => {
    if (!activeTimer?.isComplete || timerAlertSilenced) {
      return undefined;
    }

    const alertId = window.setInterval(() => {
      playTimerAlertSound();
      vibrateTimerAlert();
    }, 2000);

    return () => window.clearInterval(alertId);
  }, [activeTimer?.isComplete, timerAlertSilenced]);

  useEffect(() => () => {
    if (backupDownloadUrlRef.current) {
      URL.revokeObjectURL(backupDownloadUrlRef.current);
    }

    Object.values(questEmoteTimeoutsRef.current).forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
  }, []);

  const updateSectionsForTarget = (
    target: ResolvedEditTarget,
    updater: (sections: RoutineSection[]) => RoutineSection[],
  ) => {
    if (target.kind === 'date') {
      const currentSections = removeFixedRoutineItems(getSectionsForTarget(
        templateSettings,
        dateOverrides,
        dateSnapshots,
        target,
        todayKey,
      ));
      const fallbackSections = removeFixedRoutineItems(
        (
          isDateKeyBefore(target.dateKey, todayKey)
            ? dateSnapshots[target.dateKey]
            : undefined
        ) ?? templateSettings.templates[target.baseTemplate],
      );
      const nextSections = removeFixedRoutineItems(updater(currentSections));

      setDateOverrides((currentOverrides) => {
        const nextOverrides = { ...currentOverrides };

        if (areSectionsEqual(nextSections, fallbackSections)) {
          delete nextOverrides[target.dateKey];
        } else {
          nextOverrides[target.dateKey] = nextSections;
        }

        return nextOverrides;
      });

      return;
    }

    setTemplateSettings((currentSettings) => {
      return {
        ...currentSettings,
        templates: {
          ...currentSettings.templates,
          [target.template]: removeFixedRoutineItems(
            updater(currentSettings.templates[target.template]),
          ),
        },
      };
    });
  };

  const getUpdateTargetForSection = (sectionId: string) => {
    if (page === 'history') {
      if (!historyDateEditTarget) {
        throw new Error('スタンプ帳の日付が選択されていません。');
      }

      return historyDateEditTarget;
    }

    if (page === 'today' && sectionId === bonusSectionId) {
      return selectedDateEditTarget;
    }

    return displayedTarget;
  };

  const getItemNote = (dateKey: string, itemId: string) => itemNotes[dateKey]?.[itemId] ?? '';

  const getQuestEmoteKey = (dateKey: string, itemId: string) => `${dateKey}:${itemId}`;

  const triggerQuestEmote = (dateKey: string, itemId: string, points: number | null) => {
    const emoteKey = getQuestEmoteKey(dateKey, itemId);
    const currentTimeoutId = questEmoteTimeoutsRef.current[emoteKey];

    if (currentTimeoutId) {
      window.clearTimeout(currentTimeoutId);
    }

    const id = `${emoteKey}:${Date.now()}`;
    const message =
      questCompletionEmotes[Math.floor(Math.random() * questCompletionEmotes.length)];

    setQuestEmotes((currentEmotes) => ({
      ...currentEmotes,
      [emoteKey]: {
        id,
        message,
        points,
      },
    }));

    questEmoteTimeoutsRef.current[emoteKey] = window.setTimeout(() => {
      setQuestEmotes((currentEmotes) => {
        if (currentEmotes[emoteKey]?.id !== id) {
          return currentEmotes;
        }

        const nextEmotes = { ...currentEmotes };

        delete nextEmotes[emoteKey];

        return nextEmotes;
      });

      delete questEmoteTimeoutsRef.current[emoteKey];
    }, 1100);
  };

  const updateItemNote = (dateKey: string, itemId: string, note: string) => {
    setItemNotes((currentNotes) => {
      const nextNotes = { ...currentNotes };
      const notesForDate = { ...(nextNotes[dateKey] ?? {}) };
      const trimmedNote = note.trim();

      if (trimmedNote) {
        notesForDate[itemId] = note;
      } else {
        delete notesForDate[itemId];
      }

      if (Object.keys(notesForDate).length > 0) {
        nextNotes[dateKey] = notesForDate;
      } else {
        delete nextNotes[dateKey];
      }

      return nextNotes;
    });
  };

  const applyPointChangeForDailyNudge = (
    dateKey: string,
    nextCompleted: boolean,
    record: DailyNudgeRecord,
  ) => {
    const achievementKey = getDailyNudgePointAchievementKey(dateKey);
    const now = new Date().toISOString();
    const pointSetting = gameBalance.pointSettings.dailyNudge;

    setPlayerEconomy((currentEconomy) => {
      const existingAward = currentEconomy.pointAwards[achievementKey];

      if (nextCompleted) {
        if (existingAward?.active) {
          return currentEconomy;
        }

        if (!pointSetting.enabled && !existingAward) {
          return currentEconomy;
        }

        const points = existingAward?.points ??
          roundPoints(pointSetting.basePoints * playerRankProgress.multiplier, gameBalance.pointSettings.rounding);
        const basePoints = existingAward?.basePoints ?? pointSetting.basePoints;
        const multiplier = existingAward?.multiplier ?? playerRankProgress.multiplier;
        const nextAward: PointAwardRecord = {
          achievementKey,
          dateKey,
          itemId: 'daily-nudge',
          itemLabel: '本日の日替わりクエスト',
          sectionId: 'daily-nudge',
          points,
          basePoints,
          multiplier,
          active: true,
          awardedAt: existingAward?.awardedAt ?? now,
        };
        const nextLedgerEntry: PointLedgerEntry = {
          id: `${achievementKey}:earn:${now}`,
          achievementKey,
          dateKey,
          itemId: 'daily-nudge',
          itemLabel: '本日の日替わりクエスト',
          sectionId: 'daily-nudge',
          type: 'earn',
          points,
          basePoints,
          multiplier,
          createdAt: now,
          reason: record.text,
        };

        if (points > 0 && pointSetting.enabled) {
          const pointFlash = {
            id: nextLedgerEntry.id,
            points,
            itemLabel: '本日の日替わりクエスト',
          };

          enqueuePointToast(pointFlash);
          setDailyNudgePointFlash(pointFlash);
        }

        return {
          ...currentEconomy,
          currentPoints: currentEconomy.currentPoints + points,
          lifetimeEarnedPoints: existingAward
            ? currentEconomy.lifetimeEarnedPoints
            : currentEconomy.lifetimeEarnedPoints + points,
          pointLedger: [...currentEconomy.pointLedger, nextLedgerEntry],
          pointAwards: {
            ...currentEconomy.pointAwards,
            [achievementKey]: nextAward,
          },
        };
      }

      if (!existingAward?.active) {
        return currentEconomy;
      }

      const reversalEntry: PointLedgerEntry = {
        id: `${achievementKey}:reversal:${now}`,
        achievementKey,
        dateKey,
        itemId: existingAward.itemId,
        itemLabel: existingAward.itemLabel,
        sectionId: existingAward.sectionId,
        type: 'reversal',
        points: -existingAward.points,
        basePoints: existingAward.basePoints,
        multiplier: existingAward.multiplier,
        createdAt: now,
        reason: record.text,
      };

      setDailyNudgePointFlash(null);

      return {
        ...currentEconomy,
        currentPoints: Math.max(0, currentEconomy.currentPoints - existingAward.points),
        pointLedger: [...currentEconomy.pointLedger, reversalEntry],
        pointAwards: {
          ...currentEconomy.pointAwards,
          [achievementKey]: {
            ...existingAward,
            active: false,
            reversedAt: now,
          },
        },
      };
    });
  };

  const toggleDailyNudgeCompletion = (dateKey: string) => {
    const selectedRecord = dailyNudgeRecords[dateKey];

    if (!selectedRecord) {
      return;
    }

    const nextCompleted = !selectedRecord.completed;

    applyPointChangeForDailyNudge(dateKey, nextCompleted, selectedRecord);

    setDailyNudgeRecords((currentRecords) => {
      const currentRecord = currentRecords[dateKey];

      if (!currentRecord) {
        return currentRecords;
      }

      const celebrationMessage =
        currentRecord.celebrationMessage ??
        getDailyNudgeCelebrationMessage(dateKey, currentRecord.candidateId);

      return {
        ...currentRecords,
        [dateKey]: {
          ...currentRecord,
          completed: nextCompleted,
          celebrationMessage,
          completedAt: nextCompleted ? new Date().toISOString() : undefined,
        },
      };
    });
  };

  const applyPointChangeForCoreRoutine = (
    dateKey: string,
    kind: CoreRoutineKind,
    nextCompleted: boolean,
  ) => {
    if (!dateKey || dateKey > todayKey) {
      return;
    }

    const achievementKey = getCoreRoutinePointAchievementKey(dateKey, kind);
    const pointTargetKind = getCoreRoutinePointTargetKind(kind);
    const pointSetting = gameBalance.pointSettings[pointTargetKind];
    const itemLabel = getCoreRoutinePointLabel(kind);
    const now = new Date().toISOString();

    setPlayerEconomy((currentEconomy) => {
      const existingAward = currentEconomy.pointAwards[achievementKey];

      if (nextCompleted) {
        if (existingAward?.active || !pointSetting.enabled) {
          return currentEconomy;
        }

        const points = existingAward?.points ??
          calculateQuestPoints(gameBalance, playerRankProgress.multiplier, pointTargetKind);
        const basePoints = existingAward?.basePoints ?? pointSetting.basePoints;
        const multiplier = existingAward?.multiplier ?? playerRankProgress.multiplier;
        const nextAward: PointAwardRecord = {
          achievementKey,
          dateKey,
          itemId: `core-${kind}`,
          itemLabel,
          sectionId: 'core-routine',
          points,
          basePoints,
          multiplier,
          active: true,
          awardedAt: existingAward?.awardedAt ?? now,
        };
        const nextLedgerEntry: PointLedgerEntry = {
          id: `${achievementKey}:earn:${now}`,
          achievementKey,
          dateKey,
          itemId: `core-${kind}`,
          itemLabel,
          sectionId: 'core-routine',
          type: 'earn',
          points,
          basePoints,
          multiplier,
          createdAt: now,
          reason: getCoreRoutinePointMessage(kind),
        };

        if (points > 0) {
          enqueuePointToast({
            id: nextLedgerEntry.id,
            points,
            itemLabel,
            message: getCoreRoutinePointMessage(kind),
            icon: kind === 'memo' ? '🪶' : '🔖',
            variant: 'memory',
          });
        }

        return {
          ...currentEconomy,
          currentPoints: currentEconomy.currentPoints + points,
          lifetimeEarnedPoints: existingAward
            ? currentEconomy.lifetimeEarnedPoints
            : currentEconomy.lifetimeEarnedPoints + points,
          pointLedger: [...currentEconomy.pointLedger, nextLedgerEntry],
          pointAwards: {
            ...currentEconomy.pointAwards,
            [achievementKey]: nextAward,
          },
        };
      }

      if (!existingAward?.active) {
        return currentEconomy;
      }

      const reversalEntry: PointLedgerEntry = {
        id: `${achievementKey}:reversal:${now}`,
        achievementKey,
        dateKey,
        itemId: existingAward.itemId,
        itemLabel: existingAward.itemLabel,
        sectionId: existingAward.sectionId,
        type: 'reversal',
        points: -existingAward.points,
        basePoints: existingAward.basePoints,
        multiplier: existingAward.multiplier,
        createdAt: now,
        reason: '本文削除によるコアルーティン未達成',
      };

      return {
        ...currentEconomy,
        currentPoints: Math.max(0, currentEconomy.currentPoints - existingAward.points),
        pointLedger: [...currentEconomy.pointLedger, reversalEntry],
        pointAwards: {
          ...currentEconomy.pointAwards,
          [achievementKey]: {
            ...existingAward,
            active: false,
            reversedAt: now,
          },
        },
      };
    });
  };

  const updateDailyNudgeCandidate = (
    candidateId: string,
    field: keyof Pick<
      DailyNudgeCandidate,
      'text' | 'completionMessage' | 'category' | 'enabled'
    >,
    value: string | boolean,
  ) => {
    setDailyNudgeCandidates((currentCandidates) =>
      currentCandidates.map((candidate) =>
        candidate.id === candidateId
          ? { ...candidate, [field]: value }
          : candidate,
      ),
    );
  };

  const moveDailyNudgeCandidate = (candidateId: string, direction: -1 | 1) => {
    setDailyNudgeCandidates((currentCandidates) => {
      const orderedCandidates = [...currentCandidates].sort(
        (first, second) => first.order - second.order,
      );
      const currentIndex = orderedCandidates.findIndex((candidate) => candidate.id === candidateId);
      const nextIndex = currentIndex + direction;

      if (
        currentIndex === -1 ||
        nextIndex < 0 ||
        nextIndex >= orderedCandidates.length
      ) {
        return currentCandidates;
      }

      const nextCandidates = [...orderedCandidates];
      const [movedCandidate] = nextCandidates.splice(currentIndex, 1);

      nextCandidates.splice(nextIndex, 0, movedCandidate);

      return nextCandidates.map((candidate, index) => ({
        ...candidate,
        order: (index + 1) * 10,
      }));
    });
  };

  const addDailyNudgeCandidate = () => {
    const newCandidateId = createRoutineId('daily-nudge');

    setDailyNudgeCandidates((currentCandidates) => [
      ...currentCandidates,
      {
        id: newCandidateId,
        text: '小さな一歩をひとつ選ぼう',
        completionMessage: defaultDailyNudgeCompletionMessage,
        category: 'その他',
        enabled: true,
        order:
          currentCandidates.length === 0
            ? 10
            : Math.max(...currentCandidates.map((candidate) => candidate.order)) + 10,
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  const deleteDailyNudgeCandidate = (candidateId: string) => {
    const candidate = dailyNudgeCandidates.find(
      (currentCandidate) => currentCandidate.id === candidateId,
    );

    if (!candidate) {
      return;
    }

    const shouldDelete = window.confirm(
      `「${candidate.text}」を候補一覧から削除しますか？過去の日付に保存済みの日替わりクエストは残ります。`,
    );

    if (!shouldDelete) {
      return;
    }

    setDailyNudgeCandidates((currentCandidates) =>
      currentCandidates
        .filter((currentCandidate) => currentCandidate.id !== candidateId)
        .map((currentCandidate, index) => ({
          ...currentCandidate,
          order: (index + 1) * 10,
        })),
    );
  };

  const toggleItemNoteEditor = (dateKey: string, itemId: string) => {
    setTimerSettingItemId(null);
    setIsRankPanelOpen(false);
    setNoteEditorTarget((currentTarget) =>
      currentTarget?.dateKey === dateKey && currentTarget.itemId === itemId
        ? null
        : { dateKey, itemId },
    );
  };

  const toggleTimerSetting = (item: RoutineItem) => {
    setNoteEditorTarget(null);
    setIsRankPanelOpen(false);
    setTimerDraftParts(getTimerParts(getItemTimerSeconds(item) ?? 300));
    setTimerSettingItemId((currentId) => (currentId === item.id ? null : item.id));
  };

  const applyPointChangeForItemCheck = (
    dateKey: string,
    itemId: string,
    nextChecked: boolean,
    sections: RoutineSection[],
  ) => {
    let awardedPoints: number | null = null;
    const itemContext = findItemContext(itemId, sections);
    const pointTargetKind = itemContext
      ? getPointTargetKind(itemContext.item, itemContext.section.id)
      : null;

    if (
      !itemContext ||
      !pointTargetKind ||
      !isPointEligibleItem(itemContext.item, itemContext.section.id, gameBalance)
    ) {
      return awardedPoints;
    }

    const achievementKey = getPointAchievementKey(dateKey, itemId);
    const now = new Date().toISOString();
    const currentAward = playerEconomy.pointAwards[achievementKey];

    if (nextChecked && !currentAward?.active) {
      awardedPoints = currentAward?.points ??
        calculateQuestPoints(gameBalance, playerRankProgress.multiplier, pointTargetKind);
    }

    setPlayerEconomy((currentEconomy) => {
      const existingAward = currentEconomy.pointAwards[achievementKey];

      if (nextChecked) {
        if (existingAward?.active) {
          return currentEconomy;
        }

        const points = existingAward?.points ?? calculateQuestPoints(
          gameBalance,
          playerRankProgress.multiplier,
          pointTargetKind,
        );
        const basePoints = existingAward?.basePoints ??
          gameBalance.pointSettings[pointTargetKind].basePoints;
        const multiplier = existingAward?.multiplier ?? playerRankProgress.multiplier;
        awardedPoints = points;
        const nextAward: PointAwardRecord = {
          achievementKey,
          dateKey,
          itemId,
          itemLabel: itemContext.item.label,
          sectionId: itemContext.section.id,
          points,
          basePoints,
          multiplier,
          active: true,
          awardedAt: existingAward?.awardedAt ?? now,
        };
        const nextLedgerEntry: PointLedgerEntry = {
          id: `${achievementKey}:earn:${now}`,
          achievementKey,
          dateKey,
          itemId,
          itemLabel: itemContext.item.label,
          sectionId: itemContext.section.id,
          type: 'earn',
          points,
          basePoints,
          multiplier,
          createdAt: now,
        };

        enqueuePointToast({
          id: nextLedgerEntry.id,
          points,
          itemLabel: itemContext.item.label,
        });

        return {
          ...currentEconomy,
          currentPoints: currentEconomy.currentPoints + points,
          lifetimeEarnedPoints: existingAward
            ? currentEconomy.lifetimeEarnedPoints
            : currentEconomy.lifetimeEarnedPoints + points,
          pointLedger: [...currentEconomy.pointLedger, nextLedgerEntry],
          pointAwards: {
            ...currentEconomy.pointAwards,
            [achievementKey]: nextAward,
          },
        };
      }

      if (!existingAward?.active) {
        return currentEconomy;
      }

      const reversalEntry: PointLedgerEntry = {
        id: `${achievementKey}:reversal:${now}`,
        achievementKey,
        dateKey,
        itemId,
        itemLabel: existingAward.itemLabel,
        sectionId: existingAward.sectionId,
        type: 'reversal',
        points: -existingAward.points,
        basePoints: existingAward.basePoints,
        multiplier: existingAward.multiplier,
        createdAt: now,
      };

      return {
        ...currentEconomy,
        currentPoints: Math.max(0, currentEconomy.currentPoints - existingAward.points),
        pointLedger: [...currentEconomy.pointLedger, reversalEntry],
        pointAwards: {
          ...currentEconomy.pointAwards,
          [achievementKey]: {
            ...existingAward,
            active: false,
            reversedAt: now,
          },
        },
      };
    });

    return awardedPoints;
  };

  const toggleItem = (id: string) => {
    setCheckedItems((current) => {
      const nextChecked = !current[id];
      const nextChecks = {
        ...current,
        [id]: nextChecked,
      };

      const awardedPoints = applyPointChangeForItemCheck(
        selectedDateKey,
        id,
        nextChecked,
        displaySections,
      );

      if (nextChecked) {
        triggerQuestEmote(selectedDateKey, id, awardedPoints);
      }

      if (historySelectedDate && historySelectedDateKey === selectedDateKey) {
        setHistoryCheckedItems(nextChecks);
      }

      return nextChecks;
    });
  };

  const toggleHistoryItem = (id: string) => {
    if (!historySelectedDate) {
      return;
    }

    setHistoryCheckedItems((current) => {
      const nextChecked = !current[id];
      const nextChecks = {
        ...current,
        [id]: nextChecked,
      };

      const awardedPoints = applyPointChangeForItemCheck(
        historySelectedDateKey,
        id,
        nextChecked,
        historyDisplaySections,
      );

      if (nextChecked) {
        triggerQuestEmote(historySelectedDateKey, id, awardedPoints);
      }

      localStorage.setItem(
        getChecksStorageKey(historySelectedDate),
        JSON.stringify(nextChecks),
      );

      if (historySelectedDateKey === selectedDateKey) {
        setCheckedItems(nextChecks);
      }

      return nextChecks;
    });
  };

  const completeActiveTimerItem = () => {
    if (!activeTimer) {
      return;
    }

    setTimerAlertSilenced(true);
    setCheckedItems((current) => {
      const wasChecked = Boolean(current[activeTimer.itemId]);
      const nextChecks = {
        ...current,
        [activeTimer.itemId]: true,
      };

      if (!wasChecked) {
        applyPointChangeForItemCheck(selectedDateKey, activeTimer.itemId, true, displaySections);
      }

      if (historySelectedDate && historySelectedDateKey === selectedDateKey) {
        setHistoryCheckedItems(nextChecks);
      }

      return nextChecks;
    });
    setPausedTimers((currentTimers) => {
      const nextTimers = { ...currentTimers };

      delete nextTimers[activeTimer.itemId];

      return nextTimers;
    });
    alertedFinishedTimerIdRef.current = null;
    setActiveTimer(null);
  };

  const closeActiveTimerPanel = () => {
    if (!activeTimer) {
      return;
    }

    setTimerAlertSilenced(true);
    alertedFinishedTimerIdRef.current = null;
    setPausedTimers((currentTimers) => {
      const nextTimers = { ...currentTimers };

      delete nextTimers[activeTimer.itemId];

      return nextTimers;
    });
    setActiveTimer(null);
  };

  const stopFinishedTimerAlert = closeActiveTimerPanel;

  const extendFinishedTimerByFiveMinutes = () => {
    if (!activeTimer) {
      return;
    }

    setTimerAlertSilenced(true);
    alertedFinishedTimerIdRef.current = null;
    setPausedTimers((currentTimers) => {
      const nextTimers = { ...currentTimers };

      delete nextTimers[activeTimer.itemId];

      return nextTimers;
    });
    setActiveTimer(createRunningTimer(
      activeTimer.itemId,
      activeTimer.label,
      5 * 60,
      5 * 60,
    ));
  };

  const updateItemTimerSeconds = (
    sectionId: string,
    itemId: string,
    timerSeconds?: number,
  ) => {
    updateSectionsForTarget(getUpdateTargetForSection(sectionId), (currentSections) =>
      currentSections.map((section) => ({
        ...section,
        items: section.items.map((item) => {
          if (item.id !== itemId) {
            return item;
          }

          if (!timerSeconds) {
            const itemWithoutTimer = { ...item };

            delete itemWithoutTimer.timerMinutes;
            delete itemWithoutTimer.timerSeconds;

            return itemWithoutTimer;
          }

          const itemWithTimer = { ...item };

          delete itemWithTimer.timerMinutes;

          return {
            ...itemWithTimer,
            timerSeconds,
          };
        }),
      })),
    );

    if (activeTimer?.itemId === itemId) {
      setTimerAlertSilenced(true);
      alertedFinishedTimerIdRef.current = null;
      setActiveTimer(null);
    }
    setPausedTimers((currentTimers) => {
      const nextTimers = { ...currentTimers };

      delete nextTimers[itemId];

      return nextTimers;
    });
  };

  const renderTimerSettingMenu = (sectionId: string, item: RoutineItem) => (
    <div className="timer-setting-menu" data-popup-ui="true">
      <p className="timer-setting-title">タイマー設定</p>
      <div className="timer-shortcut-group">
        <span>よく使う時間</span>
        <div className="timer-shortcut-buttons">
          {timerPresetSeconds.map((seconds) => (
            <button
              data-active={
                getSecondsFromTimerParts(timerDraftParts) === seconds ? 'true' : 'false'
              }
              key={seconds}
              onClick={() => setTimerDraftParts(getTimerParts(seconds))}
              type="button"
            >
              {formatTimerDuration(seconds)}
            </button>
          ))}
        </div>
      </div>
      <div className="timer-part-picker">
        <label>
          <span>時</span>
          <select
            aria-label={`${item.label}のタイマー時間`}
            onChange={(event) =>
              setTimerDraftParts((currentParts) => ({
                ...currentParts,
                hours: Number(event.target.value),
              }))
            }
            value={timerDraftParts.hours}
          >
            {timerHourOptions.map((hours) => (
              <option key={hours} value={hours}>
                {hours}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>分</span>
          <select
            aria-label={`${item.label}のタイマー分`}
            onChange={(event) =>
              setTimerDraftParts((currentParts) => ({
                ...currentParts,
                minutes: Number(event.target.value),
              }))
            }
            value={timerDraftParts.minutes}
          >
            {timerMinuteOptions.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>秒</span>
          <select
            aria-label={`${item.label}のタイマー秒`}
            onChange={(event) =>
              setTimerDraftParts((currentParts) => ({
                ...currentParts,
                seconds: Number(event.target.value),
              }))
            }
            value={timerDraftParts.seconds}
          >
            {timerSecondOptions.map((seconds) => (
              <option key={seconds} value={seconds}>
                {seconds}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="timer-picker-actions">
        <button onClick={() => setTimerSettingItemId(null)} type="button">
          キャンセル
        </button>
        <button
          disabled={getSecondsFromTimerParts(timerDraftParts) === 0}
          onClick={() => {
            updateItemTimerSeconds(
              sectionId,
              item.id,
              getSecondsFromTimerParts(timerDraftParts),
            );
            setTimerSettingItemId(null);
          }}
          type="button"
        >
          保存
        </button>
      </div>
    </div>
  );

  const startItemTimer = (item: RoutineItem) => {
    const totalSeconds = getItemTimerSeconds(item);

    if (!totalSeconds) {
      return;
    }

    setTimerAlertSilenced(true);
    alertedFinishedTimerIdRef.current = null;
    setPausedTimers((currentTimers) => {
      const nextTimers = { ...currentTimers };
      const timerToPause = normalizeActiveTimer(activeTimer);

      if (
        timerToPause &&
        !timerToPause.isComplete &&
        timerToPause.remainingSeconds > 0 &&
        timerToPause.itemId !== item.id
      ) {
        nextTimers[timerToPause.itemId] = {
          label: timerToPause.label,
          durationSeconds: timerToPause.durationSeconds,
          totalSeconds: timerToPause.totalSeconds,
          remainingSeconds: timerToPause.remainingSeconds,
          status: 'paused',
        };
      }

      delete nextTimers[item.id];

      return nextTimers;
    });

    const pausedTimer = pausedTimers[item.id];
    setActiveTimer(createRunningTimer(
      item.id,
      item.label,
      pausedTimer?.durationSeconds ?? pausedTimer?.totalSeconds ?? totalSeconds,
      pausedTimer?.remainingSeconds ?? totalSeconds,
    ));
  };

  const pauseActiveTimer = () => {
    setActiveTimer((currentTimer) => {
      if (!currentTimer) {
        return currentTimer;
      }
      const syncedTimer = normalizeActiveTimer(currentTimer);

      if (!syncedTimer || syncedTimer.isComplete) {
        return syncedTimer;
      }

      setPausedTimers((currentTimers) => ({
        ...currentTimers,
        [syncedTimer.itemId]: {
          label: syncedTimer.label,
          durationSeconds: syncedTimer.durationSeconds,
          totalSeconds: syncedTimer.totalSeconds,
          remainingSeconds: syncedTimer.remainingSeconds,
          status: 'paused',
        },
      }));

      return {
        ...syncedTimer,
        endsAt: null,
        status: 'paused',
        isRunning: false,
        isComplete: false,
      };
    });
  };

  const resumeActiveTimer = () => {
    setActiveTimer((currentTimer) => {
      if (!currentTimer || currentTimer.isComplete) {
        return currentTimer;
      }

      setTimerAlertSilenced(true);
      setPausedTimers((currentTimers) => {
        const nextTimers = { ...currentTimers };

        delete nextTimers[currentTimer.itemId];

        return nextTimers;
      });

      return createRunningTimer(
        currentTimer.itemId,
        currentTimer.label,
        currentTimer.durationSeconds,
        currentTimer.remainingSeconds,
      );
    });
  };

  const resetActiveTimer = () => {
    setTimerAlertSilenced(true);
    alertedFinishedTimerIdRef.current = null;
    setActiveTimer((currentTimer) => {
      if (!currentTimer) {
        return currentTimer;
      }

      setPausedTimers((currentTimers) => ({
        ...currentTimers,
        [currentTimer.itemId]: {
          label: currentTimer.label,
          durationSeconds: currentTimer.durationSeconds,
          totalSeconds: currentTimer.totalSeconds,
          remainingSeconds: currentTimer.totalSeconds,
          status: 'paused',
        },
      }));

      return {
        ...currentTimer,
        endsAt: null,
        remainingSeconds: currentTimer.totalSeconds,
        status: 'paused',
        isRunning: false,
        isComplete: false,
      };
    });
  };

  const startEditingItem = (item: RoutineItem) => {
    setEditingItemId(item.id);
    setEditingLabel(item.label);
  };

  const finishEditingItem = (item: RoutineItem, sectionId: string) => {
    if (editingItemId !== item.id) {
      return;
    }

    const nextLabel = editingLabel.trim();

    if (nextLabel && nextLabel !== item.label) {
      updateSectionsForTarget(getUpdateTargetForSection(sectionId), (currentSections) =>
        currentSections.map((section) => ({
          ...section,
          items: section.items.map((routineItem) =>
            routineItem.id === item.id
              ? { ...routineItem, label: nextLabel }
              : routineItem,
          ),
        })),
      );
    }

    setEditingItemId(null);
    setEditingLabel('');
  };

  const toggleSortingSection = (sectionId: string) => {
    setSortingSectionId((currentSectionId) =>
      currentSectionId === sectionId ? null : sectionId,
    );
    setDraggedItemId(null);
    setEditingItemId(null);
    setEditingLabel('');
    setTimerSettingItemId(null);
    setNoteEditorTarget(null);
  };

  const openEditMode = () => {
    setEditModeStartSections(copySections(removeFixedRoutineItems(routineSections)));
    setLastCopiedSections(null);
    setIsEditMode(true);
  };

  const closeEditMode = () => {
    const currentSections = copySections(removeFixedRoutineItems(routineSections));
    const matchesLastCopiedSections = areSectionsEqual(lastCopiedSections, currentSections);
    const hasChangesFromStart = !areSectionsEqual(editModeStartSections, currentSections);

    if (matchesLastCopiedSections) {
      setDateOverrides((currentOverrides) => {
        const nextOverrides = { ...currentOverrides };

        delete nextOverrides[selectedDateKey];

        return nextOverrides;
      });
    } else if (hasChangesFromStart) {
      setDateOverrides((currentOverrides) => ({
        ...currentOverrides,
        [selectedDateKey]: currentSections,
      }));
    }

    setIsEditMode(false);
    setEditModeStartSections(null);
    setLastCopiedSections(null);
    setSortingSectionId(null);
    setDraggedItemId(null);
    setEditingItemId(null);
    setEditingLabel('');
    setTimerSettingItemId(null);
    setIsRankPanelOpen(false);
  };

  const switchQuestDate = (date: Date) => {
    if (getDateKey(date) === selectedDateKey) {
      return;
    }

    if (isEditMode) {
      closeEditMode();
    }

    setSelectedDate(date);
    setSortingSectionId(null);
    setDraggedItemId(null);
    setEditingItemId(null);
    setEditingLabel('');
    setTimerSettingItemId(null);
  };

  const addRoutine = (sectionId: string) => {
    if (
      gameMode === 'player' &&
      dailySectionIds.includes(sectionId as StartSection)
    ) {
      const targetSections = getSectionsForTarget(
        templateSettings,
        dateOverrides,
        dateSnapshots,
        getUpdateTargetForSection(sectionId),
        todayKey,
      );
      const questCount = countFreeQuestItems(targetSections);
      const questLimit = getEffectiveQuestSlotLimit(playerUnlocks, gameBalance);

      if (questCount >= questLimit) {
        return;
      }
    }

    const newItemId = createRoutineId(sectionId);
    const newItemLabel = '新しいルーティン';

    updateSectionsForTarget(getUpdateTargetForSection(sectionId), (currentSections) =>
      currentSections.map((section) => {
        if (section.id !== sectionId) {
          return section;
        }

        const nextOrder =
          section.items.length === 0
            ? 10
            : Math.max(...section.items.map((item) => item.order)) + 10;

        return {
          ...section,
          items: [
            ...section.items,
            {
              id: newItemId,
              label: newItemLabel,
              order: nextOrder,
              source: 'user',
              createdAt: new Date().toISOString(),
            },
          ],
        };
      }),
    );
    setSortingSectionId(null);
    setEditingItemId(newItemId);
    setEditingLabel(newItemLabel);
    setTimerSettingItemId(null);
  };

  const deleteRoutine = () => {
    if (!pendingDelete) {
      return;
    }

    let archivedItem: ArchivedItem | null = null;
    const deleteTarget = getUpdateTargetForSection(pendingDelete.sectionId);

    updateSectionsForTarget(deleteTarget, (currentSections) =>
      currentSections.map((section) => {
        if (section.id !== pendingDelete.sectionId) {
          return section;
        }

        const itemToArchive = section.items.find((item) => item.id === pendingDelete.id);

        if (itemToArchive) {
          archivedItem = {
            item: { ...itemToArchive },
            sectionId: section.id,
            sectionTitle: section.title,
            target: deleteTarget,
            archivedAt: new Date().toISOString(),
          };
        }

        return {
          ...section,
          items: section.items.filter((item) => item.id !== pendingDelete.id),
        };
      }),
    );

    if (archivedItem) {
      const itemToSave = archivedItem;

      setArchivedItems((currentItems) => ({
        ...currentItems,
        [pendingDelete.id]: itemToSave,
      }));
    }

    if (activeTimer?.itemId === pendingDelete.id) {
      setTimerAlertSilenced(true);
      alertedFinishedTimerIdRef.current = null;
      setActiveTimer(null);
    }
    setPausedTimers((currentTimers) => {
      const nextTimers = { ...currentTimers };

      delete nextTimers[pendingDelete.id];

      return nextTimers;
    });
    setPendingDelete(null);
  };

  const restoreArchivedItem = (itemId: string) => {
    const archivedItem = archivedItems[itemId];

    if (!archivedItem) {
      return;
    }

    updateSectionsForTarget(archivedItem.target, (currentSections) =>
      currentSections.map((section) => {
        if (section.id !== archivedItem.sectionId) {
          return section;
        }

        if (section.items.some((item) => item.id === archivedItem.item.id)) {
          return section;
        }

        const nextOrder =
          section.items.length > 0
            ? Math.max(...section.items.map((item) => item.order)) + 10
            : 10;

        return {
          ...section,
          items: [
            ...section.items,
            {
              ...archivedItem.item,
              order: nextOrder,
            },
          ],
        };
      }),
    );

    setArchivedItems((currentItems) => {
      const nextItems = { ...currentItems };

      delete nextItems[itemId];

      return nextItems;
    });
  };

  const changeWeekdayType = (weekday: WeekdayKey, nextType: TemplateKind) => {
    setTemplateSettings((currentSettings) => {
      return {
        ...currentSettings,
        weekdayTypeMap: {
          ...currentSettings.weekdayTypeMap,
          [weekday]: nextType,
        },
      };
    });
  };

  const toggleWeekdayType = (weekday: WeekdayKey) => {
    const currentType = templateSettings.weekdayTypeMap[weekday];
    changeWeekdayType(weekday, currentType === 'normal' ? 'holiday' : 'normal');
  };

  const updateRhythmConfig = (
    template: TemplateKind,
    field: keyof RhythmConfig,
    value: string,
  ) => {
    setRhythmSettings((currentSettings) => ({
      ...currentSettings,
      [template]: {
        ...currentSettings[template],
        [field]: value,
      },
    }));
  };

  const updateFixedItemTime = (item: RoutineItem, time: string) => {
    if (!item.fixedKind) {
      return;
    }

    const targetTemplate = page === 'today' ? selectedDateTemplate : editTargetKey;
    const field = item.fixedKind === 'wake' ? 'wakeTime' : 'sleepTime';

    updateRhythmConfig(targetTemplate, field, time);
  };

  const saveDisplayedRoutineAsTemplate = (template: TemplateKind) => {
    const label = getTemplateLabel(template);
    const shouldSave = window.confirm(
      `現在表示しているチェック表を、今後使う${label}のルーティンに設定しますか？過去の日付には影響しません。`,
    );

    if (!shouldSave) {
      return;
    }

    const copiedSections = copySections(removeFixedRoutineItems(routineSections));

    setTemplateSettings((currentSettings) => ({
      ...currentSettings,
      templates: {
        ...currentSettings.templates,
        [template]: copiedSections,
      },
    }));

    if (page === 'today' && isEditMode) {
      setLastCopiedSections(copiedSections);
    }
  };

  const exportBackup = () => {
    const storage: Record<string, unknown> = {};
    const hibitinKeys = Array.from({ length: window.localStorage.length }, (_, index) =>
      window.localStorage.key(index),
    )
      .filter((key): key is string => key !== null && isHibitinStorageKey(key))
      .sort();

    try {
      hibitinKeys.forEach((key) => {
        const savedValue = window.localStorage.getItem(key);

        if (savedValue !== null) {
          storage[key] = isDailyTextStorageKey(key)
            ? savedValue
            : JSON.parse(savedValue) as unknown;
        }
      });
    } catch {
      setBackupMessage('');
      window.alert('保存データの一部を読み取れなかったため、バックアップを作成できませんでした。');
      return;
    }

    const backup: BackupFile = {
      backupVersion: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      appName: 'hibitin',
      data: { storage },
    };
    const fileName = `hibitin-backup-${getDateKey(new Date())}.json`;
    const backupJson = JSON.stringify(backup, null, 2);
    const blob = new Blob([backupJson], {
      type: 'application/json;charset=utf-8',
    });

    const downloadUrl = URL.createObjectURL(blob);
    backupDownloadUrlRef.current = downloadUrl;
    setBackupDownload({ url: downloadUrl, fileName });

    const downloadLink = document.createElement('a');

    downloadLink.href = downloadUrl;
    downloadLink.download = fileName;
    downloadLink.textContent = fileName;
    downloadLink.style.position = 'fixed';
    downloadLink.style.left = '-9999px';
    downloadLink.style.top = '0';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    window.setTimeout(() => {
      downloadLink.remove();
    }, 0);
    setBackupMessage('バックアップを書き出しました。ダウンロードが始まらない場合は下のリンクを押してください。');
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const backupFile = event.target.files?.[0];

    if (!backupFile) {
      return;
    }

    try {
      const parsedBackup = JSON.parse(await backupFile.text()) as unknown;

      if (!isBackupFile(parsedBackup)) {
        setBackupMessage('');
        window.alert('hibitinの正しいバックアップファイルではないため、復元しませんでした。');
        return;
      }

      const shouldRestore = window.confirm(
        'バックアップを復元しますか？現在のhibitin保存データは上書きされます。',
      );

      if (!shouldRestore) {
        return;
      }

      Array.from({ length: window.localStorage.length }, (_, index) =>
        window.localStorage.key(index),
      )
        .filter((key): key is string => key !== null && isHibitinStorageKey(key))
        .forEach((key) => window.localStorage.removeItem(key));

      Object.entries(parsedBackup.data.storage).forEach(([key, value]) => {
        window.localStorage.setItem(key, serializeRestoredStorageValue(key, value));
      });

      window.location.reload();
    } catch {
      setBackupMessage('');
      window.alert('JSONファイルを読み取れなかったため、復元しませんでした。');
    } finally {
      event.target.value = '';
    }
  };

  const resetToInitialState = () => {
    const firstConfirmed = window.confirm(
      '本当に初回状態にリセットしますか？保存データは削除されます。',
    );

    if (!firstConfirmed) {
      return;
    }

    const finalConfirmed = window.confirm(
      '最終確認です。ルーティン、チェック履歴、記録、メモ、タイマー、実績、アーカイブを含む全データを削除します。よろしいですか？',
    );

    if (!finalConfirmed) {
      return;
    }

    Array.from({ length: window.localStorage.length }, (_, index) =>
      window.localStorage.key(index),
    )
      .filter((key): key is string => key !== null && isHibitinStorageKey(key))
      .forEach((key) => window.localStorage.removeItem(key));

    window.location.reload();
  };

  const resetEditUiState = () => {
    setIsEditMode(false);
    setIsHistoryEditMode(false);
    setEditModeStartSections(null);
    setLastCopiedSections(null);
    setSortingSectionId(null);
    setDraggedItemId(null);
    setEditingItemId(null);
    setEditingLabel('');
    setTimerSettingItemId(null);
  };

  const updateDailyEventForSelectedDate = (index: number, value: string) => {
    const wasCompleted = hasSavedDailyRecordEntries(dailyEvent);
    const nextEntries = updateDailyRecordEntry(dailyEvent, index, value);
    const nextCompleted = hasSavedDailyRecordEntries(nextEntries);

    setDailyEventDateKey(selectedDateKey);
    setDailyEvent(nextEntries);

    if (wasCompleted !== nextCompleted) {
      applyPointChangeForCoreRoutine(selectedDateKey, 'events', nextCompleted);
    }
  };

  const saveDailyEventForSelectedDate = (index: number) => {
    const wasCompleted = hasSavedDailyRecordEntries(dailyEvent);
    const nextEntries = saveDailyRecordEntry(dailyEvent, index);
    const nextCompleted = hasSavedDailyRecordEntries(nextEntries);

    setDailyEventDateKey(selectedDateKey);
    setDailyEvent(nextEntries);

    if (wasCompleted !== nextCompleted) {
      applyPointChangeForCoreRoutine(selectedDateKey, 'events', nextCompleted);
    }
  };

  const updateDailyMemoForSelectedDate = (index: number, value: string) => {
    const wasCompleted = hasSavedDailyRecordEntries(dailyMemo);
    const nextEntries = updateDailyRecordEntry(dailyMemo, index, value);
    const nextCompleted = hasSavedDailyRecordEntries(nextEntries);

    setDailyMemoDateKey(selectedDateKey);
    setDailyMemo(nextEntries);

    if (wasCompleted !== nextCompleted) {
      applyPointChangeForCoreRoutine(selectedDateKey, 'memo', nextCompleted);
    }
  };

  const saveDailyMemoForSelectedDate = (index: number) => {
    const wasCompleted = hasSavedDailyRecordEntries(dailyMemo);
    const nextEntries = saveDailyRecordEntry(dailyMemo, index);
    const nextCompleted = hasSavedDailyRecordEntries(nextEntries);

    setDailyMemoDateKey(selectedDateKey);
    setDailyMemo(nextEntries);

    if (wasCompleted !== nextCompleted) {
      applyPointChangeForCoreRoutine(selectedDateKey, 'memo', nextCompleted);
    }
  };

  const updateHistoryDailyEvent = (index: number, value: string) => {
    const wasCompleted = hasSavedDailyRecordEntries(historyDailyEvent);
    const nextEntries = updateDailyRecordEntry(historyDailyEvent, index, value);
    const nextCompleted = hasSavedDailyRecordEntries(nextEntries);

    setHistoryDailyEventDateKey(historySelectedDateKey);
    setHistoryDailyEvent(nextEntries);

    if (historySelectedDateKey === selectedDateKey) {
      setDailyEventDateKey(selectedDateKey);
      setDailyEvent(nextEntries);
    }

    if (wasCompleted !== nextCompleted) {
      applyPointChangeForCoreRoutine(historySelectedDateKey, 'events', nextCompleted);
    }
  };

  const saveHistoryDailyEvent = (index: number) => {
    const wasCompleted = hasSavedDailyRecordEntries(historyDailyEvent);
    const nextEntries = saveDailyRecordEntry(historyDailyEvent, index);
    const nextCompleted = hasSavedDailyRecordEntries(nextEntries);

    setHistoryDailyEventDateKey(historySelectedDateKey);
    setHistoryDailyEvent(nextEntries);

    if (historySelectedDateKey === selectedDateKey) {
      setDailyEventDateKey(selectedDateKey);
      setDailyEvent(nextEntries);
    }

    if (wasCompleted !== nextCompleted) {
      applyPointChangeForCoreRoutine(historySelectedDateKey, 'events', nextCompleted);
    }
  };

  const updateHistoryDailyMemo = (index: number, value: string) => {
    const wasCompleted = hasSavedDailyRecordEntries(historyDailyMemo);
    const nextEntries = updateDailyRecordEntry(historyDailyMemo, index, value);
    const nextCompleted = hasSavedDailyRecordEntries(nextEntries);

    setHistoryDailyMemoDateKey(historySelectedDateKey);
    setHistoryDailyMemo(nextEntries);

    if (historySelectedDateKey === selectedDateKey) {
      setDailyMemoDateKey(selectedDateKey);
      setDailyMemo(nextEntries);
    }

    if (wasCompleted !== nextCompleted) {
      applyPointChangeForCoreRoutine(historySelectedDateKey, 'memo', nextCompleted);
    }
  };

  const saveHistoryDailyMemo = (index: number) => {
    const wasCompleted = hasSavedDailyRecordEntries(historyDailyMemo);
    const nextEntries = saveDailyRecordEntry(historyDailyMemo, index);
    const nextCompleted = hasSavedDailyRecordEntries(nextEntries);

    setHistoryDailyMemoDateKey(historySelectedDateKey);
    setHistoryDailyMemo(nextEntries);

    if (historySelectedDateKey === selectedDateKey) {
      setDailyMemoDateKey(selectedDateKey);
      setDailyMemo(nextEntries);
    }

    if (wasCompleted !== nextCompleted) {
      applyPointChangeForCoreRoutine(historySelectedDateKey, 'memo', nextCompleted);
    }
  };

  const updateDailyTodoForSelectedDate = (id: string, text: string) => {
    setDailyTodosDateKey(selectedDateKey);
    setDailyTodos((currentTodos) => updateDailyTodoText(currentTodos, id, text));
  };

  const cleanupDailyTodoForSelectedDate = () => {
    setDailyTodosDateKey(selectedDateKey);
    setDailyTodos((currentTodos) => normalizeDailyTodos(currentTodos));
  };

  const toggleDailyTodoForSelectedDate = (id: string, completed: boolean) => {
    setDailyTodosDateKey(selectedDateKey);
    setDailyTodos((currentTodos) => toggleDailyTodoCompleted(currentTodos, id, completed));
  };

  const deleteDailyTodoForSelectedDate = (id: string) => {
    setDailyTodosDateKey(selectedDateKey);
    setDailyTodos((currentTodos) => deleteDailyTodo(currentTodos, id));
  };

  const updateHistoryDailyTodo = (id: string, text: string) => {
    setHistoryDailyTodosDateKey(historySelectedDateKey);
    setHistoryDailyTodos((currentTodos) => {
      const nextTodos = updateDailyTodoText(currentTodos, id, text);

      if (historySelectedDateKey === selectedDateKey) {
        setDailyTodosDateKey(selectedDateKey);
        setDailyTodos(nextTodos);
      }

      return nextTodos;
    });
  };

  const cleanupHistoryDailyTodo = () => {
    setHistoryDailyTodosDateKey(historySelectedDateKey);
    setHistoryDailyTodos((currentTodos) => {
      const nextTodos = normalizeDailyTodos(currentTodos);

      if (historySelectedDateKey === selectedDateKey) {
        setDailyTodosDateKey(selectedDateKey);
        setDailyTodos(nextTodos);
      }

      return nextTodos;
    });
  };

  const toggleHistoryDailyTodo = (id: string, completed: boolean) => {
    setHistoryDailyTodosDateKey(historySelectedDateKey);
    setHistoryDailyTodos((currentTodos) => {
      const nextTodos = toggleDailyTodoCompleted(currentTodos, id, completed);

      if (historySelectedDateKey === selectedDateKey) {
        setDailyTodosDateKey(selectedDateKey);
        setDailyTodos(nextTodos);
      }

      return nextTodos;
    });
  };

  const deleteHistoryDailyTodo = (id: string) => {
    setHistoryDailyTodosDateKey(historySelectedDateKey);
    setHistoryDailyTodos((currentTodos) => {
      const nextTodos = deleteDailyTodo(currentTodos, id);

      if (historySelectedDateKey === selectedDateKey) {
        setDailyTodosDateKey(selectedDateKey);
        setDailyTodos(nextTodos);
      }

      return nextTodos;
    });
  };

  const updateDailyAnyMemoForSelectedDate = (value: string) => {
    setDailyAnyMemoDateKey(selectedDateKey);
    setDailyAnyMemo(value);
  };

  const updateHistoryDailyAnyMemo = (value: string) => {
    setHistoryDailyAnyMemoDateKey(historySelectedDateKey);
    setHistoryDailyAnyMemo(value);

    if (historySelectedDateKey === selectedDateKey) {
      setDailyAnyMemoDateKey(selectedDateKey);
      setDailyAnyMemo(value);
    }
  };

  const syncRecordEntriesToActiveDates = (
    date: Date,
    kind: 'memo' | 'events',
    entries: DailyRecordEntries,
  ) => {
    const dateKey = getDateKey(date);

    if (dateKey === selectedDateKey) {
      if (kind === 'memo') {
        setDailyMemoDateKey(selectedDateKey);
        setDailyMemo(entries);
      } else {
        setDailyEventDateKey(selectedDateKey);
        setDailyEvent(entries);
      }
    }

    if (dateKey === historySelectedDateKey) {
      if (kind === 'memo') {
        setHistoryDailyMemoDateKey(historySelectedDateKey);
        setHistoryDailyMemo(entries);
      } else {
        setHistoryDailyEventDateKey(historySelectedDateKey);
        setHistoryDailyEvent(entries);
      }
    }
  };

  const updateRecordMemo = (date: Date, index: number, value: string) => {
    const dateKey = getDateKey(date);
    const currentEntries = dateKey === selectedDateKey
      ? dailyMemo
      : dateKey === historySelectedDateKey
        ? historyDailyMemo
        : loadDailyMemo(date);
    const nextEntries = updateDailyRecordEntryAsSaved(currentEntries, index, value);

    localStorage.setItem(getDailyMemoStorageKey(date), serializeDailyRecordEntries(nextEntries));
    syncRecordEntriesToActiveDates(date, 'memo', nextEntries);
    setRecordRevision((revision) => revision + 1);
  };

  const updateRecordEvent = (date: Date, index: number, value: string) => {
    const dateKey = getDateKey(date);
    const currentEntries = dateKey === selectedDateKey
      ? dailyEvent
      : dateKey === historySelectedDateKey
        ? historyDailyEvent
        : loadDailyEvent(date);
    const nextEntries = updateDailyRecordEntryAsSaved(currentEntries, index, value);

    localStorage.setItem(getDailyEventStorageKey(date), serializeDailyRecordEntries(nextEntries));
    syncRecordEntriesToActiveDates(date, 'events', nextEntries);
    setRecordRevision((revision) => revision + 1);
  };

  const syncRecordTodosToActiveDates = (date: Date, todos: DailyTodos) => {
    const dateKey = getDateKey(date);

    if (dateKey === selectedDateKey) {
      setDailyTodosDateKey(selectedDateKey);
      setDailyTodos(todos);
    }

    if (dateKey === historySelectedDateKey) {
      setHistoryDailyTodosDateKey(historySelectedDateKey);
      setHistoryDailyTodos(todos);
    }
  };

  const syncRecordAnyMemoToActiveDates = (date: Date, value: string) => {
    const dateKey = getDateKey(date);

    if (dateKey === selectedDateKey) {
      setDailyAnyMemoDateKey(selectedDateKey);
      setDailyAnyMemo(value);
    }

    if (dateKey === historySelectedDateKey) {
      setHistoryDailyAnyMemoDateKey(historySelectedDateKey);
      setHistoryDailyAnyMemo(value);
    }
  };

  const updateRecordTodo = (date: Date, id: string, text: string) => {
    const dateKey = getDateKey(date);
    const currentTodos = dateKey === selectedDateKey
      ? dailyTodos
      : dateKey === historySelectedDateKey
        ? historyDailyTodos
        : loadDailyTodos(date);
    const nextTodos = updateDailyTodoText(currentTodos, id, text);

    localStorage.setItem(getDailyTodosStorageKey(date), serializeDailyTodos(nextTodos));
    syncRecordTodosToActiveDates(date, nextTodos);
    setRecordRevision((revision) => revision + 1);
  };

  const cleanupRecordTodo = (date: Date) => {
    const dateKey = getDateKey(date);
    const currentTodos = dateKey === selectedDateKey
      ? dailyTodos
      : dateKey === historySelectedDateKey
        ? historyDailyTodos
        : loadDailyTodos(date);
    const nextTodos = normalizeDailyTodos(currentTodos);

    localStorage.setItem(getDailyTodosStorageKey(date), serializeDailyTodos(nextTodos));
    syncRecordTodosToActiveDates(date, nextTodos);
    setRecordRevision((revision) => revision + 1);
  };

  const toggleRecordTodo = (date: Date, id: string, completed: boolean) => {
    const dateKey = getDateKey(date);
    const currentTodos = dateKey === selectedDateKey
      ? dailyTodos
      : dateKey === historySelectedDateKey
        ? historyDailyTodos
        : loadDailyTodos(date);
    const nextTodos = toggleDailyTodoCompleted(currentTodos, id, completed);

    localStorage.setItem(getDailyTodosStorageKey(date), serializeDailyTodos(nextTodos));
    syncRecordTodosToActiveDates(date, nextTodos);
    setRecordRevision((revision) => revision + 1);
  };

  const deleteRecordTodo = (date: Date, id: string) => {
    const dateKey = getDateKey(date);
    const currentTodos = dateKey === selectedDateKey
      ? dailyTodos
      : dateKey === historySelectedDateKey
        ? historyDailyTodos
        : loadDailyTodos(date);
    const nextTodos = deleteDailyTodo(currentTodos, id);

    localStorage.setItem(getDailyTodosStorageKey(date), serializeDailyTodos(nextTodos));
    syncRecordTodosToActiveDates(date, nextTodos);
    setRecordRevision((revision) => revision + 1);
  };

  const updateRecordAnyMemo = (date: Date, value: string) => {
    localStorage.setItem(getDailyAnyMemoStorageKey(date), value);
    syncRecordAnyMemoToActiveDates(date, value);
    setRecordRevision((revision) => revision + 1);
  };

  const saveScheduleForDate = (date: Date, schedule: DailySchedule) => {
    const normalizedSchedule = normalizeDailySchedule(schedule);
    const storageKey = getDailyScheduleStorageKey(date);

    if (normalizedSchedule.length > 0) {
      localStorage.setItem(storageKey, serializeDailySchedule(normalizedSchedule));
    } else {
      localStorage.removeItem(storageKey);
    }

    setScheduleRevision((revision) => revision + 1);
  };

  const updateScheduleItem = (
    date: Date,
    item: DailyScheduleItem,
    field: keyof Pick<DailyScheduleItem, 'time' | 'text'>,
    value: string,
  ) => {
    const currentSchedule = loadDailySchedule(date);
    const nextSchedule = upsertDailyScheduleItem(currentSchedule, {
      ...item,
      [field]: value,
    });

    saveScheduleForDate(date, nextSchedule);
  };

  const commitScheduleDraft = (
    date: Date,
    draft: Pick<DailyScheduleItem, 'time' | 'text'>,
  ) => {
    if (!draft.text.trim()) {
      return;
    }

    const currentSchedule = loadDailySchedule(date);
    const nextSchedule = upsertDailyScheduleItem(
      currentSchedule,
      createDailyScheduleItem(draft.time, draft.text),
    );

    saveScheduleForDate(date, nextSchedule);
    setScheduleDrafts((currentDrafts) => ({
      ...currentDrafts,
      [getDateKey(date)]: { time: '', text: '' },
    }));
  };

  const updateScheduleDraft = (
    date: Date,
    field: keyof Pick<DailyScheduleItem, 'time' | 'text'>,
    value: string,
  ) => {
    const dateKey = getDateKey(date);
    const currentDraft = scheduleDrafts[dateKey] ?? { time: '', text: '' };
    const nextDraft = {
      ...currentDraft,
      [field]: value,
    };

    setScheduleDrafts((currentDrafts) => ({
      ...currentDrafts,
      [dateKey]: nextDraft,
    }));
  };

  const removeScheduleItem = (date: Date, id: string) => {
    const currentSchedule = loadDailySchedule(date);

    saveScheduleForDate(date, deleteDailyScheduleItem(currentSchedule, id));
  };

  const showScheduleToday = () => {
    setScheduleMonth(getMonthStart(today));
    setSelectedScheduleDate(today);
  };

  const moveScheduleMonth = (months: number) => {
    setScheduleMonth((currentMonth) => addMonths(currentMonth, months));
    setSelectedScheduleDate(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showRecordToday = () => {
    setRecordMonth(getMonthStart(today));
    setSelectedRecordDate(null);
  };

  const moveRecordMonth = (months: number) => {
    setRecordMonth((currentMonth) => addMonths(currentMonth, months));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const changePage = (nextPage: PageName) => {
    resetEditUiState();
    setPage(nextPage);
  };

  const selectScheduleView = (nextView: ScheduleViewName) => {
    setScheduleView(nextView);
    setSelectedScheduleDate(null);
  };

  const selectRecordView = (nextView: RecordViewName) => {
    setRecordView(nextView);
    setSelectedRecordDate(null);
  };

  const updateQuestSlotExchangeRule = (
    field: keyof QuestSlotExchangeRule,
    value: number | boolean,
  ) => {
    setGameBalanceDraft((currentBalance) => ({
      ...currentBalance,
      questSlotExchange: {
        ...currentBalance.questSlotExchange,
        [field]: field === 'enabled'
          ? Boolean(value)
          : Math.max(0, Math.floor(Number(value) || 0)),
      },
    }));
  };

  const updatePointSetting = <Field extends keyof PointSettings>(
    field: Field,
    value: PointSettings[Field],
  ) => {
    setGameBalanceDraft((currentBalance) => ({
      ...currentBalance,
      pointSettings: {
        ...currentBalance.pointSettings,
        [field]: value,
      },
    }));
  };

  const updateRankRule = (
    index: number,
    field: keyof RankRule,
    value: number,
  ) => {
    setGameBalanceDraft((currentBalance) => ({
      ...currentBalance,
      rankRules: currentBalance.rankRules.map((rule, ruleIndex) =>
        ruleIndex === index
          ? {
              ...rule,
              [field]: field === 'pointMultiplier'
                ? Math.max(0.1, Number(value) || 1)
                : Math.max(field === 'rank' ? 1 : 0, Math.floor(Number(value) || 0)),
            }
          : rule,
      ),
    }));
  };

  const saveGameBalanceSettings = () => {
    const normalizedBalance = normalizeGameBalanceSettings(gameBalanceDraft);

    setGameBalance(normalizedBalance);
    setGameBalanceDraft(normalizedBalance);
  };

  const resetGameBalanceSettings = () => {
    setGameBalance(defaultGameBalanceSettings);
    setGameBalanceDraft(defaultGameBalanceSettings);
  };

  const exchangeQuestSlot = () => {
    if (gameMode !== 'player' || exchangeLockRef.current) {
      return;
    }

    const exchangeRule = gameBalance.questSlotExchange;
    const currentSlots = getEffectiveQuestSlotLimit(playerUnlocks, gameBalance);
    const nextSlots = Math.min(currentSlots + 1, exchangeRule.maxTotalSlots);

    if (
      !exchangeRule.enabled ||
      currentSlots >= exchangeRule.maxTotalSlots ||
      playerEconomy.currentPoints < exchangeRule.price
    ) {
      return;
    }

    const confirmed = window.confirm(
      `${exchangeRule.price}PTを使って、フリークエスト枠を1つ増やしますか？`,
    );

    if (!confirmed) {
      return;
    }

    exchangeLockRef.current = true;
    const now = new Date().toISOString();
    const reason = 'フリークエスト枠 +1';

    setPlayerEconomy((currentEconomy) => {
      if (currentEconomy.currentPoints < exchangeRule.price) {
        exchangeLockRef.current = false;
        return currentEconomy;
      }

      const spendEntry: PointLedgerEntry = {
        id: `exchange:questSlot:total:${now}`,
        achievementKey: 'exchange:questSlot:total',
        dateKey: '',
        itemId: '',
        itemLabel: reason,
        sectionId: 'total',
        type: 'spend',
        points: -exchangeRule.price,
        basePoints: exchangeRule.price,
        multiplier: 1,
        createdAt: now,
        reason,
      };

      return {
        ...currentEconomy,
        currentPoints: Math.max(0, currentEconomy.currentPoints - exchangeRule.price),
        lifetimeSpentPoints: currentEconomy.lifetimeSpentPoints + exchangeRule.price,
        pointLedger: [...currentEconomy.pointLedger, spendEntry],
      };
    });

    setPlayerUnlocks((currentUnlocks) => {
      const lockedCurrentSlots = getEffectiveQuestSlotLimit(currentUnlocks, gameBalance);

      if (lockedCurrentSlots >= exchangeRule.maxTotalSlots) {
        return currentUnlocks;
      }

      return {
        ...currentUnlocks,
        totalQuestSlots: Math.min(lockedCurrentSlots + 1, exchangeRule.maxTotalSlots),
      };
    });
    setExchangeToast({
      id: `exchange-toast:quest-slot:${now}`,
      message: `フリークエスト枠が${nextSlots}個に増えました！`,
    });
    window.setTimeout(() => {
      exchangeLockRef.current = false;
    }, 0);
  };

  const isPlayerModeQuestLimitReached = (sections: RoutineSection[]) =>
    gameMode === 'player' &&
    countFreeQuestItems(sections) >= getEffectiveQuestSlotLimit(playerUnlocks, gameBalance);
  const shopItems: ShopItem[] = [
    {
      id: 'quest-slot-total',
      category: 'questSlot',
      label: 'フリークエスト枠 +1',
      price: gameBalance.questSlotExchange.price,
      enabled: gameBalance.questSlotExchange.enabled,
      maxPurchases: Math.max(
        0,
        gameBalance.questSlotExchange.maxTotalSlots -
          gameBalance.questSlotExchange.initialTotalSlots,
      ),
    },
  ];
  const focusDailyRecordField = (
    kind: CoreRoutineKind,
    context: 'today' | 'history' = 'today',
  ) => {
    const targetRef =
      context === 'history'
        ? kind === 'memo'
          ? historyDailyMemoTextareaRef
          : historyDailyEventTextareaRef
        : kind === 'memo'
        ? dailyMemoTextareaRef
        : dailyEventTextareaRef;

    targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => targetRef.current?.focus(), 240);
  };
  const getCoreRoutineEntryKey = (coreRoutineId: CoreRoutineId) => `core:${coreRoutineId}`;
  const getSectionCoreRoutineEntries = (sectionId: string): RoutineRenderEntry[] =>
    dailySectionIds.includes(sectionId as StartSection)
      ? coreRoutineDefinitions
        .filter((definition) => coreRoutinePlacements[definition.id]?.sectionId === sectionId)
        .map((definition) => ({
          kind: 'core' as const,
          key: getCoreRoutineEntryKey(definition.id),
          order: coreRoutinePlacements[definition.id]?.order ?? 9000,
          coreRoutine: definition,
        }))
      : [];
  const getMixedRoutineEntries = (
    section: RoutineSection,
    options: { includeCoreRoutines: boolean },
  ): RoutineRenderEntry[] => [
    ...section.items.map((item) => ({
      kind: 'routine' as const,
      key: item.id,
      order: item.order,
      item,
    })),
    ...(options.includeCoreRoutines ? getSectionCoreRoutineEntries(section.id) : []),
  ].sort((first, second) => first.order - second.order);
  const moveCoreRoutineToSection = (
    coreRoutineId: CoreRoutineId,
    nextSectionId: StartSection,
  ) => {
    setCoreRoutinePlacements((currentPlacements) => {
      const sectionItems = displaySections.find((section) => section.id === nextSectionId)?.items ?? [];
      const coreOrders = coreRoutineDefinitions
        .filter((definition) =>
          definition.id !== coreRoutineId &&
          currentPlacements[definition.id]?.sectionId === nextSectionId,
        )
        .map((definition) => currentPlacements[definition.id]?.order ?? 0);
      const nextOrder = Math.max(
        0,
        ...sectionItems.filter((item) => !item.fixedKind).map((item) => item.order),
        ...coreOrders,
      ) + 10;

      return {
        ...currentPlacements,
        [coreRoutineId]: {
          sectionId: nextSectionId,
          order: nextOrder,
        },
      };
    });
  };
  const reorderMixedRoutineEntry = (
    sectionId: string,
    draggedKey: string,
    targetKey: string,
  ) => {
    if (draggedKey === targetKey || !dailySectionIds.includes(sectionId as StartSection)) {
      return;
    }

    const currentSections = removeFixedRoutineItems(getSectionsForTarget(
      templateSettings,
      dateOverrides,
      dateSnapshots,
      getUpdateTargetForSection(sectionId),
      todayKey,
    ));
    const section = currentSections.find((currentSection) => currentSection.id === sectionId);

    if (!section) {
      return;
    }

    const orderedEntries = getMixedRoutineEntries(section, { includeCoreRoutines: true });
    const draggedIndex = orderedEntries.findIndex((entry) => entry.key === draggedKey);
    const targetIndex = orderedEntries.findIndex((entry) => entry.key === targetKey);

    if (draggedIndex === -1 || targetIndex === -1) {
      return;
    }

    const nextEntries = [...orderedEntries];
    const [draggedEntry] = nextEntries.splice(draggedIndex, 1);

    nextEntries.splice(targetIndex, 0, draggedEntry);

    const nextOrders = new Map(nextEntries.map((entry, index) => [
      entry.key,
      (index + 1) * 10,
    ]));

    updateSectionsForTarget(getUpdateTargetForSection(sectionId), (currentTargetSections) =>
      currentTargetSections.map((currentSection) => {
        if (currentSection.id !== sectionId) {
          return currentSection;
        }

        return {
          ...currentSection,
          items: currentSection.items.map((item) => ({
            ...item,
            order: nextOrders.get(item.id) ?? item.order,
          })),
        };
      }),
    );

    setCoreRoutinePlacements((currentPlacements) => {
      const nextPlacements = { ...currentPlacements };

      coreRoutineDefinitions.forEach((definition) => {
        const entryKey = getCoreRoutineEntryKey(definition.id);
        const nextOrder = nextOrders.get(entryKey);

        if (nextOrder !== undefined) {
          nextPlacements[definition.id] = {
            sectionId: sectionId as StartSection,
            order: nextOrder,
          };
        }
      });

      return nextPlacements;
    });
  };

  const wakeRoutineItem = displaySections
    .flatMap((section) => section.items)
    .find((item) => item.fixedKind === 'wake');
  const sleepRoutineItem = displaySections
    .flatMap((section) => section.items)
    .find((item) => item.fixedKind === 'sleep');
  const activitySections = displaySections.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.fixedKind),
  }));
  const bonusSection = activitySections.find((section) => section.id === bonusSectionId);
  const dailyActivitySections = activitySections.filter((section) => section.id !== bonusSectionId);
  const routineRenderSections: RoutineSection[] = [
    ...(wakeRoutineItem
      ? [{
          id: 'wake-milestone',
          title: '起床',
          order: -100,
          items: [wakeRoutineItem],
        }]
      : []),
    ...dailyActivitySections,
    ...(sleepRoutineItem
      ? [{
          id: 'sleep-milestone',
          title: '就寝',
          order: 10000,
          items: [sleepRoutineItem],
        }]
      : []),
    ...(bonusSection ? [bonusSection] : []),
  ];
  const activeRecordViewOption =
    recordViewOptions.find((option) => option.key === recordView) ?? recordViewOptions[0];
  const activeRecordHeading = recordViewHeadings[recordView];
  const activeScheduleViewOption =
    scheduleViewOptions.find((option) => option.key === scheduleView) ?? scheduleViewOptions[0];
  const activeScheduleHeading = scheduleViewHeadings[scheduleView];

  return (
    <main
      className="app"
      data-page={page}
      data-record-view={page === 'records' ? recordView : undefined}
      data-schedule-view={page === 'schedule' ? scheduleView : undefined}
      data-timer-alert={activeTimer?.isComplete && !timerAlertSilenced ? 'true' : 'false'}
    >
      <div className="app-content">
        <header className={`app-header${page === 'today' ? ' today-title-header' : ''}`}>
          <div className="top-bar">
            <p className="project-name">hibitin</p>
          </div>
          <h1>
            {page === 'today' && (
              <>
                <span>ぼくらの</span>
                <span>ゆるい日々ティン帳</span>
              </>
            )}
            {page === 'history' && 'スタンプ帳'}
            {page === 'schedule' && `${activeScheduleViewOption.icon} ${activeScheduleHeading}`}
            {page === 'records' && `${activeRecordViewOption.icon} ${activeRecordHeading}`}
            {page === 'shop' && 'ショップ'}
            {page === 'settings' && '設定'}
          </h1>
          {page === 'schedule' && <p className="record-header-kicker">スケジュール</p>}
          {page === 'records' && <p className="record-header-kicker">記録</p>}
          {page === 'today' && <p className="daily-message">{dailyMessage}</p>}
        </header>

        {page === 'today' && (
          <div className="quest-date-switch" aria-label="クエストの日付切り替え">
            <button
              data-active={!isToday ? 'true' : 'false'}
              onClick={() => switchQuestDate(yesterday)}
              type="button"
            >
              昨日
            </button>
            <button
              data-active={isToday ? 'true' : 'false'}
              onClick={() => switchQuestDate(today)}
              type="button"
            >
              今日
            </button>
          </div>
        )}

        {page === 'today' && (
          <section
            className="economy-status"
            aria-label="プレイヤーランクとPT"
            data-popup-ui="true"
          >
            <button
              aria-expanded={isRankPanelOpen}
              className="rank-status-button"
              onClick={() => {
                setNoteEditorTarget(null);
                setTimerSettingItemId(null);
                setIsRankPanelOpen((current) => !current);
              }}
              type="button"
            >
              <span className="rank-status-hero">
                <span className="rank-status-avatar" aria-hidden="true">
                  {playerIcon.emoji}
                </span>
                <span className="rank-status-identity">
                  <span className="rank-status-name">{playerDisplayName}</span>
                  <span className="rank-status-main">🏅 Rank {playerRankProgress.rank}</span>
                </span>
              </span>
              <span className="rank-status-pt">
                <span className="rank-status-pt-main">💰 {playerEconomy.currentPoints}PT</span>
                <span className="rank-status-multiplier">
                  ×{playerRankProgress.multiplier.toFixed(2)}
                </span>
              </span>
              <span className="rank-status-routines" aria-label="ルーティン数">
                <span>📜 コアルーティン {coreRoutineCount}個</span>
                <span>🎯 フリークエスト {freeQuestCount}個</span>
              </span>
              <span
                className="rank-status-earned"
                data-empty={selectedDateEarnedPoints === 0 ? 'true' : 'false'}
              >
                ✨ {selectedDateEarnedPointsLabel} +{selectedDateEarnedPoints}PT
              </span>
              <span className="rank-status-caret" aria-hidden="true">
                {isRankPanelOpen ? '▲' : '▼'}
              </span>
            </button>
            {isRankPanelOpen && (
              <div className="rank-detail-panel" role="dialog" aria-label="プレイヤー成長詳細">
                <div className="rank-detail-header">
                  <span aria-hidden="true">🏅</span>
                  <div>
                    <h2>Rank {playerRankProgress.rank}</h2>
                    <p>
                      {playerRankProgress.nextRank
                        ? `次のランクまであと${playerRankProgress.starsUntilNextRank}★`
                        : '現在の最高ランクです'}
                    </p>
                  </div>
                  <button
                    aria-label="ランク詳細を閉じる"
                    onClick={() => setIsRankPanelOpen(false)}
                    type="button"
                  >
                    ×
                  </button>
                </div>
                <dl className="rank-detail-stats">
                  <div>
                    <dt>累計スター</dt>
                    <dd>{playerEconomy.lifetimeStarsEarned}★</dd>
                  </div>
                  <div>
                    <dt>所持PT</dt>
                    <dd>{playerEconomy.currentPoints}PT</dd>
                  </div>
                  <div>
                    <dt>累計獲得PT</dt>
                    <dd>{playerEconomy.lifetimeEarnedPoints}PT</dd>
                  </div>
                  <div>
                    <dt>獲得倍率</dt>
                    <dd>×{playerRankProgress.multiplier.toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt>次ランク必要</dt>
                    <dd>
                      {playerRankProgress.nextRank
                        ? `${playerEconomy.lifetimeStarsEarned + playerRankProgress.starsUntilNextRank}★`
                        : '達成済み'}
                    </dd>
                  </div>
                  <div>
                    <dt>あと</dt>
                    <dd>{playerRankProgress.starsUntilNextRank}★</dd>
                  </div>
                </dl>
              </div>
            )}
          </section>
        )}

        {pointToast && (
          <div
            className="point-toast"
            data-variant={pointToast.variant ?? 'default'}
            key={pointToast.id}
            role="status"
          >
            {pointToast.icon && <span className="point-toast-icon" aria-hidden="true">{pointToast.icon}</span>}
            <span className="point-toast-body">
              {pointToast.message && (
                <span className="point-toast-message">{pointToast.message}</span>
              )}
              <span className="point-toast-points">+{pointToast.points}PT</span>
            </span>
          </div>
        )}

        {page === 'settings' && (
          <section className="game-mode-settings" aria-label="ゲームモード">
            <div className="settings-header">
              <div>
                <h2>ゲームモード</h2>
                <p>hibitinの遊び方を選びます。今は切り替え状態だけ保存します。</p>
              </div>
            </div>
            <div className="game-mode-options">
              {([
                {
                  key: 'player',
                  title: 'プレイヤーモード',
                  badge: '推奨',
                  description:
                    '少ないクエストを毎日続けるためのモードです。今後、段階解放の土台になります。',
                },
                {
                  key: 'developer',
                  title: '開発者モード',
                  badge: '全機能',
                  description:
                    '現在のhibitinと同じく、制限なしでルーティンを作れるモードです。',
                },
              ] as {
                key: GameMode;
                title: string;
                badge: string;
                description: string;
              }[]).map((mode) => (
                <button
                  className="game-mode-option"
                  data-active={gameMode === mode.key ? 'true' : 'false'}
                  key={mode.key}
                  onClick={() => setGameMode(mode.key)}
                  type="button"
                >
                  <span className="game-mode-title">
                    {mode.title}
                    <span>{mode.badge}</span>
                  </span>
                  <span className="game-mode-description">{mode.description}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {page === 'settings' && (
          <section className="player-profile-settings" aria-label="プレイヤー設定">
            <div className="settings-header">
              <div>
                <h2>プレイヤー設定</h2>
                <p>アプリ内で自然に呼びかけるための名前を登録できます。</p>
              </div>
            </div>
            <label className="player-name-field">
              <span>プレイヤー名</span>
              <input
                maxLength={20}
                onBlur={(event) =>
                  setPlayerProfile((currentProfile) => ({
                    ...currentProfile,
                    displayName: event.target.value.trim().slice(0, 20),
                  }))
                }
                onChange={(event) =>
                  setPlayerProfile((currentProfile) => ({
                    ...currentProfile,
                    displayName: event.target.value.slice(0, 20),
                  }))
                }
                placeholder="名前を入力"
                type="text"
                value={playerProfile.displayName}
              />
            </label>
            <div className="player-icon-settings">
              <span>プレイヤーアイコン</span>
              <div className="player-icon-options" role="radiogroup" aria-label="プレイヤーアイコン">
                {playerIconOptions.map((option) => (
                  <button
                    aria-checked={playerProfile.iconId === option.id}
                    aria-label={option.label}
                    className="player-icon-option"
                    data-active={playerProfile.iconId === option.id ? 'true' : 'false'}
                    key={option.id}
                    onClick={() =>
                      setPlayerProfile((currentProfile) => ({
                        ...currentProfile,
                        iconId: option.id,
                      }))
                    }
                    role="radio"
                    type="button"
                  >
                    <span aria-hidden="true">{option.emoji}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {page === 'settings' && gameMode === 'developer' && (
          <section className="admin-balance-settings" aria-label="ゲームバランス設定">
            <div className="settings-header">
              <div>
                <h2>ゲームバランス設定</h2>
                <p>PT、ランク、ショップ、プレイヤーモード制限をまとめて管理します。</p>
              </div>
            </div>
            <div className="admin-balance-grid">
              <div className="admin-balance-block admin-mastery-rules">
                <h3>星・トロフィー条件</h3>
                <ul>
                  {getMasteryAdminRuleText().map((ruleText) => (
                    <li key={ruleText}>{ruleText}</li>
                  ))}
                </ul>
                <p className="admin-balance-note">
                  現在は固定実装です。将来的にはこの条件を管理者設定から変更できるようにします。
                </p>
              </div>
              <div className="admin-balance-block admin-point-settings">
                <h3>PT設定</h3>
                <label className="admin-setting-line">
                  <span>丸め方</span>
                  <select
                    onChange={(event) =>
                      updatePointSetting(
                        'rounding',
                        event.target.value as PointSettings['rounding'],
                      )
                    }
                    value={gameBalanceDraft.pointSettings.rounding}
                  >
                    <option value="round">四捨五入</option>
                    <option value="floor">切り捨て</option>
                    <option value="ceil">切り上げ</option>
                  </select>
                </label>
                <div className="admin-point-targets">
                  {([
                    ['wake', '起床'],
                    ['normal', 'フリークエスト'],
                    ['sleep', '就寝'],
                    ['advanced', 'アドバンスト'],
                    ['dailyNudge', '本日の日替わりクエスト'],
                    ['coreMemo', '今日のひとことを残す'],
                    ['coreEvents', '今日のできごとを残す'],
                  ] as [PointTargetKind, string][]).map(([targetKind, label]) => (
                    <div className="admin-point-target-row" key={targetKind}>
                      <label>
                        <input
                          checked={gameBalanceDraft.pointSettings[targetKind].enabled}
                          onChange={(event) =>
                            updatePointSetting(targetKind, {
                              ...gameBalanceDraft.pointSettings[targetKind],
                              enabled: event.target.checked,
                            })
                          }
                          type="checkbox"
                        />
                        <span>{label}</span>
                      </label>
                      <label>
                        <span>基礎PT</span>
                        <input
                          min="0"
                          onChange={(event) =>
                            updatePointSetting(targetKind, {
                              ...gameBalanceDraft.pointSettings[targetKind],
                              basePoints: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                            })
                          }
                          type="number"
                          value={gameBalanceDraft.pointSettings[targetKind].basePoints}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="admin-balance-block admin-rank-settings">
                <h3>ランク設定</h3>
                {gameBalanceDraft.rankRules.map((rule, index) => (
                  <div className="admin-rank-row" key={`rank-${rule.rank}-${index}`}>
                    <label>
                      <span>Rank</span>
                      <input
                        min="1"
                        onChange={(event) =>
                          updateRankRule(index, 'rank', Number(event.target.value))
                        }
                        type="number"
                        value={rule.rank}
                      />
                    </label>
                    <label>
                      <span>必要累計★</span>
                      <input
                        min="0"
                        onChange={(event) =>
                          updateRankRule(index, 'requiredLifetimeStars', Number(event.target.value))
                        }
                        type="number"
                        value={rule.requiredLifetimeStars}
                      />
                    </label>
                    <label>
                      <span>PT倍率</span>
                      <input
                        min="0.1"
                        onChange={(event) =>
                          updateRankRule(index, 'pointMultiplier', Number(event.target.value))
                        }
                        step="0.05"
                        type="number"
                        value={rule.pointMultiplier}
                      />
                    </label>
                  </div>
                ))}
              </div>
              <div className="admin-balance-block admin-implementation-status">
                <h3>実装状況</h3>
                <div className="admin-status-columns">
                  <div>
                    <h4>実装済み</h4>
                    <ul>
                      <li>フリークエスト完了によるPT獲得</li>
                      <li>チェック解除によるPT取消</li>
                      <li>二重獲得防止</li>
                      <li>累計星によるランク計算</li>
                      <li>ランクによるPT倍率</li>
                      <li>PTおよびランクの表示</li>
                      <li>本日の日替わりクエスト完了によるPT獲得</li>
                      <li>本日の日替わりクエスト連続記録</li>
                      <li>記憶系コアルーティン完了によるPT獲得</li>
                      <li>記憶系コアルーティン本文削除によるPT取消</li>
                      <li>ショップタブ</li>
                      <li>所持PT表示</li>
                      <li>PTによるフリークエスト枠購入</li>
                      <li>PT支出履歴</li>
                      <li>所持PT不足判定</li>
                      <li>最大枠判定</li>
                    </ul>
                  </div>
                  <div>
                    <h4>未実装</h4>
                    <ul>
                      <li>タイマー機能購入</li>
                      <li>メモ機能購入</li>
                      <li>背景</li>
                      <li>キャラクター着せ替え</li>
                      <li>アイテム</li>
                      <li>ガチャ</li>
                      <li>連続達成PTボーナス</li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="admin-balance-block admin-slot-exchange-settings">
                <h3>フリークエスト枠交換設定</h3>
                <div className="admin-slot-row">
                  <h4>フリークエスト枠 +1</h4>
                  <p>
                    利用可能：{getEffectiveQuestSlotLimit(playerUnlocks, gameBalanceDraft)}枠 /
                    使用中：{countFreeQuestItems(displaySections)}枠
                  </p>
                  <label className="admin-slot-enabled">
                    <span>販売</span>
                    <input
                      checked={gameBalanceDraft.questSlotExchange.enabled}
                      onChange={(event) =>
                        updateQuestSlotExchangeRule('enabled', event.target.checked)
                      }
                      type="checkbox"
                    />
                  </label>
                  <label>
                    <span>初期合計枠数</span>
                    <input
                      min="1"
                      onChange={(event) =>
                        updateQuestSlotExchangeRule(
                          'initialTotalSlots',
                          Number(event.target.value),
                        )
                      }
                      type="number"
                      value={gameBalanceDraft.questSlotExchange.initialTotalSlots}
                    />
                  </label>
                  <label>
                    <span>最大合計枠数</span>
                    <input
                      min="1"
                      onChange={(event) =>
                        updateQuestSlotExchangeRule(
                          'maxTotalSlots',
                          Number(event.target.value),
                        )
                      }
                      type="number"
                      value={gameBalanceDraft.questSlotExchange.maxTotalSlots}
                    />
                  </label>
                  <label>
                    <span>価格</span>
                    <input
                      min="0"
                      onChange={(event) =>
                        updateQuestSlotExchangeRule('price', Number(event.target.value))
                      }
                      type="number"
                      value={gameBalanceDraft.questSlotExchange.price}
                    />
                  </label>
                </div>
                <p className="admin-balance-note">
                  プレイヤーモードでは、朝・昼・夕・夜のフリークエスト合計数が追加上限になります。
                  開発者モードでは枠制限はありません。
                </p>
              </div>
            </div>
            <div className="admin-balance-actions">
              <button onClick={saveGameBalanceSettings} type="button">
                保存
              </button>
              <button onClick={resetGameBalanceSettings} type="button">
                初期値に戻す
              </button>
            </div>
          </section>
        )}

        {page === 'settings' && gameMode === 'developer' && (
          <section className="daily-nudge-admin-settings" aria-label="日替わりクエスト管理">
            <div className="settings-header">
              <div>
                <h2>日替わりクエスト管理</h2>
                <p>
                  毎日ひとつだけ表示する小さな日替わりクエストを管理します。保存済みの日付記録は候補を編集・削除しても変わりません。
                </p>
              </div>
            </div>
            <div className="daily-nudge-admin-list">
              {[...dailyNudgeCandidates]
                .sort((first, second) => first.order - second.order)
                .map((candidate, index, orderedCandidates) => (
                  <article className="daily-nudge-admin-card" key={candidate.id}>
                    <div className="daily-nudge-admin-card-header">
                      <label>
                        <input
                          checked={candidate.enabled}
                          onChange={(event) =>
                            updateDailyNudgeCandidate(
                              candidate.id,
                              'enabled',
                              event.target.checked,
                            )
                          }
                          type="checkbox"
                        />
                        <span>{candidate.enabled ? '有効' : '無効'}</span>
                      </label>
                      <div className="daily-nudge-admin-card-actions">
                        <button
                          disabled={index === 0}
                          onClick={() => moveDailyNudgeCandidate(candidate.id, -1)}
                          type="button"
                        >
                          上へ
                        </button>
                        <button
                          disabled={index === orderedCandidates.length - 1}
                          onClick={() => moveDailyNudgeCandidate(candidate.id, 1)}
                          type="button"
                        >
                          下へ
                        </button>
                        <button
                          onClick={() => deleteDailyNudgeCandidate(candidate.id)}
                          type="button"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                    <label>
                      <span>提案文</span>
                      <textarea
                        onChange={(event) =>
                          updateDailyNudgeCandidate(candidate.id, 'text', event.target.value)
                        }
                        rows={2}
                        value={candidate.text}
                      />
                    </label>
                    <label>
                      <span>完了メッセージ</span>
                      <input
                        onChange={(event) =>
                          updateDailyNudgeCandidate(
                            candidate.id,
                            'completionMessage',
                            event.target.value,
                          )
                        }
                        type="text"
                        value={candidate.completionMessage}
                      />
                    </label>
                    <label>
                      <span>カテゴリ</span>
                      <input
                        onChange={(event) =>
                          updateDailyNudgeCandidate(candidate.id, 'category', event.target.value)
                        }
                        type="text"
                        value={candidate.category}
                      />
                    </label>
                    <p className="daily-nudge-admin-id">ID: {candidate.id}</p>
                  </article>
                ))}
            </div>
            <button
              className="daily-nudge-add-button"
              onClick={addDailyNudgeCandidate}
              type="button"
            >
              候補追加
            </button>
          </section>
        )}

        {page === 'settings' && (
          <section className="template-settings">
            <div className="settings-header">
              <div>
                <h2>テンプレート設定</h2>
                <p>ノーマルと休日のルーティン、曜日ごとの割り当てを管理します。</p>
              </div>
            </div>

            <div className="weekday-assignment" aria-label="曜日割り当て">
              {(['normal', 'holiday'] as TemplateKind[]).map((template) => (
                <div className="template-assignment-column" key={template}>
                  <button
                    className="template-tab-button"
                    data-active={editTargetKey === template ? 'true' : 'false'}
                    onClick={() => setEditTargetKey(template)}
                    type="button"
                  >
                    {getTemplateLabel(template)}
                  </button>
                  <div className="weekday-chips">
                    {weekdayOptions.map((weekday) => {
                      const isAssigned =
                        templateSettings.weekdayTypeMap[weekday.key] === template;

                      return (
                        <button
                          aria-label={`${weekday.label}曜日の所属を切り替え`}
                          data-assigned={isAssigned ? 'true' : 'false'}
                          data-template={template}
                          key={weekday.key}
                          onClick={() => toggleWeekdayType(weekday.key)}
                          type="button"
                        >
                          {weekday.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="start-section-options" aria-label={`${getTemplateLabel(template)}の1日の始まり`}>
                    {([
                      ['morning', '朝'],
                      ['noon', '昼'],
                      ['evening', '夕'],
                      ['night', '夜'],
                    ] as [StartSection, string][]).map(([sectionId, label]) => (
                      <button
                        data-active={
                          rhythmSettings[template].startSection === sectionId
                            ? 'true'
                            : 'false'
                        }
                        key={sectionId}
                        onClick={() =>
                          updateRhythmConfig(template, 'startSection', sectionId)
                        }
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

          </section>
        )}

        {(page === 'today' || page === 'settings') && (
        <div
          className="routine-list"
          data-progress-level={page === 'today' ? selectedDateVisualRank.level : undefined}
        >
          {page === 'today' && (
            <div className="quest-list-title">
              <div className="quest-title-text">
                <span aria-hidden="true">🎮</span>
                <h2>{isToday ? '今日のクエスト' : '昨日のクエスト'}</h2>
              </div>
            </div>
          )}
          {page === 'today' && (
            <p className="quest-date-label">📅 {questDateLabel}</p>
          )}
          {page === 'today' && (
            <section
              className="result-panel"
              data-rank-level={selectedDateVisualRank.level}
              aria-label={isToday ? '今日の達成率' : '選択日の達成率'}
            >
              {selectedDateStats.rate === null ? (
                <>
                  <p className="result-rank">ルーティン未設定</p>
                  <p className="result-rate">--</p>
                  <p className="result-count">0 / 0 完了</p>
                </>
              ) : (
                <>
                  <p className="result-rank">
                    <span aria-hidden="true">{selectedDateVisualRank.icon}</span>
                    {selectedDateVisualRank.label}
                  </p>
                  <p className="result-count">
                    {selectedDateStats.completedCount} / {selectedDateStats.totalCount} 完了
                  </p>
                  <p className="result-rate">{selectedDateStats.rate}%</p>
                </>
              )}
            </section>
          )}
          {page === 'today' && (
            <section
              className="daily-nudge-card daily-nudge-inline"
              data-celebrating={
                dailyNudgePointFlash && selectedDailyNudgeAward?.active ? 'true' : 'false'
              }
              data-completed={selectedDailyNudgeRecord?.completed ? 'true' : 'false'}
              aria-label={dailyNudgeDisplayLabel}
            >
              <div className="daily-nudge-heading">
                <span aria-hidden="true">👉</span>
                <div>
                  <h2>{dailyNudgeDisplayLabel}</h2>
                  {selectedDailyNudgeRecord && (
                    <p>{selectedDailyNudgeRecord.category}</p>
                  )}
                </div>
                <p className="daily-nudge-streak">
                  {selectedDailyNudgeStreak > 0
                    ? `🔥 ${selectedDailyNudgeStreak}日連続`
                    : '今日からスタート'}
                </p>
              </div>
              {selectedDailyNudgeRecord ? (
                <>
                  <p className="daily-nudge-text">{selectedDailyNudgeRecord.text}</p>
                  <div className="daily-nudge-actions">
                    {selectedDailyNudgeRecord.completed ? (
                      <span className="daily-nudge-win-label">今日の勝ち！</span>
                    ) : (
                      <button
                        onClick={() => toggleDailyNudgeCompletion(selectedDateKey)}
                        type="button"
                      >
                        OK
                      </button>
                    )}
                    {dailyNudgePointFlash && selectedDailyNudgeAward?.active && (
                      <span className="daily-nudge-point-pop" key={dailyNudgePointFlash.id}>
                        +{dailyNudgePointFlash.points}PT
                      </span>
                    )}
                    {selectedDailyNudgeRecord.completed && (
                      <p className="daily-nudge-celebration">
                        {selectedDailyNudgeRecord.celebrationMessage ??
                          selectedDailyNudgeRecord.completionMessage}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="daily-nudge-empty">日替わりクエストは準備中です</p>
              )}
            </section>
          )}
          {page === 'today' && isToday && activeTimer && (
            <section
              className="timer-panel"
              data-complete={activeTimer.isComplete ? 'true' : 'false'}
              aria-label="実行中のタイマー"
            >
              {activeTimer.isComplete ? (
                <>
                  <p className="timer-finished">🎉 クエストタイム終了！</p>
                  <p className="timer-title">
                    {activeTimer.label} {formatTimerDuration(activeTimer.durationSeconds)}
                  </p>
                  <p className="timer-alert-note">
                    ナイス！1クエスト進んだ！
                  </p>
                  <div className="timer-actions">
                    <button onClick={completeActiveTimerItem} type="button">
                      完了にする
                    </button>
                    {notificationPermission === 'default' && (
                      <button onClick={requestNotificationPermission} type="button">
                        通知を許可
                      </button>
                    )}
                    <button onClick={extendFinishedTimerByFiveMinutes} type="button">
                      ＋5分
                    </button>
                    <button onClick={stopFinishedTimerAlert} type="button">
                      閉じる
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="timer-title">{activeTimer.label}</p>
                  <p className="timer-remaining">
                    残り {formatTimerSeconds(activeTimer.remainingSeconds)}
                  </p>
                  <div className="timer-actions">
                    {activeTimer.isRunning ? (
                      <button onClick={pauseActiveTimer} type="button">
                        ⏸ 一時停止
                      </button>
                    ) : (
                      <button onClick={resumeActiveTimer} type="button">
                        ▶ 再開
                      </button>
                    )}
                    <button onClick={resetActiveTimer} type="button">
                      ↺ リセット
                    </button>
                    <button onClick={closeActiveTimerPanel} type="button">
                      閉じる
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
          {(page === 'settings' || isEditMode) && (
            <div className="routine-context" data-quiet={page === 'today' ? 'true' : 'false'}>
              <p>
                {page === 'today' && isEditMode
                  ? '編集モード中'
                  : page === 'today'
                  ? `${selectedDateKey}だけの変更があります`
                  : `${getTargetLabel(editTarget)}を編集中`}
              </p>
              {page === 'settings' && (
                <p>テンプレート編集では、チェック記録はメイン画面に戻ると使えます。</p>
              )}
            </div>
          )}
          {canEditRoutines && gameMode === 'player' && (
            <div className="quest-slot-usage" aria-label="フリークエスト枠">
              <strong>フリークエスト枠</strong>
              <span>{usedQuestSlots} / {totalQuestSlotLimit} 使用中</span>
              <span>残り{remainingQuestSlots}枠</span>
            </div>
          )}
          {routineRenderSections.map((section) => {
            const isBonusSection = section.id === bonusSectionId;
            const isMilestoneSection =
              section.id === 'wake-milestone' || section.id === 'sleep-milestone';
            const canEditSection =
              !isMilestoneSection && (canEditRoutines || (page === 'today' && isBonusSection));
            const isPlayerLimitReached =
              !isBonusSection && isPlayerModeQuestLimitReached(displaySections);

            return (
            <section
              className="routine-section"
              data-bonus={isBonusSection ? 'true' : 'false'}
              data-milestone={isMilestoneSection ? 'true' : 'false'}
              data-milestone-kind={
                section.id === 'wake-milestone'
                  ? 'wake'
                  : section.id === 'sleep-milestone'
                  ? 'sleep'
                  : undefined
              }
              key={section.id}
            >
              <div className="section-header">
                <div>
                  <h2>
                    <span aria-hidden="true">
                      {section.id === 'wake-milestone'
                        ? '⏰'
                        : section.id === 'sleep-milestone'
                        ? '🛌'
                        : sectionIconLabels[section.id]}
                    </span>
                    {section.title}
                  </h2>
                  {isBonusSection && (
                    <p className="section-note">追加でやったこと</p>
                  )}
                </div>
                {canEditRoutines && !isMilestoneSection && (
                  <div className="section-actions">
                    <button
                      className="sort-button"
                      onClick={() => toggleSortingSection(section.id)}
                      type="button"
                    >
                      {sortingSectionId === section.id ? '完了' : '並び替え'}
                    </button>
                  </div>
              )}
              </div>
              <div className="routine-items">
                {getMixedRoutineEntries(section, {
                  includeCoreRoutines: page === 'today' && !isMilestoneSection && !isBonusSection,
                }).map((entry) => {
                  if (entry.kind === 'core') {
                    const coreRoutine = entry.coreRoutine;
                    const inputId = `core-routine-${coreRoutine.id}`;
                    const isCompleted =
                      selectedCoreRoutineCanComplete &&
                      selectedCoreRoutineCompletion[coreRoutine.id];
                    const canEditCoreRoutine =
                      canEditRoutines && dailySectionIds.includes(section.id as StartSection);
                    const coreRoutineLabel = coreRoutine.label.replace('今日', coreRoutineDateLabel);

                    return (
                      <div
                        className="routine-item core-routine-row"
                        data-checked={isCompleted ? 'true' : 'false'}
                        data-core-routine="true"
                        data-dragging={draggedItemId === entry.key ? 'true' : 'false'}
                        data-routine-id={entry.key}
                        data-section-id={section.id}
                        draggable={canEditCoreRoutine && sortingSectionId === section.id}
                        key={entry.key}
                        onClick={(event) => {
                          if ((event.target as HTMLElement).closest('select')) {
                            return;
                          }

                          focusDailyRecordField(coreRoutine.kind);
                        }}
                        onDragEnd={() => setDraggedItemId(null)}
                        onDragOver={(event) => {
                          if (canEditCoreRoutine && sortingSectionId === section.id) {
                            event.preventDefault();
                          }
                        }}
                        onDragStart={(event) => {
                          setDraggedItemId(entry.key);
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', entry.key);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const draggedId =
                            draggedItemId || event.dataTransfer.getData('text/plain');

                          if (sortingSectionId === section.id && draggedId) {
                            reorderMixedRoutineEntry(section.id, draggedId, entry.key);
                          }

                          setDraggedItemId(null);
                        }}
                      >
                        {canEditCoreRoutine && sortingSectionId === section.id && (
                          <span
                            className="drag-handle"
                            aria-hidden="true"
                            onPointerDown={(event) => {
                              setDraggedItemId(entry.key);
                              event.currentTarget.setPointerCapture(event.pointerId);
                            }}
                            onPointerMove={(event) => {
                              if (sortingSectionId !== section.id) {
                                return;
                              }

                              const targetElement = document.elementFromPoint(
                                event.clientX,
                                event.clientY,
                              );
                              const targetItem = targetElement?.closest<HTMLElement>(
                                `.routine-item[data-section-id="${section.id}"]`,
                              );
                              const targetItemId = targetItem?.dataset.routineId;

                              if (targetItemId && targetItemId !== entry.key) {
                                reorderMixedRoutineEntry(section.id, entry.key, targetItemId);
                              }
                            }}
                            onPointerUp={(event) => {
                              setDraggedItemId(null);

                              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                                event.currentTarget.releasePointerCapture(event.pointerId);
                              }
                            }}
                          >
                            ☰
                          </span>
                        )}
                        <label className="routine-check" htmlFor={inputId}>
                          <input
                            aria-label={`${coreRoutineLabel}の達成状態`}
                            checked={isCompleted}
                            id={inputId}
                            readOnly
                            tabIndex={-1}
                            type="checkbox"
                          />
                        </label>
                        <div className="routine-name core-routine-name">
                          <button
                            className="routine-name-button"
                            onClick={() => focusDailyRecordField(coreRoutine.kind)}
                            type="button"
                          >
                            <span aria-hidden="true">{coreRoutine.icon}</span>
                            {coreRoutineLabel}
                          </button>
                          <span className="core-routine-mini-badge">コアルーティン</span>
                        </div>
                        {canEditCoreRoutine && (
                          <label className="core-routine-section-select">
                            <span>場所</span>
                            <select
                              aria-label={`${coreRoutineLabel}の時間帯`}
                              onChange={(event) =>
                                moveCoreRoutineToSection(
                                  coreRoutine.id,
                                  event.target.value as StartSection,
                                )
                              }
                              value={coreRoutinePlacements[coreRoutine.id].sectionId}
                            >
                              {dailySectionIds.map((sectionId) => (
                                <option key={sectionId} value={sectionId}>
                                  {sectionId === 'morning'
                                    ? '朝'
                                    : sectionId === 'noon'
                                    ? '昼'
                                    : sectionId === 'evening'
                                    ? '夕'
                                    : '夜'}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    );
                  }

                  const item = entry.item;
                  const inputId = `routine-${item.id}`;
                  const isEditing = editingItemId === item.id;
                  const isFixedItem = fixedRoutineIds.has(item.id);
                  const canConfigureTimer =
                    !isFixedItem &&
                    (page === 'settings' || (page === 'today' && isToday && isEditMode));
                  const itemMasteryStats = masteryStatsByItemId.get(item.id);
                  const pausedTimer = pausedTimers[item.id];
                  const activeItemTimer =
                    activeTimer?.itemId === item.id ? activeTimer : null;
                  const itemTimerSeconds = getItemTimerSeconds(item);
                  const showTimerStart =
                    page === 'today' &&
                    isToday &&
                    !isEditMode &&
                    Boolean(itemTimerSeconds);
                  const itemNote = page === 'today' ? getItemNote(selectedDateKey, item.id) : '';
                  const isItemNoteOpen =
                    noteEditorTarget?.dateKey === selectedDateKey &&
                    noteEditorTarget.itemId === item.id;
                  const questEmote = questEmotes[getQuestEmoteKey(selectedDateKey, item.id)];

                  return (
                    <div
                      className="routine-item"
                      data-fixed={isFixedItem ? 'true' : 'false'}
                      data-checked={isCheckMode && checkedItems[item.id] ? 'true' : 'false'}
                      data-dragging={draggedItemId === item.id ? 'true' : 'false'}
                      data-routine-id={item.id}
                      data-section-id={section.id}
                      draggable={canEditRoutines && sortingSectionId === section.id && !isFixedItem}
                      onDragEnd={() => setDraggedItemId(null)}
                      onDragOver={(event) => {
                        if (canEditRoutines && sortingSectionId === section.id && !isFixedItem) {
                          event.preventDefault();
                        }
                      }}
                      onDragStart={(event) => {
                        if (isFixedItem) {
                          return;
                        }

                        setDraggedItemId(item.id);
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', item.id);
                      }}
                      onDrop={(event) => {
                        if (isFixedItem) {
                          return;
                        }

                        event.preventDefault();
                        const draggedId =
                          draggedItemId || event.dataTransfer.getData('text/plain');

                        if (sortingSectionId === section.id && draggedId) {
                          reorderMixedRoutineEntry(section.id, draggedId, item.id);
                        }

                        setDraggedItemId(null);
                      }}
                      key={item.id}
                    >
                      {canEditRoutines && sortingSectionId === section.id && !isFixedItem && (
                        <span
                          className="drag-handle"
                          aria-hidden="true"
                          onPointerDown={(event) => {
                            setDraggedItemId(item.id);
                            event.currentTarget.setPointerCapture(event.pointerId);
                          }}
                          onPointerMove={(event) => {
                            if (sortingSectionId !== section.id) {
                              return;
                            }

                            const targetElement = document.elementFromPoint(
                              event.clientX,
                              event.clientY,
                            );
                            const targetItem = targetElement?.closest<HTMLElement>(
                              `.routine-item[data-section-id="${section.id}"]`,
                            );
                            const targetItemId = targetItem?.dataset.routineId;

                            if (targetItemId && targetItemId !== item.id) {
                              reorderMixedRoutineEntry(section.id, item.id, targetItemId);
                            }
                          }}
                          onPointerUp={(event) => {
                            setDraggedItemId(null);

                            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                              event.currentTarget.releasePointerCapture(event.pointerId);
                            }
                          }}
                        >
                          ☰
                        </span>
                      )}
                      <label className="routine-check" htmlFor={inputId}>
                        <input
                          checked={isCheckMode && Boolean(checkedItems[item.id])}
                          disabled={!isCheckMode}
                          id={inputId}
                          onChange={() => toggleItem(item.id)}
                          type="checkbox"
                        />
                      </label>
                      <div className="routine-name">
                        {isEditing && !isFixedItem && canEditSection ? (
                          <input
                            autoFocus
                            onBlur={() => finishEditingItem(item, section.id)}
                            onChange={(event) => setEditingLabel(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.currentTarget.blur();
                              }

                              if (event.key === 'Escape') {
                                setEditingItemId(null);
                                setEditingLabel('');
                              }
                            }}
                            type="text"
                            value={editingLabel}
                          />
                        ) : isFixedItem ? (
                          <span className="fixed-routine-name">
                            <span>{item.label}</span>
                            {canEditRoutines ? (
                              <input
                                aria-label={`${item.label}の時刻`}
                                className="fixed-time-input"
                                onChange={(event) => updateFixedItemTime(item, event.target.value)}
                                type="time"
                                value={item.time}
                              />
                            ) : (
                              <span className="fixed-time-display">{item.time}</span>
                            )}
                          </span>
                        ) : (
                          <button
                            className="routine-name-button"
                            disabled={isFixedItem || !canEditSection}
                            onClick={() => {
                              if (!isFixedItem && canEditSection) {
                                startEditingItem(item);
                              }
                            }}
                            type="button"
                          >
                            {item.label}
                          </button>
                        )}
                      </div>
                      {page === 'today' &&
                        !isEditMode &&
                        !isBonusSection &&
                        itemMasteryStats &&
                        (itemMasteryStats.starCount > 0 || itemMasteryStats.trophyCount > 0) && (
                        <span
                          className="mastery-badge"
                          title={`現在 ${itemMasteryStats.currentStreak}日連続 / 累計 ${itemMasteryStats.totalCompletions}回`}
                        >
                          {formatMasteryStars(itemMasteryStats.starCount, itemMasteryStats.trophyCount)}
                        </span>
                      )}
                      {showTimerStart && (
                        <div className="timer-start-control">
                          <span>
                            {activeItemTimer && !activeItemTimer.isComplete
                              ? `⏱残り ${formatTimerSeconds(activeItemTimer.remainingSeconds)}`
                              : pausedTimer
                              ? `⏱残り ${formatTimerSeconds(pausedTimer.remainingSeconds)}`
                              : `⏱${formatTimerDuration(itemTimerSeconds ?? 0)}`}
                          </span>
                          <button
                            onClick={() => {
                              if (activeItemTimer?.isRunning) {
                                pauseActiveTimer();
                                return;
                              }

                              if (activeItemTimer && !activeItemTimer.isComplete) {
                                resumeActiveTimer();
                                return;
                              }

                              startItemTimer(item);
                            }}
                            type="button"
                          >
                            {activeItemTimer?.isRunning ? '⏸' : '▶'}
                          </button>
                        </div>
                      )}
                      {canConfigureTimer && (
                        <div className="timer-setting-control">
                          <button
                            aria-label={`${item.label}のタイマーを設定`}
                            className="timer-settings-toggle"
                            data-popup-ui="true"
                            onClick={() => toggleTimerSetting(item)}
                            type="button"
                          >
                            ⏱
                          </button>
                          {timerSettingItemId === item.id && (
                            renderTimerSettingMenu(section.id, item)
                          )}
                        </div>
                      )}
                      {page === 'today' && (
                        <button
                          aria-label={`${item.label}のメモ`}
                          className="item-note-toggle"
                          data-has-note={itemNote.trim() ? 'true' : 'false'}
                          data-popup-ui="true"
                          onClick={() => toggleItemNoteEditor(selectedDateKey, item.id)}
                          type="button"
                        >
                          {itemNote.trim() ? '📝✨' : '📝'}
                        </button>
                      )}
                      {page === 'today' && itemNote.trim() && (
                        <p className="item-note-preview">📝 {itemNote.trim()}</p>
                      )}
                      {questEmote && (
                        <div className="quest-emote" key={questEmote.id} role="status">
                          <span>{questEmote.message}</span>
                          {questEmote.points !== null && questEmote.points > 0 && (
                            <strong>+{questEmote.points}PT</strong>
                          )}
                          <i aria-hidden="true">✦</i>
                          <i aria-hidden="true">✧</i>
                          <i aria-hidden="true">✦</i>
                        </div>
                      )}
                      {!isFixedItem && canEditSection && (
                        <button
                          aria-label={`${item.label}を削除`}
                          className="delete-button"
                          onClick={() =>
                            setPendingDelete({
                              id: item.id,
                              label: item.label,
                              sectionId: section.id,
                            })
                          }
                          type="button"
                        >
                          削除
                        </button>
                      )}
                      {page === 'today' && isItemNoteOpen && (
                        <div className="item-note-editor" data-popup-ui="true">
                          <textarea
                            aria-label={`${item.label}のメモ`}
                            autoFocus
                            onChange={(event) =>
                              updateItemNote(selectedDateKey, item.id, event.target.value)
                            }
                            placeholder="ひとこと記録を残す"
                            rows={2}
                            value={itemNote}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {canEditSection && !isPlayerLimitReached && (
                <button
                  className="add-button section-add-button"
                  onClick={() => addRoutine(section.id)}
                  type="button"
                >
                  ＋追加
                </button>
              )}
              {canEditSection && isPlayerLimitReached && (
                <p className="quest-limit-note">ショップでフリークエスト枠を増やせます</p>
              )}
            </section>
            );
          })}
          {page === 'today' && !isEditMode && (
            <div className="quest-edit-action">
              <button
                className="edit-mode-button"
                onClick={openEditMode}
                type="button"
              >
                編集モード
              </button>
            </div>
          )}
        </div>
        )}

        {page === 'today' && !isEditMode && (
          <section className="daily-memo daily-record-card" aria-label="日付別記録">
            <div className="daily-record-field daily-record-field-one-line">
              <label htmlFor="daily-memo">
                📝 {dailyOneLineLabel}
              </label>
              <div className="daily-record-entry-list">
                {dailyMemo.map((entry, index) => {
                  const canSaveEntry = hasMeaningfulText(entry.text) && !entry.saved;

                  return (
                    <div className="daily-record-entry-row" key={`daily-memo-${index}`}>
                      <textarea
                        aria-label={`${dailyOneLineLabel} ${index + 1}`}
                        id={index === 0 ? 'daily-memo' : `daily-memo-${index}`}
                        onChange={(event) => {
                          adjustTextareaHeight(event.currentTarget);
                          updateDailyMemoForSelectedDate(index, event.target.value);
                        }}
                        placeholder="なんでも今日思ったこと、今の気持ちを書いてみよう"
                        ref={(element) => {
                          if (index === 0) {
                            dailyMemoTextareaRef.current = element;
                          }

                          adjustTextareaHeight(element);
                        }}
                        rows={1}
                        value={entry.text}
                      />
                      {!entry.saved && (
                        <button
                          aria-label={`${dailyOneLineLabel} ${index + 1}をOKにする`}
                          className="daily-record-save-button"
                          disabled={!canSaveEntry}
                          onClick={() => saveDailyMemoForSelectedDate(index)}
                          type="button"
                        >
                          OK
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="daily-one-line-example" aria-label="ひとことの例">
                <p>例えばこんなの</p>
                <blockquote>「{dailyOneLineExample.text}」</blockquote>
              </div>
            </div>
            <div className="daily-record-divider" aria-hidden="true" />
            <div className="daily-record-field daily-record-field-events">
              <label htmlFor="daily-events">
                📅 {dailyEventLabel}
              </label>
              <div className="daily-record-entry-list">
                {dailyEvent.map((entry, index) => {
                  const canSaveEntry = hasMeaningfulText(entry.text) && !entry.saved;

                  return (
                    <div className="daily-record-entry-row" key={`daily-events-${index}`}>
                      <textarea
                        aria-label={`${dailyEventLabel} ${index + 1}`}
                        id={index === 0 ? 'daily-events' : `daily-events-${index}`}
                        onChange={(event) => {
                          adjustTextareaHeight(event.currentTarget);
                          updateDailyEventForSelectedDate(index, event.target.value);
                        }}
                        placeholder={`${isToday ? '今日' : '昨日'}あったことを書いてみよう`}
                        ref={(element) => {
                          if (index === 0) {
                            dailyEventTextareaRef.current = element;
                          }

                          adjustTextareaHeight(element);
                        }}
                        rows={1}
                        value={entry.text}
                      />
                      {!entry.saved && (
                        <button
                          aria-label={`${dailyEventLabel} ${index + 1}をOKにする`}
                          className="daily-record-save-button"
                          disabled={!canSaveEntry}
                          onClick={() => saveDailyEventForSelectedDate(index)}
                          type="button"
                        >
                          OK
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="daily-one-line-example" aria-label="できごとの例">
                <p>例えばこんなの</p>
                <blockquote>「{dailyEventExample.text}」</blockquote>
              </div>
            </div>
          </section>
        )}

        {page === 'today' && !isEditMode && (
          <section className="daily-todo-card" aria-label={dailyTodoLabel}>
            <div className="daily-todo-header">
              <h2>☑️ {dailyTodoLabel}</h2>
              <span>
                {dailyTodoStats.completedCount} / {dailyTodoStats.totalCount}
              </span>
            </div>
            <div className="daily-todo-list">
              {dailyTodos.map((todo, index) => {
                const isFilledTodo = hasTodoText(todo);

                return (
                  <div
                    className="daily-todo-row"
                    data-completed={todo.completed ? 'true' : 'false'}
                    data-empty={!isFilledTodo ? 'true' : 'false'}
                    key={todo.id}
                  >
                    <input
                      aria-label={`${dailyTodoLabel} ${index + 1}を完了`}
                      checked={todo.completed}
                      disabled={!isFilledTodo}
                      onChange={(event) =>
                        toggleDailyTodoForSelectedDate(todo.id, event.target.checked)
                      }
                      type="checkbox"
                    />
                    <input
                      aria-label={`${dailyTodoLabel} ${index + 1}`}
                      onBlur={cleanupDailyTodoForSelectedDate}
                      onChange={(event) =>
                        updateDailyTodoForSelectedDate(todo.id, event.target.value)
                      }
                      onCompositionEnd={(event) =>
                        updateDailyTodoForSelectedDate(todo.id, event.currentTarget.value)
                      }
                      placeholder="やることをメモ"
                      type="text"
                      value={todo.text}
                    />
                    {isFilledTodo && (
                      <button
                        aria-label={`${dailyTodoLabel} ${index + 1}を削除`}
                        className="daily-todo-delete-button"
                        onClick={() => deleteDailyTodoForSelectedDate(todo.id)}
                        type="button"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {page === 'today' && !isEditMode && (
          <section className="daily-any-memo-card" aria-label={dailyAnyMemoLabel}>
            <div className="daily-any-memo-header">
              <h2>🗒️ {dailyAnyMemoLabel}</h2>
            </div>
            <textarea
              aria-label={dailyAnyMemoLabel}
              onChange={(event) => {
                adjustTextareaHeight(event.currentTarget);
                updateDailyAnyMemoForSelectedDate(event.target.value);
              }}
              placeholder="とりあえず、ここにメモ"
              ref={adjustTextareaHeight}
              rows={3}
              value={dailyAnyMemo}
            />
          </section>
        )}

        {page === 'schedule' && (
          <section
            className="schedule-page records-page record-view-content"
            aria-label={scheduleView === 'schedule' ? '月間スケジュール' : '月間やること'}
            key={scheduleView}
          >
            <div className="records-month-header">
              <button
                aria-label="前の月のスケジュールへ"
                onClick={() => moveScheduleMonth(-1)}
                type="button"
              >
                ‹
              </button>
              <h2>{scheduleMonthLabel}</h2>
              <button
                aria-label="次の月のスケジュールへ"
                onClick={() => moveScheduleMonth(1)}
                type="button"
              >
                ›
              </button>
              <button
                className="records-today-button"
                onClick={showScheduleToday}
                type="button"
              >
                今日へ
              </button>
            </div>
            <div className="records-day-list schedule-day-list">
              {scheduleMonthDates.map((scheduleDate) => {
                const dateKey = getDateKey(scheduleDate);
                const holidayName = getHolidayName(scheduleDate);
                const scheduleItems = loadDailySchedule(scheduleDate);
                const todoEntries = dateKey === selectedDateKey
                  ? dailyTodos
                  : dateKey === historySelectedDateKey
                    ? historyDailyTodos
                    : loadDailyTodos(scheduleDate);
                const filledTodos = todoEntries.filter(hasTodoText);
                const scheduleTodoStats = getDailyTodoStats(todoEntries);
                const hasSchedule = scheduleItems.length > 0;
                const hasTodos = filledTodos.length > 0;
                const contentCount = scheduleView === 'schedule'
                  ? scheduleItems.length
                  : filledTodos.length;
                const hasContent = contentCount > 0;
                const isSelectedTodoDate =
                  scheduleView === 'todos' &&
                  selectedScheduleDate !== null &&
                  getDateKey(selectedScheduleDate) === dateKey;
                const dateTitle = `${scheduleDate.getMonth() + 1}月${scheduleDate.getDate()}日（${
                  weekdayShortLabels[scheduleDate.getDay()]
                }${holidayName ? `・${holidayName}` : ''}）`;

                return (
                  <article
                    className="record-day-card schedule-day-card"
                    data-date-key={dateKey}
                    data-empty={!hasContent ? 'true' : 'false'}
                    data-today={dateKey === todayKey ? 'true' : 'false'}
                    key={dateKey}
                  >
                    <button
                      className="record-day-toggle"
                      onClick={() => setSelectedScheduleDate(scheduleDate)}
                      type="button"
                    >
                      <span className="record-day-date">
                        🗓️ {dateTitle}
                      </span>
                      <span className="record-day-meta">
                        {dateKey === todayKey && <strong>今日</strong>}
                        {scheduleView === 'schedule'
                          ? hasSchedule ? `${scheduleItems.length}件` : '予定なし'
                          : hasTodos
                            ? `${scheduleTodoStats.completedCount} / ${scheduleTodoStats.totalCount}`
                            : isSelectedTodoDate
                              ? '追加中'
                              : 'やることなし'}
                      </span>
                    </button>

                    {scheduleView === 'schedule' && hasSchedule && (
                      <div className="record-day-body schedule-day-body">
                        <div className="schedule-read-list">
                          {scheduleItems.map((scheduleItem) => (
                            <p key={scheduleItem.id}>
                              <time>{scheduleItem.time || '--:--'}</time>
                              <span>{scheduleItem.text.trim()}</span>
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                    {scheduleView === 'todos' && (hasTodos || isSelectedTodoDate) && (
                      <div className="record-day-body schedule-day-body schedule-todo-manager">
                        <div className="daily-todo-list">
                          {todoEntries.map((todo, index) => {
                            const isFilledTodo = hasTodoText(todo);

                            return (
                              <div
                                className="daily-todo-row record-todo-row"
                                data-completed={todo.completed ? 'true' : 'false'}
                                data-empty={!isFilledTodo ? 'true' : 'false'}
                                key={todo.id}
                              >
                                <input
                                  aria-label={`${dateTitle}のやること ${index + 1}を完了`}
                                  checked={todo.completed}
                                  disabled={!isFilledTodo}
                                  onChange={(event) =>
                                    toggleRecordTodo(scheduleDate, todo.id, event.target.checked)
                                  }
                                  type="checkbox"
                                />
                                <input
                                  aria-label={`${dateTitle}のやること ${index + 1}`}
                                  onBlur={() => cleanupRecordTodo(scheduleDate)}
                                  onChange={(event) =>
                                    updateRecordTodo(scheduleDate, todo.id, event.target.value)
                                  }
                                  onCompositionEnd={(event) =>
                                    updateRecordTodo(scheduleDate, todo.id, event.currentTarget.value)
                                  }
                                  placeholder="やることを追加"
                                  type="text"
                                  value={todo.text}
                                />
                                {isFilledTodo && (
                                  <button
                                    aria-label={`${dateTitle}のやること ${index + 1}を削除`}
                                    className="daily-todo-delete-button"
                                    onClick={() => deleteRecordTodo(scheduleDate, todo.id)}
                                    type="button"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            {selectedScheduleDate && scheduleView === 'schedule' && (() => {
              const scheduleDate = selectedScheduleDate;
              const dateKey = getDateKey(scheduleDate);
              const holidayName = getHolidayName(scheduleDate);
              const dateTitle = `${scheduleDate.getMonth() + 1}月${scheduleDate.getDate()}日（${
                weekdayShortLabels[scheduleDate.getDay()]
              }${holidayName ? `・${holidayName}` : ''}）`;
              const scheduleItems = loadDailySchedule(scheduleDate);
              const scheduleDraft = scheduleDrafts[dateKey] ?? { time: '', text: '' };

              return (
                <div
                  className="record-editor-backdrop"
                  role="presentation"
                  onClick={() => setSelectedScheduleDate(null)}
                >
                  <section
                    aria-label={`${dateTitle}のスケジュール編集`}
                    className="record-editor-panel schedule-editor-panel"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="record-editor-header">
                      <div>
                        <p>🗓️ スケジュールを編集</p>
                        <h2>{dateTitle}</h2>
                      </div>
                      <button
                        aria-label="スケジュール編集を閉じる"
                        onClick={() => setSelectedScheduleDate(null)}
                        type="button"
                      >
                        閉じる
                      </button>
                    </div>
                    <div className="record-field schedule-field">
                      <label>
                        🗓️ 予定
                        <span>{scheduleItems.length}件</span>
                      </label>
                      <div className="schedule-editor-list">
                        {scheduleItems.map((scheduleItem, index) => (
                          <div className="schedule-editor-row" key={scheduleItem.id}>
                            <input
                              aria-label={`${dateTitle}の予定 ${index + 1}の時間`}
                              onChange={(event) =>
                                updateScheduleItem(
                                  scheduleDate,
                                  scheduleItem,
                                  'time',
                                  event.target.value,
                                )
                              }
                              type="time"
                              value={scheduleItem.time}
                            />
                            <input
                              aria-label={`${dateTitle}の予定 ${index + 1}の内容`}
                              onChange={(event) =>
                                updateScheduleItem(
                                  scheduleDate,
                                  scheduleItem,
                                  'text',
                                  event.target.value,
                                )
                              }
                              placeholder="予定内容"
                              type="text"
                              value={scheduleItem.text}
                            />
                            <button
                              aria-label={`${dateTitle}の予定 ${index + 1}を削除`}
                              className="schedule-delete-button"
                              onClick={() => removeScheduleItem(scheduleDate, scheduleItem.id)}
                              type="button"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <div className="schedule-editor-row" data-new="true">
                          <input
                            aria-label={`${dateTitle}の新しい予定の時間`}
                            onChange={(event) =>
                              updateScheduleDraft(scheduleDate, 'time', event.target.value)
                            }
                            type="time"
                            value={scheduleDraft.time}
                          />
                          <input
                            aria-label={`${dateTitle}の新しい予定内容`}
                            onChange={(event) =>
                              updateScheduleDraft(scheduleDate, 'text', event.target.value)
                            }
                            placeholder="予定を追加"
                            type="text"
                            value={scheduleDraft.text}
                          />
                          <button
                            aria-label={`${dateTitle}へ予定を追加`}
                            className="schedule-new-mark"
                            disabled={!scheduleDraft.text.trim()}
                            onClick={() => commitScheduleDraft(scheduleDate, scheduleDraft)}
                            type="button"
                          >
                            ＋
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              );
            })()}
          </section>
        )}

        {page === 'records' && recordView !== 'achievements' && (
          <section
            className="records-page record-view-content"
            aria-label="月間記録"
            key={recordView}
          >
            <div className="records-month-header">
              <button
                aria-label="前の月の記録へ"
                onClick={() => moveRecordMonth(-1)}
                type="button"
              >
                ‹
              </button>
              <h2>{recordMonthLabel}</h2>
              <button
                aria-label="次の月の記録へ"
                onClick={() => moveRecordMonth(1)}
                type="button"
              >
                ›
              </button>
              <button
                className="records-today-button"
                onClick={showRecordToday}
                type="button"
              >
                今日へ
              </button>
            </div>
            <div className="records-day-list">
              {recordMonthDates.map((recordDate) => {
                const dateKey = getDateKey(recordDate);
                const holidayName = getHolidayName(recordDate);
                const memoEntries = dateKey === selectedDateKey
                  ? dailyMemo
                  : dateKey === historySelectedDateKey
                    ? historyDailyMemo
                    : loadDailyMemo(recordDate);
                const eventEntries = dateKey === selectedDateKey
                  ? dailyEvent
                  : dateKey === historySelectedDateKey
                    ? historyDailyEvent
                    : loadDailyEvent(recordDate);
                const anyMemoValue = dateKey === selectedDateKey
                  ? dailyAnyMemo
                  : dateKey === historySelectedDateKey
                    ? historyDailyAnyMemo
                    : loadDailyAnyMemo(recordDate);
                const savedMemoEntries = memoEntries.filter(
                  (entry) => entry.saved && hasMeaningfulText(entry.text),
                );
                const savedEventEntries = eventEntries.filter(
                  (entry) => entry.saved && hasMeaningfulText(entry.text),
                );
                const anyMemoText = anyMemoValue.trim();
                const recordContentCount =
                  recordView === 'memo'
                    ? savedMemoEntries.length
                    : recordView === 'events'
                      ? savedEventEntries.length
                      : anyMemoText.length > 0
                        ? 1
                        : 0;
                const hasRecordContent = recordContentCount > 0;
                const dateTitle = `${recordDate.getMonth() + 1}月${recordDate.getDate()}日（${
                  weekdayShortLabels[recordDate.getDay()]
                }${holidayName ? `・${holidayName}` : ''}）`;

                return (
                  <article
                    className="record-day-card"
                    data-date-key={dateKey}
                    data-empty={!hasRecordContent ? 'true' : 'false'}
                    data-today={dateKey === todayKey ? 'true' : 'false'}
                    key={dateKey}
                  >
                    <button
                      className="record-day-toggle"
                      onClick={() => setSelectedRecordDate(recordDate)}
                      type="button"
                    >
                      <span className="record-day-date">
                        📓 {dateTitle}
                      </span>
                      <span className="record-day-meta">
                        {dateKey === todayKey && <strong>今日</strong>}
                        {hasRecordContent ? `${recordContentCount}件` : '記録なし'}
                      </span>
                    </button>

                    {hasRecordContent && (
                      <div className="record-day-body">
                        {recordView === 'memo' && savedMemoEntries.length > 0 && (
                          <div className="record-read-section">
                            <h3>✍️ ひとこと</h3>
                            <div className="record-read-list">
                              {savedMemoEntries.map((entry, index) => (
                                <p key={`record-read-memo-${dateKey}-${index}`}>
                                  {entry.text.trim()}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                        {recordView === 'events' && savedEventEntries.length > 0 && (
                          <div className="record-read-section">
                            <h3>📅 できごと</h3>
                            <div className="record-read-list">
                              {savedEventEntries.map((entry, index) => (
                                <p key={`record-read-events-${dateKey}-${index}`}>
                                  {entry.text.trim()}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}
                        {recordView === 'anyMemo' && anyMemoText.length > 0 && (
                          <div className="record-read-section">
                            <h3>📝 なんでもメモ</h3>
                            <p>{anyMemoText}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            {selectedRecordDate && (() => {
              const recordDate = selectedRecordDate;
              const dateKey = getDateKey(recordDate);
              const holidayName = getHolidayName(recordDate);
              const dateTitle = `${recordDate.getMonth() + 1}月${recordDate.getDate()}日（${
                weekdayShortLabels[recordDate.getDay()]
              }${holidayName ? `・${holidayName}` : ''}）`;
              const memoEntries = dateKey === selectedDateKey
                ? dailyMemo
                : dateKey === historySelectedDateKey
                  ? historyDailyMemo
                  : loadDailyMemo(recordDate);
              const eventEntries = dateKey === selectedDateKey
                ? dailyEvent
                : dateKey === historySelectedDateKey
                  ? historyDailyEvent
                  : loadDailyEvent(recordDate);
              const anyMemoValue = dateKey === selectedDateKey
                ? dailyAnyMemo
                : dateKey === historySelectedDateKey
                  ? historyDailyAnyMemo
                  : loadDailyAnyMemo(recordDate);
              const editorViewOption = recordViewOptions.find((option) => option.key === recordView);
              const editorTitle =
                recordView === 'anyMemo'
                  ? 'なんでもメモ'
                  : editorViewOption?.label ?? '記録';
              const editorIcon = editorViewOption?.icon ?? '📓';

              return (
                <div
                  className="record-editor-backdrop"
                  role="presentation"
                  onClick={() => setSelectedRecordDate(null)}
                >
                  <section
                    aria-label={`${dateTitle}の記録編集`}
                    className="record-editor-panel"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="record-editor-header">
                      <div>
                        <p>{editorIcon} {editorTitle}を編集</p>
                        <h2>{dateTitle}</h2>
                      </div>
                      <button
                        aria-label="記録編集を閉じる"
                        onClick={() => setSelectedRecordDate(null)}
                        type="button"
                      >
                        閉じる
                      </button>
                    </div>
                    {recordView === 'memo' && (
                    <div className="record-field">
                      <label>✍️ 今日のひとこと</label>
                      <div className="record-entry-list">
                        {memoEntries.map((entry, index) => (
                          <textarea
                            aria-label={`${dateTitle}のひとこと ${index + 1}`}
                            key={`record-editor-memo-${dateKey}-${index}`}
                            onChange={(event) => {
                              adjustTextareaHeight(event.currentTarget);
                              updateRecordMemo(recordDate, index, event.target.value);
                            }}
                            placeholder="思ったことや今の気持ち"
                            ref={adjustTextareaHeight}
                            rows={1}
                            value={entry.text}
                          />
                        ))}
                      </div>
                    </div>
                    )}
                    {recordView === 'events' && (
                    <div className="record-field">
                      <label>📅 今日のできごと</label>
                      <div className="record-entry-list">
                        {eventEntries.map((entry, index) => (
                          <textarea
                            aria-label={`${dateTitle}のできごと ${index + 1}`}
                            key={`record-editor-events-${dateKey}-${index}`}
                            onChange={(event) => {
                              adjustTextareaHeight(event.currentTarget);
                              updateRecordEvent(recordDate, index, event.target.value);
                            }}
                            placeholder="その日にあったこと"
                            ref={adjustTextareaHeight}
                            rows={1}
                            value={entry.text}
                          />
                        ))}
                      </div>
                    </div>
                    )}
                    {recordView === 'anyMemo' && (
                    <div className="record-field record-any-memo-field">
                      <label>🗒️ なんでもメモ</label>
                      <textarea
                        aria-label={`${dateTitle}のなんでもメモ`}
                        onChange={(event) => {
                          adjustTextareaHeight(event.currentTarget);
                          updateRecordAnyMemo(recordDate, event.target.value);
                        }}
                        placeholder="とりあえず、ここにメモ"
                        ref={adjustTextareaHeight}
                        rows={2}
                        value={anyMemoValue}
                      />
                    </div>
                    )}
                  </section>
                </div>
              );
            })()}
          </section>
        )}

        {page === 'history' && (
          <section className="completion-calendar" aria-label="今月のスタンプ帳">
            <div className="completion-calendar-header">
              <div>
                <h2>今月のスタンプ帳</h2>
                <p>{calendarMonthLabel}</p>
              </div>
              <div className="month-actions">
                <button
                  onClick={() => setCalendarMonth((month) => addMonths(month, -1))}
                  type="button"
                >
                  前月
                </button>
                <button
                  disabled={
                    calendarMonth.getFullYear() === today.getFullYear() &&
                    calendarMonth.getMonth() === today.getMonth()
                  }
                  onClick={() => setCalendarMonth(getMonthStart(today))}
                  type="button"
                >
                  今月
                </button>
                <button
                  onClick={() => setCalendarMonth((month) => addMonths(month, 1))}
                  type="button"
                >
                  翌月
                </button>
              </div>
            </div>
            <div className="completion-calendar-grid">
              {weekdayOptions.map((weekday) => (
                <div className="calendar-weekday" key={weekday.key}>
                  {weekday.label}
                </div>
              ))}
              {completionCalendarDays.map((day, index) => {
                if (!day) {
                  return <div className="calendar-day-empty" key={`blank-${index}`} />;
                }

                return (
                  <button
                    aria-label={`${day.dateKey}のチェック表を表示`}
                    className="calendar-day"
                    data-rate-level={day.rankLevel}
                    data-routine-kind={day.routineKind}
                    data-selected={day.isSelected ? 'true' : 'false'}
                    data-today={day.isToday ? 'true' : 'false'}
                    key={day.dateKey}
                    onClick={() => {
                      setHistorySelectedDate((currentDate) =>
                        currentDate && getDateKey(currentDate) === day.dateKey ? null : day.date,
                      );
                      setIsHistoryEditMode(false);
                      setSortingSectionId(null);
                      setDraggedItemId(null);
                      setEditingItemId(null);
                      setEditingLabel('');
                    }}
                    type="button"
                  >
                    <span className="calendar-date-header">
                      <span className="calendar-day-number">{day.day}</span>
                      {day.routineKind === 'custom' && (
                        <span className="calendar-day-kind" aria-label="個別カスタム">
                          ✨
                        </span>
                      )}
                      <span className="calendar-day-rate">
                        {day.shouldShowStamp ? day.rankLabel : ''}
                      </span>
                    </span>
                    <span className="calendar-stamp-visual">
                      <span className="calendar-stamp-slot" aria-hidden="true" />
                      <span className="calendar-day-rank" aria-hidden="true">
                        {day.shouldShowStamp ? day.rankIcon : ''}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {historySelectedDate ? (
              <div className="history-detail">
                <div className="history-detail-heading">
                  <div>
                    <p className="history-date-label">📅 {historyDateLabel}</p>
                    <p className="history-routine-kind" data-routine-kind={historyRoutineKind}>
                      {historyRoutineKindLabel}
                    </p>
                  </div>
                  <div className="history-detail-actions">
                    <button
                      className="history-close-button"
                      onClick={() => {
                        setHistorySelectedDate(null);
                        setIsHistoryEditMode(false);
                        setSortingSectionId(null);
                        setDraggedItemId(null);
                        setEditingItemId(null);
                        setEditingLabel('');
                      }}
                      type="button"
                    >
                      閉じる
                    </button>
                    <button
                      className="edit-mode-button history-edit-button"
                      onClick={() => {
                        setIsHistoryEditMode((current) => !current);
                        setSortingSectionId(null);
                        setDraggedItemId(null);
                        setEditingItemId(null);
                        setEditingLabel('');
                      }}
                      type="button"
                    >
                      {isHistoryEditMode ? '編集を終了' : '編集モード'}
                    </button>
                  </div>
                </div>
                <section
                  className="result-panel"
                  data-rank-level={historyDateRank.level}
                  aria-label="選択日の達成率"
                >
                  {historyDateStats.rate === null ? (
                    <>
                      <p className="result-rank">ルーティン未設定</p>
                      <p className="result-rate">--</p>
                      <p className="result-count">0 / 0 完了</p>
                    </>
                  ) : (
                    <>
                      <p className="result-rank">
                        <span aria-hidden="true">{historyDateRank.icon}</span>
                        {historyDateRank.label}
                      </p>
                      <p className="result-rate">{historyDateStats.rate}%</p>
                      <p className="result-count">
                        {historyDateStats.completedCount} / {historyDateStats.totalCount} 完了
                      </p>
                    </>
                  )}
                </section>
                <section className="daily-memo history-record-card" aria-label="その日の記録">
                  <div className="daily-record-field daily-record-field-one-line">
                    <label htmlFor="history-daily-memo">
                      📝 その日のひとこと
                    </label>
                    <div className="daily-record-entry-list">
                      {historyDailyMemo.map((entry, index) => {
                        const canSaveEntry = hasMeaningfulText(entry.text) && !entry.saved;

                        return (
                          <div
                            className="daily-record-entry-row"
                            key={`history-daily-memo-${index}`}
                          >
                            <textarea
                              aria-label={`その日のひとこと ${index + 1}`}
                              id={index === 0 ? 'history-daily-memo' : `history-daily-memo-${index}`}
                              onChange={(event) => {
                                adjustTextareaHeight(event.currentTarget);
                                updateHistoryDailyMemo(index, event.target.value);
                              }}
                              placeholder="なんでも今日思ったこと、今の気持ちを書いてみよう"
                              ref={(element) => {
                                if (index === 0) {
                                  historyDailyMemoTextareaRef.current = element;
                                }

                                adjustTextareaHeight(element);
                              }}
                              rows={1}
                              value={entry.text}
                            />
                            {!entry.saved && (
                              <button
                                aria-label={`その日のひとこと ${index + 1}をOKにする`}
                                className="daily-record-save-button"
                                disabled={!canSaveEntry}
                                onClick={() => saveHistoryDailyMemo(index)}
                                type="button"
                              >
                                OK
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="daily-record-divider" aria-hidden="true" />
                  <div className="daily-record-field daily-record-field-events">
                    <label htmlFor="history-daily-events">
                      📅 その日のできごと
                    </label>
                    <div className="daily-record-entry-list">
                      {historyDailyEvent.map((entry, index) => {
                        const canSaveEntry = hasMeaningfulText(entry.text) && !entry.saved;

                        return (
                          <div
                            className="daily-record-entry-row"
                            key={`history-daily-events-${index}`}
                          >
                            <textarea
                              aria-label={`その日のできごと ${index + 1}`}
                              id={
                                index === 0
                                  ? 'history-daily-events'
                                  : `history-daily-events-${index}`
                              }
                              onChange={(event) => {
                                adjustTextareaHeight(event.currentTarget);
                                updateHistoryDailyEvent(index, event.target.value);
                              }}
                              placeholder="その日にあったことを書いてみよう"
                              ref={(element) => {
                                if (index === 0) {
                                  historyDailyEventTextareaRef.current = element;
                                }

                                adjustTextareaHeight(element);
                              }}
                              rows={1}
                              value={entry.text}
                            />
                            {!entry.saved && (
                              <button
                                aria-label={`その日のできごと ${index + 1}をOKにする`}
                                className="daily-record-save-button"
                                disabled={!canSaveEntry}
                                onClick={() => saveHistoryDailyEvent(index)}
                                type="button"
                              >
                                OK
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>
                <section className="daily-todo-card history-todo-card" aria-label="その日のやること">
                  <div className="daily-todo-header">
                    <h2>☑️ その日のやること</h2>
                    <span>
                      {historyDailyTodoStats.completedCount} / {historyDailyTodoStats.totalCount}
                    </span>
                  </div>
                  <div className="daily-todo-list">
                    {historyDailyTodos.map((todo, index) => {
                      const isFilledTodo = hasTodoText(todo);

                      return (
                        <div
                          className="daily-todo-row"
                          data-completed={todo.completed ? 'true' : 'false'}
                          data-empty={!isFilledTodo ? 'true' : 'false'}
                          key={todo.id}
                        >
                          <input
                            aria-label={`その日のやること ${index + 1}を完了`}
                            checked={todo.completed}
                            disabled={!isFilledTodo}
                            onChange={(event) =>
                              toggleHistoryDailyTodo(todo.id, event.target.checked)
                            }
                            type="checkbox"
                          />
                          <input
                            aria-label={`その日のやること ${index + 1}`}
                            onBlur={cleanupHistoryDailyTodo}
                            onChange={(event) =>
                              updateHistoryDailyTodo(todo.id, event.target.value)
                            }
                            onCompositionEnd={(event) =>
                              updateHistoryDailyTodo(todo.id, event.currentTarget.value)
                            }
                            placeholder="やることをメモ"
                            type="text"
                            value={todo.text}
                          />
                          {isFilledTodo && (
                            <button
                              aria-label={`その日のやること ${index + 1}を削除`}
                              className="daily-todo-delete-button"
                              onClick={() => deleteHistoryDailyTodo(todo.id)}
                              type="button"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
                <section className="daily-any-memo-card history-any-memo-card" aria-label="なんでもメモ">
                  <div className="daily-any-memo-header">
                    <h2>🗒️ なんでもメモ</h2>
                  </div>
                  <textarea
                    aria-label="なんでもメモ"
                    onChange={(event) => {
                      adjustTextareaHeight(event.currentTarget);
                      updateHistoryDailyAnyMemo(event.target.value);
                    }}
                    placeholder="とりあえず、ここにメモ"
                    ref={adjustTextareaHeight}
                    rows={3}
                    value={historyDailyAnyMemo}
                  />
                </section>
                <div className="history-routine-list">
                  {historyDisplaySections.map((section) => {
                    const isBonusSection = section.id === bonusSectionId;
                    const isPlayerLimitReached =
                      !isBonusSection && isPlayerModeQuestLimitReached(historyDisplaySections);

                    return (
                    <section
                      className="history-routine-section"
                      data-bonus={isBonusSection ? 'true' : 'false'}
                      key={section.id}
                    >
                    <div className="history-section-header">
                      <div>
                        <h3>
                          <span aria-hidden="true">{sectionIconLabels[section.id]}</span>
                          {section.title}
                        </h3>
                        {isBonusSection && (
                          <p className="section-note">ボーナスログ</p>
                        )}
                      </div>
                      {isHistoryEditMode && (
                        <button
                          className="sort-button"
                          onClick={() => toggleSortingSection(section.id)}
                          type="button"
                        >
                          {sortingSectionId === section.id ? '完了' : '並び替え'}
                        </button>
                      )}
                    </div>
                    <div className="history-routine-items">
                      {getMixedRoutineEntries(section, {
                        includeCoreRoutines: !isBonusSection,
                      }).map((entry) => {
                        if (entry.kind === 'core') {
                          const coreRoutine = entry.coreRoutine;
                          const inputId = `history-core-routine-${coreRoutine.id}`;
                          const isCompleted =
                            historyCoreRoutineCanComplete &&
                            historyCoreRoutineCompletion[coreRoutine.id];

                          return (
                            <div
                              className="history-routine-item core-routine-row"
                              data-checked={isCompleted ? 'true' : 'false'}
                              data-core-routine="true"
                              key={entry.key}
                              onClick={() => focusDailyRecordField(coreRoutine.kind, 'history')}
                            >
                              <input
                                aria-label={`${coreRoutine.label.replace('今日', 'その日')}の達成状態`}
                                checked={isCompleted}
                                id={inputId}
                                readOnly
                                tabIndex={-1}
                                type="checkbox"
                              />
                              <span className="history-routine-name core-routine-name">
                                <button
                                  className="history-routine-name-button"
                                  onClick={() => focusDailyRecordField(coreRoutine.kind, 'history')}
                                  type="button"
                                >
                                  <span aria-hidden="true">{coreRoutine.icon}</span>
                                  {coreRoutine.label.replace('今日', 'その日')}
                                </button>
                                <span className="core-routine-mini-badge">コアルーティン</span>
                              </span>
                            </div>
                          );
                        }

                        const item = entry.item;
                        const isEditing = editingItemId === item.id;
                        const isFixedItem = fixedRoutineIds.has(item.id);
                        const historyItemTimerSeconds = getItemTimerSeconds(item);
                        const historyItemNote = getItemNote(historySelectedDateKey, item.id);
                        const isHistoryItemNoteOpen =
                          noteEditorTarget?.dateKey === historySelectedDateKey &&
                          noteEditorTarget.itemId === item.id;
                        const historyQuestEmote =
                          questEmotes[getQuestEmoteKey(historySelectedDateKey, item.id)];

                        return (
                        <div
                          className="history-routine-item"
                          data-checked={historyCheckedItems[item.id] ? 'true' : 'false'}
                          data-dragging={draggedItemId === item.id ? 'true' : 'false'}
                          data-routine-id={item.id}
                          data-section-id={section.id}
                          draggable={
                            isHistoryEditMode &&
                            sortingSectionId === section.id &&
                            !isFixedItem
                          }
                          key={item.id}
                          onDragEnd={() => setDraggedItemId(null)}
                          onDragOver={(event) => {
                            if (
                              isHistoryEditMode &&
                              sortingSectionId === section.id &&
                              !isFixedItem
                            ) {
                              event.preventDefault();
                            }
                          }}
                          onDragStart={(event) => {
                            if (isFixedItem) {
                              return;
                            }

                            setDraggedItemId(item.id);
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', item.id);
                          }}
                          onDrop={(event) => {
                            if (isFixedItem) {
                              return;
                            }

                            event.preventDefault();
                            const draggedId =
                              draggedItemId || event.dataTransfer.getData('text/plain');

                            if (sortingSectionId === section.id && draggedId) {
                              reorderMixedRoutineEntry(section.id, draggedId, item.id);
                            }

                            setDraggedItemId(null);
                          }}
                        >
                          {isHistoryEditMode && sortingSectionId === section.id && !isFixedItem && (
                            <span className="drag-handle" aria-hidden="true">
                              ☰
                            </span>
                          )}
                          <input
                            aria-label={`${item.label}のチェック状態`}
                            checked={Boolean(historyCheckedItems[item.id])}
                            onChange={() => toggleHistoryItem(item.id)}
                            type="checkbox"
                          />
                          <span className="history-routine-name">
                            {isEditing && !isFixedItem && isHistoryEditMode ? (
                              <input
                                autoFocus
                                onBlur={() => finishEditingItem(item, section.id)}
                                onChange={(event) => setEditingLabel(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.currentTarget.blur();
                                  }

                                  if (event.key === 'Escape') {
                                    setEditingItemId(null);
                                    setEditingLabel('');
                                  }
                                }}
                                type="text"
                                value={editingLabel}
                              />
                            ) : (
                              <button
                                className="history-routine-name-button"
                                disabled={isFixedItem || !isHistoryEditMode}
                                onClick={() => {
                                  if (!isFixedItem && isHistoryEditMode) {
                                    startEditingItem(item);
                                  }
                                }}
                                type="button"
                              >
                                {item.label}
                              </button>
                            )}
                            {item.time && (
                              <span className="fixed-time-display">{item.time}</span>
                            )}
                          </span>
                          {historyItemTimerSeconds && !isHistoryEditMode && (
                            <span className="timer-badge">
                              ⏱{formatTimerDuration(historyItemTimerSeconds)}
                            </span>
                          )}
                          {isHistoryEditMode && (
                            <div className="timer-setting-control">
                              <button
                                aria-label={`${item.label}のタイマーを設定`}
                                className="timer-settings-toggle"
                                data-popup-ui="true"
                                onClick={() => toggleTimerSetting(item)}
                                type="button"
                              >
                                ⏱
                              </button>
                              {timerSettingItemId === item.id && (
                                renderTimerSettingMenu(section.id, item)
                              )}
                            </div>
                          )}
                          <button
                            aria-label={`${item.label}のメモ`}
                            className="item-note-toggle"
                            data-has-note={historyItemNote.trim() ? 'true' : 'false'}
                            data-popup-ui="true"
                            onClick={() => toggleItemNoteEditor(historySelectedDateKey, item.id)}
                            type="button"
                          >
                            {historyItemNote.trim() ? '📝✨' : '📝'}
                          </button>
                          {historyItemNote.trim() && (
                            <p className="item-note-preview">📝 {historyItemNote.trim()}</p>
                          )}
                          {historyQuestEmote && (
                            <div
                              className="quest-emote history-quest-emote"
                              key={historyQuestEmote.id}
                              role="status"
                            >
                              <span>{historyQuestEmote.message}</span>
                              {historyQuestEmote.points !== null &&
                                historyQuestEmote.points > 0 && (
                                <strong>+{historyQuestEmote.points}PT</strong>
                              )}
                              <i aria-hidden="true">✦</i>
                              <i aria-hidden="true">✧</i>
                              <i aria-hidden="true">✦</i>
                            </div>
                          )}
                          {!isFixedItem && isHistoryEditMode && (
                            <button
                              aria-label={`${item.label}を削除`}
                              className="delete-button"
                              onClick={() =>
                                setPendingDelete({
                                  id: item.id,
                                  label: item.label,
                                  sectionId: section.id,
                                })
                              }
                              type="button"
                            >
                              削除
                            </button>
                          )}
                          {isHistoryItemNoteOpen && (
                            <div className="item-note-editor" data-popup-ui="true">
                              <textarea
                                aria-label={`${item.label}のメモ`}
                                autoFocus
                                onChange={(event) =>
                                  updateItemNote(
                                    historySelectedDateKey,
                                    item.id,
                                    event.target.value,
                                  )
                                }
                                placeholder="ひとこと記録を残す"
                                rows={2}
                                value={historyItemNote}
                              />
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                    {isHistoryEditMode && !isPlayerLimitReached && (
                      <button
                        className="add-button section-add-button"
                        onClick={() => addRoutine(section.id)}
                        type="button"
                      >
                        ＋追加
                      </button>
                    )}
                    {isHistoryEditMode && isPlayerLimitReached && (
                      <p className="quest-limit-note">ショップでフリークエスト枠を増やせます</p>
                    )}
                    </section>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="history-empty-guide">
                日付をタップすると、その日のクエストを確認できます。
              </p>
            )}
          </section>
        )}

        {page === 'records' && recordView === 'achievements' && (
          <section className="achievements-panel record-view-content" key={recordView}>
            <div className="achievements-header">
              <span aria-hidden="true">🏆</span>
              <div>
                <h2>実績</h2>
                <p>星とトロフィーは、日々のチェックで自然に育ちます。</p>
              </div>
            </div>
            <section className="player-growth-panel" aria-label="プレイヤー成長">
              <div className="player-growth-rank">
                <span aria-hidden="true">🏅</span>
                <div>
                  <h3>Rank {playerRankProgress.rank}</h3>
                  <p>
                    {playerRankProgress.nextRank
                      ? `次のランクまであと${playerRankProgress.starsUntilNextRank}★`
                      : '現在の最高ランクです'}
                  </p>
                </div>
              </div>
              <dl className="player-growth-stats">
                <div>
                  <dt>所持PT</dt>
                  <dd>{playerEconomy.currentPoints}</dd>
                </div>
                <div>
                  <dt>累計獲得PT</dt>
                  <dd>{playerEconomy.lifetimeEarnedPoints}</dd>
                </div>
                <div>
                  <dt>累計獲得スター</dt>
                  <dd>{playerEconomy.lifetimeStarsEarned}</dd>
                </div>
                <div>
                  <dt>PT倍率</dt>
                  <dd>×{playerRankProgress.multiplier.toFixed(2)}</dd>
                </div>
              </dl>
            </section>
            {masteryStats.length === 0 ? (
              <p className="empty-achievements">
                まずは今日のルーティンをチェックすると、ここに実績が育っていきます。
              </p>
            ) : (
              <div className="mastery-list">
                {masteryStats.map((itemStats) => (
                  <article
                    className="mastery-card"
                    data-current={itemStats.isCurrentItem ? 'true' : 'false'}
                    data-hall-of-fame={itemStats.isHallOfFame ? 'true' : 'false'}
                    key={itemStats.itemId}
                  >
                    <div className="mastery-card-title">
                      <div>
                        <p className="mastery-section-name">
                          {sectionIconLabels[itemStats.sectionId]} {itemStats.sectionTitle}
                        </p>
                        <h3>{itemStats.label}</h3>
                      </div>
                      {itemStats.isHallOfFame && (
                        <span className="hall-of-fame-badge">
                          {formatMasteryStars(0, itemStats.trophyCount)}
                        </span>
                      )}
                    </div>
                    <p
                      className="mastery-stars"
                      data-empty={
                        itemStats.starCount === 0 && itemStats.trophyCount === 0
                          ? 'true'
                          : 'false'
                      }
                    >
                      {formatMasteryStars(itemStats.starCount, itemStats.trophyCount) || '星はこれから'}
                    </p>
                    <dl className="mastery-metrics">
                      <div>
                        <dt>現在連続</dt>
                        <dd>{itemStats.currentStreak}日</dd>
                      </div>
                      <div>
                        <dt>最高連続</dt>
                        <dd>{itemStats.bestStreak}日</dd>
                      </div>
                      <div>
                        <dt>累計達成</dt>
                        <dd>{itemStats.totalCompletions}回</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            )}
            <section className="archive-panel" aria-label="過去のアイテム">
              <div className="archive-header">
                <div>
                  <h3>過去のアイテム</h3>
                  <p>削除したアイテムはここに残り、あとから復元できます。</p>
                </div>
                <span>{archivedItemEntries.length}件</span>
              </div>
              {archivedItemEntries.length === 0 ? (
                <p className="archive-empty">アーカイブ済みアイテムはありません。</p>
              ) : (
                <div className="archive-list">
                  {archivedItemEntries.map(({ archivedItem, stats }) => (
                    <article className="archive-card" key={archivedItem.item.id}>
                      <div>
                        <p className="mastery-section-name">
                          {sectionIconLabels[archivedItem.sectionId]} {archivedItem.sectionTitle}
                        </p>
                        <h4>{archivedItem.item.label}</h4>
                        <p className="archive-date">
                          削除日: {questDateFormatter.format(new Date(archivedItem.archivedAt))}
                        </p>
                      </div>
                      <p
                        className="mastery-stars"
                        data-empty={
                          stats.starCount === 0 && stats.trophyCount === 0
                            ? 'true'
                            : 'false'
                        }
                      >
                        {formatMasteryStars(stats.starCount, stats.trophyCount) || '星はこれから'}
                      </p>
                      <dl className="mastery-metrics">
                        <div>
                          <dt>累計</dt>
                          <dd>{stats.totalCompletions}回</dd>
                        </div>
                        <div>
                          <dt>最高</dt>
                          <dd>{stats.bestStreak}日連続</dd>
                        </div>
                        <div>
                          <dt>現在</dt>
                          <dd>{stats.currentStreak}日連続</dd>
                        </div>
                      </dl>
                      <button
                        className="restore-button"
                        onClick={() => restoreArchivedItem(archivedItem.item.id)}
                        type="button"
                      >
                        復元
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        )}

        {page === 'shop' && (
          <section className="shop-panel">
            <div className="shop-header">
              <div>
                <span aria-hidden="true">🛍️</span>
                <div>
                  <h2>ショップ</h2>
                  <p>貯めたPTを、hibitinを広げる力に変えます。</p>
                </div>
              </div>
              <strong>所持PT：{playerEconomy.currentPoints}PT</strong>
            </div>

            <div className="shop-category-list">
              {([
                'questSlot',
                'feature',
                'customize',
                'item',
                'gacha',
              ] as ShopCategory[]).map((category) => {
                const categoryItems = shopItems.filter((item) => item.category === category);
                const isQuestSlotCategory = category === 'questSlot';

                return (
                  <section className="shop-category-card" key={category}>
                    <div className="shop-category-header">
                      <h3>{shopCategoryLabels[category]}</h3>
                      {!isQuestSlotCategory && <span>準備中</span>}
                    </div>
                    {isQuestSlotCategory ? (
                      <div className="point-exchange-list">
                        {categoryItems.map((item) => {
                          const exchangeRule = gameBalance.questSlotExchange;
                          const currentSlots = getEffectiveQuestSlotLimit(playerUnlocks, gameBalance);
                          const nextSlots = Math.min(currentSlots + 1, exchangeRule.maxTotalSlots);
                          const isMaxUnlocked = currentSlots >= exchangeRule.maxTotalSlots;
                          const isPointEnough = playerEconomy.currentPoints >= item.price;
                          const shortagePoints = Math.max(0, item.price - playerEconomy.currentPoints);
                          const isExchangeDisabled =
                            gameMode !== 'player' ||
                            !item.enabled ||
                            isMaxUnlocked ||
                            !isPointEnough;

                          return (
                            <article className="point-exchange-card" key={item.id}>
                              <div>
                                <h4>{item.label}</h4>
                                <p>価格：{item.price}PT</p>
                                <p>
                                  現在：{currentSlots}枠
                                  {isMaxUnlocked
                                    ? ' / 最大まで解放済み'
                                    : ` / 交換後：${nextSlots}枠`}
                                </p>
                              </div>
                              <div className="point-exchange-action">
                                <button
                                  disabled={isExchangeDisabled}
                                  onClick={exchangeQuestSlot}
                                  type="button"
                                >
                                  交換する
                                </button>
                                {gameMode !== 'player' ? (
                                  <span>プレイヤーモードで交換できます</span>
                                ) : !item.enabled ? (
                                  <span>現在は販売停止中</span>
                                ) : isMaxUnlocked ? (
                                  <span>最大まで解放済み</span>
                                ) : !isPointEnough ? (
                                  <span>あと{shortagePoints}PT必要</span>
                                ) : (
                                  <span>交換できます</span>
                                )}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="shop-coming-soon">
                        このカテゴリの商品はこれから追加予定です。
                      </p>
                    )}
                  </section>
                );
              })}
            </div>
            {exchangeToast && (
              <p className="exchange-toast" role="status">
                {exchangeToast.message}
              </p>
            )}
          </section>
        )}

        {(page === 'settings' || (page === 'today' && isEditMode)) && (
          <div
            className="main-actions"
            data-editing={page === 'settings' || (page === 'today' && isEditMode) ? 'true' : 'false'}
          >
            <button
              className="default-template-button"
              onClick={() => saveDisplayedRoutineAsTemplate('normal')}
              type="button"
            >
              編集内容をノーマルルーティンにコピー
            </button>
            <button
              className="default-template-button"
              onClick={() => saveDisplayedRoutineAsTemplate('holiday')}
              type="button"
            >
              編集内容を休日ルーティンにコピー
            </button>
            {page === 'today' && (
              <button
                className="end-edit-button"
                onClick={closeEditMode}
                type="button"
              >
                編集を終了
              </button>
            )}
          </div>
        )}

        {page === 'settings' && (
          <details className="data-management">
            <summary>データ管理</summary>
            <div className="data-management-content">
              <p>ルーティン、チェック履歴、設定をJSONファイルで保存・復元します。</p>
              <div className="backup-actions">
                <button onClick={exportBackup} type="button">
                  バックアップを書き出す
                </button>
                <button onClick={() => backupInputRef.current?.click()} type="button">
                  バックアップを読み込む
                </button>
                <input
                  accept="application/json,.json"
                  aria-label="バックアップファイルを選択"
                  hidden
                  onChange={importBackup}
                  ref={backupInputRef}
                  type="file"
                />
              </div>
              {backupMessage && <p className="backup-message">{backupMessage}</p>}
              {backupDownload && (
                <a
                  className="backup-download-link"
                  download={backupDownload.fileName}
                  href={backupDownload.url}
                >
                  バックアップファイルを保存
                </a>
              )}
              <p className="backup-warning">
                読み込み時は、現在この端末に保存されているhibitinデータを上書きします。
              </p>
              <div className="reset-actions">
                <button
                  className="reset-initial-button"
                  onClick={resetToInitialState}
                  type="button"
                >
                  初回状態にリセット
                </button>
                <p>
                  開発中に初期ルーティンを確認するための操作です。hibitin以外の保存データは削除しません。
                </p>
              </div>
            </div>
          </details>
        )}

      </div>

      {page === 'schedule' && (
        <nav
          className="record-subtab-nav schedule-subtab-nav"
          aria-label="スケジュールの表示切り替え"
        >
          {scheduleViewOptions.map((option) => (
            <button
              aria-current={scheduleView === option.key ? 'page' : undefined}
              className="record-subtab-item schedule-subtab-item"
              data-active={scheduleView === option.key ? 'true' : 'false'}
              key={option.key}
              onClick={() => selectScheduleView(option.key)}
              type="button"
            >
              <span aria-hidden="true">{option.icon}</span>
              {option.label}
            </button>
          ))}
        </nav>
      )}

      {page === 'records' && (
        <nav
          className="record-subtab-nav"
          aria-label="記録の表示切り替え"
        >
          {recordViewOptions.map((option) => (
            <button
              aria-current={recordView === option.key ? 'page' : undefined}
              className="record-subtab-item"
              data-active={recordView === option.key ? 'true' : 'false'}
              key={option.key}
              onClick={() => selectRecordView(option.key)}
              type="button"
            >
              <span aria-hidden="true">{option.icon}</span>
              {option.label}
            </button>
          ))}
        </nav>
      )}

      <nav
        className="bottom-tab-nav"
        aria-label="メインナビゲーション"
      >
        {mainPageOptions.map((option) => (
          <button
            aria-current={page === option.key ? 'page' : undefined}
            className="bottom-tab-item"
            data-active={page === option.key ? 'true' : 'false'}
            key={option.key}
            onClick={() => changePage(option.key)}
            type="button"
          >
            <span aria-hidden="true">{option.icon}</span>
            {option.label}
          </button>
        ))}
      </nav>

      {activeTimer?.isComplete && (
        <div className="timer-finished-backdrop" role="presentation">
          <div className="timer-finished-sparkles" aria-hidden="true">
            <span>✨</span>
            <span>🎉</span>
            <span>✨</span>
          </div>
          <section
            aria-labelledby="timer-finished-title"
            aria-modal="true"
            className="timer-finished-modal"
            role="dialog"
          >
            <p className="timer-finished-kicker">⏱ タイマー終了</p>
            <h2 id="timer-finished-title">🎉 クエストタイム終了！</h2>
            <p className="timer-finished-routine">
              {activeTimer.label} {formatTimerDuration(activeTimer.durationSeconds)}
            </p>
            <p className="timer-finished-message">ナイス！1クエスト進んだ！</p>
            <div className="timer-finished-actions">
              <button onClick={completeActiveTimerItem} type="button">
                完了にする
              </button>
              <button onClick={extendFinishedTimerByFiveMinutes} type="button">
                ＋5分
              </button>
              <button onClick={stopFinishedTimerAlert} type="button">
                閉じる
              </button>
            </div>
            {notificationPermission === 'default' && (
              <button
                className="timer-permission-button"
                onClick={requestNotificationPermission}
                type="button"
              >
                ブラウザ通知を許可
              </button>
            )}
          </section>
        </div>
      )}

      {pendingDelete && (
        <div className="dialog-backdrop" role="presentation">
          <div
            aria-labelledby="delete-dialog-title"
            aria-modal="true"
            className="delete-dialog"
            role="dialog"
          >
            <h2 id="delete-dialog-title">アーカイブしますか？</h2>
            <p>「{pendingDelete.label}」を画面から外し、過去のアイテムに保存します。</p>
            <div className="dialog-actions">
              <button onClick={deleteRoutine} type="button">
                アーカイブする
              </button>
              <button onClick={() => setPendingDelete(null)} type="button">
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;

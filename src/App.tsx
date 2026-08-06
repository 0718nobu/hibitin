import {
  ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type TouchEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { User } from '@supabase/supabase-js';
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
import {
  isSupabaseConfigured,
  supabase,
  supabasePublishableKey,
  supabaseUrl,
} from './lib/supabase';

type RoutineSource = 'default' | 'user' | 'ai';
type TemplateKind = 'normal' | 'holiday';
type GameMode = 'player' | 'developer';
type PageName = 'today' | 'history' | 'todos' | 'schedule' | 'library';
type MenuViewName =
  | 'list'
  | 'schedule'
  | 'todos'
  | 'timer'
  | 'recordMemo'
  | 'recordEvents'
  | 'recordAnyMemo'
  | 'recordAdvanced'
  | 'achievements'
  | 'status'
  | 'shop'
  | 'settings';
type ScheduleViewName = 'list' | 'agenda' | 'today' | 'year';
type RecordViewName = 'memo' | 'events' | 'anyMemo' | 'advanced' | 'achievements';
type RecordDisplayMode = 'all' | 'withRecords';
type TodoStatus = 'today' | 'tomorrow' | 'soon' | 'someday' | 'completed';
type ActiveTodoStatus = Exclude<TodoStatus, 'completed'>;
type TodoViewName = 'todo' | 'today' | 'date' | 'folders' | 'completed';
const INITIAL_SCHEDULE_VIEW: ScheduleViewName = 'list';
const INITIAL_TODO_VIEW: TodoViewName = 'todo';
type TodoReviewAction = Exclude<TodoStatus, 'completed'> | 'completed' | 'delete';
type AuthMode = 'login' | 'signup';
type SupabaseConnectionStatus = 'unconfigured' | 'checking' | 'connected' | 'failed';
type CloudBackupStatus = 'idle' | 'saving' | 'success' | 'pending' | 'failed';
type DailyQuestMasterStatus = 'idle' | 'loading' | 'success' | 'cache' | 'failed';
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

type CloudBackupInfo = {
  updatedAt: string;
  dataCount: number;
  backupVersion: number;
};

type CloudBackupRow = {
  backup_data: unknown;
  backup_version: number | null;
  data_count: number | null;
  updated_at: string | null;
};

type CloudBackupLookupResult =
  | { status: 'found'; info: CloudBackupInfo }
  | { status: 'missing' }
  | { status: 'failed' };

const getAuthErrorMessage = (message: string) => {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('invalid login credentials')) {
    return 'パスワードが違うか、アカウントが存在しません。';
  }

  if (normalizedMessage.includes('email') || normalizedMessage.includes('invalid')) {
    return 'メールアドレスを確認してください。';
  }

  if (normalizedMessage.includes('password')) {
    return 'パスワードを確認してください。';
  }

  if (normalizedMessage.includes('network') || normalizedMessage.includes('fetch')) {
    return '通信できませんでした。しばらくしてから再度お試しください。';
  }

  return 'しばらくしてから再度お試しください。';
};

const supabaseConnectionLabels: Record<SupabaseConnectionStatus, string> = {
  unconfigured: '未設定',
  checking: '確認中',
  connected: '接続成功',
  failed: '接続失敗',
};

const cloudBackupStatusLabels: Record<CloudBackupStatus, string> = {
  idle: '未保存',
  saving: '同期中…',
  success: '保存済み',
  pending: 'オフライン（同期待ち）',
  failed: '保存失敗',
};

const dailyQuestMasterStatusLabels: Record<DailyQuestMasterStatus, string> = {
  idle: '未取得',
  loading: '取得中…',
  success: '共通候補を使用中',
  cache: 'キャッシュを使用中',
  failed: '取得失敗',
};

const recordViewOptions: { key: RecordViewName; icon: string; label: string }[] = [
  { key: 'memo', icon: '✍️', label: 'ひとこと' },
  { key: 'events', icon: '📅', label: 'できごと' },
  { key: 'anyMemo', icon: '📝', label: 'メモ' },
  { key: 'advanced', icon: '⚙️', label: 'アドバンスト' },
  { key: 'achievements', icon: '🏆', label: '実績' },
];

const todoStatusOptions: { key: TodoStatus; icon: string; label: string; title: string }[] = [
  { key: 'today', icon: '☑️', label: '今日', title: '今日のやること' },
  { key: 'tomorrow', icon: '🌤️', label: '明日', title: '明日のやること' },
  { key: 'soon', icon: '🏃', label: '早め', title: '早めにやること' },
  { key: 'someday', icon: '🧺', label: 'いずれ', title: 'いずれやること' },
  { key: 'completed', icon: '✅', label: '完了', title: 'やり終えたこと' },
];

const activeTodoStatusOptions = todoStatusOptions.filter(
  (option): option is { key: ActiveTodoStatus; icon: string; label: string; title: string } =>
    option.key !== 'completed',
);

const todoStatusHeadings: Record<TodoStatus, string> = {
  today: '今日のやること',
  tomorrow: '明日のやること',
  soon: '早めにやること',
  someday: 'いずれやること',
  completed: 'やり終えたこと',
};

const mainPageOptions: { key: PageName; icon: string; label: string }[] = [
  { key: 'today', icon: '🎮', label: '今日' },
  { key: 'history', icon: '📒', label: 'スタンプ帳' },
  { key: 'todos', icon: '✅', label: 'やること' },
  { key: 'schedule', icon: '📅', label: 'スケジュール' },
  { key: 'library', icon: '🎒', label: 'かばん' },
];

const menuViewOptions: {
  key: Exclude<MenuViewName, 'list'>;
  icon: string;
  label: string;
  description: string;
}[] = [
  { key: 'schedule', icon: '📅', label: 'スケジュール', description: '予定を確認・追加する' },
  { key: 'todos', icon: '✅', label: 'やること', description: '今日や今後のタスクを整理する' },
  { key: 'timer', icon: '⏱', label: 'タイマー', description: '時間を決めて集中する' },
  { key: 'recordMemo', icon: '✍️', label: 'ひとこと', description: '月ごとのひとことを振り返る' },
  { key: 'recordEvents', icon: '📖', label: 'できごと', description: 'その日にあったことを読む' },
  { key: 'recordAnyMemo', icon: '📝', label: 'メモ', description: '思いついたことをすぐ書く' },
  { key: 'recordAdvanced', icon: '⚙️', label: 'アドバンスト', description: '追加記録を日付ごとに見る' },
  { key: 'achievements', icon: '🏆', label: '実績', description: '育った記録とスターを見る' },
  { key: 'status', icon: '🏅', label: 'ステータス', description: 'PTやフリークエストを確認する' },
  { key: 'shop', icon: '🎁', label: 'ショップ', description: '追加機能や枠を確認する' },
  { key: 'settings', icon: '⚙️', label: '設定', description: 'アプリの設定を変更する' },
];

const libraryCategories: {
  key: 'tools' | 'log' | 'player' | 'system';
  icon: string;
  title: string;
  items: Exclude<MenuViewName, 'list'>[];
}[] = [
  { key: 'tools', icon: '🧰', title: 'アイテム', items: ['timer'] },
  { key: 'log', icon: '📝', title: 'ログ', items: ['recordMemo', 'recordEvents', 'recordAnyMemo', 'recordAdvanced'] },
  { key: 'player', icon: '👤', title: 'プレイヤー', items: ['achievements', 'status'] },
  { key: 'system', icon: '⚙️', title: 'システム', items: ['shop', 'settings'] },
];

const libraryRecordViewMap: Partial<Record<MenuViewName, RecordViewName>> = {
  recordMemo: 'memo',
  recordEvents: 'events',
  recordAnyMemo: 'anyMemo',
  recordAdvanced: 'advanced',
  achievements: 'achievements',
};

type RoutineItem = {
  id: string;
  label: string;
  order: number;
  source: RoutineSource;
  createdAt: string;
  fixedKind?: FixedQuestKind;
  routineNumber?: number;
  retiredAt?: string;
  time?: string;
  timerMinutes?: number;
  timerSeconds?: number;
};

type FixedQuestKind = 'wake' | 'sleep' | 'scheduleCheck' | 'todoCheck';

type RoutineSection = {
  id: string;
  title: string;
  order: number;
  items: RoutineItem[];
};

type RoutineDrafts = Record<string, string>;

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

type PlayerIconId =
  | 'smile'
  | 'cool'
  | 'chick'
  | 'cat'
  | 'dog'
  | 'fox'
  | 'bear'
  | 'sprout'
  | 'robot'
  | 'alien'
  | 'wizard'
  | 'ninja'
  | 'hero';

type PlayerIconOption = {
  id: PlayerIconId;
  emoji: string;
  label: string;
};

type PlayerProfile = {
  displayName: string;
  iconId: PlayerIconId;
  oneLineProfile: string;
  favoriteThings: string;
  currentGoal: string;
};

type BadgeCategory = 'quest' | 'streak' | 'record' | 'cloud';

type BadgeDefinition = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: BadgeCategory;
};

type PlayerBadgeState = {
  earned: Record<string, string>;
  favoriteBadgeIds: string[];
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
  retiredAt?: string;
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

type AutoBackupRecord = BackupFile & {
  autoBackupVersion: 1;
  id: string;
  createdAt: string;
  dataCount: number;
  contentHash: string;
};

type ItemNotes = Record<string, Record<string, string>>;

type DailyNudgeCandidate = {
  id: string;
  masterId?: string;
  text: string;
  completionMessage: string;
  category: string;
  enabled: boolean;
  order: number;
  createdAt: string;
  updatedAt?: string;
};

type DailyQuestMasterRow = {
  id: string;
  slug: string;
  prompt: string;
  completion_message: string | null;
  category: string | null;
  is_active: boolean | null;
  sort_order: number | null;
  created_at: string | null;
  updated_at: string | null;
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

type ChoiceQuestOption = {
  id: string;
  label: string;
  icon: string;
};

type ChoiceQuestRecord = {
  selectedOptionId?: string;
  completed: boolean;
  selectedAt?: string;
  completedAt?: string;
};

type ChoiceQuestRecords = Record<string, ChoiceQuestRecord>;

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
  questKind: 'fixed' | 'core';
  routineNumber?: number;
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
const AUTO_BACKUP_VERSION = 1;
const AUTO_BACKUP_DB_NAME = 'hibitin:autoBackups';
const AUTO_BACKUP_STORE_NAME = 'autoBackups';
const AUTO_BACKUP_DELAY_MS = 30000;
const AUTO_BACKUP_MAX_GENERATIONS = 10;
const CLOUD_AUTO_BACKUP_DELAY_MS = 8000;
const LEGACY_ROUTINES_STORAGE_KEY = 'hibitin-routines:v1';
const TEMPLATES_STORAGE_KEY = 'hibitin:templates:v1';
const DATE_SNAPSHOTS_STORAGE_KEY = 'hibitin:dateSnapshots:v1';
const DATE_OVERRIDES_STORAGE_KEY = 'hibitin:dateOverrides:v1';
const ARCHIVED_ITEMS_STORAGE_KEY = 'hibitin:archivedItems:v1';
const TIMER_STATE_STORAGE_KEY = 'hibitin:timerState:v1';
const ITEM_NOTES_STORAGE_KEY = 'hibitin:itemNotes:v1';
const CORE_ROUTINE_PLACEMENTS_STORAGE_KEY = 'hibitin:coreRoutinePlacements:v1';
const DAILY_QUEST_MASTER_CACHE_STORAGE_KEY = 'hibitin:dailyQuestMasterCache:v1';
const DAILY_NUDGE_RECORDS_STORAGE_KEY = 'hibitin:dailyNudgeRecords:v1';
const NIGHTLY_NUDGE_RECORDS_STORAGE_KEY = 'hibitin:nightlyNudgeRecords:v1';
const CHOICE_QUEST_RECORDS_STORAGE_KEY = 'hibitin:choiceQuestRecords:v1';
const LEGACY_RHYTHM_SETTINGS_STORAGE_KEY = 'hibitin:lifestyleSettings:v1';
const RHYTHM_SETTINGS_STORAGE_KEY = 'hibitin:rhythmSettings:v1';
const GAME_MODE_STORAGE_KEY = 'hibitin:gameMode:v1';
const GAME_BALANCE_STORAGE_KEY = 'hibitin:gameBalance:v1';
const PLAYER_ECONOMY_STORAGE_KEY = 'hibitin:playerEconomy:v1';
const PLAYER_PROFILE_STORAGE_KEY = 'hibitin:playerProfile:v1';
const PLAYER_BADGES_STORAGE_KEY = 'hibitin:playerBadges:v1';
const PLAYER_UNLOCKS_STORAGE_KEY = 'hibitin:playerUnlocks:v2';
const LEGACY_PLAYER_UNLOCKS_STORAGE_KEY = 'hibitin:playerUnlocks:v1';
const TODO_ITEMS_STORAGE_KEY = 'hibitin:todos:v2';
const TODO_FOLDERS_STORAGE_KEY = 'hibitin:todoFolders:v1';
const TODO_ROLLOVER_STORAGE_KEY = 'hibitin:todos:lastRolloverDate:v1';
const RECORD_DISPLAY_MODE_STORAGE_KEY = 'hibitin:recordDisplayMode:v1';
const ANY_MEMO_ITEMS_STORAGE_KEY = 'hibitin:anyMemoItems:v1';
const ANY_MEMO_FOLDERS_STORAGE_KEY = 'hibitin:anyMemoFolders:v1';
const ANY_MEMO_FOLDER_ITEMS_STORAGE_KEY = 'hibitin:anyMemoFolderItems:v1';

const isHibitinStorageKey = (key: string) =>
  key.startsWith('hibitin:') || key.startsWith('hibitin-');

const isAllowedBackupStorageKey = (key: string) =>
  isHibitinStorageKey(key) &&
  !/supabase|auth|password|secret|service_role|vite_/i.test(key);

const isDailyTextStorageKey = (key: string) =>
  /^hibitin:(memo|events|anyMemo):\d{4}-\d{2}-\d{2}$/.test(key);

const isRawStringStorageKey = (key: string) =>
  isDailyTextStorageKey(key) || key === TODO_ROLLOVER_STORAGE_KEY;

const serializeRestoredStorageValue = (key: string, value: unknown) => {
  if (isRawStringStorageKey(key) && typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
};

const collectHibitinStorage = () => {
  const storage: Record<string, unknown> = {};
  const hibitinKeys = Array.from({ length: window.localStorage.length }, (_, index) =>
    window.localStorage.key(index),
  )
    .filter((key): key is string => key !== null && isHibitinStorageKey(key))
    .sort();

  hibitinKeys.forEach((key) => {
    const savedValue = window.localStorage.getItem(key);

    if (savedValue !== null) {
      if (isRawStringStorageKey(key)) {
        storage[key] = savedValue;
        return;
      }

      try {
        storage[key] = JSON.parse(savedValue) as unknown;
      } catch {
        storage[key] = savedValue;
      }
    }
  });

  return storage;
};

const createBackupFromCurrentStorage = (): BackupFile => ({
  backupVersion: BACKUP_VERSION,
  exportedAt: new Date().toISOString(),
  appName: 'hibitin',
  data: {
    storage: collectHibitinStorage(),
  },
});

const getBackupContentHash = (backup: BackupFile) => {
  const content = JSON.stringify(backup.data.storage);
  let hash = 0;

  for (let index = 0; index < content.length; index += 1) {
    hash = Math.imul(31, hash) + content.charCodeAt(index);
    hash |= 0;
  }

  return `${content.length}:${(hash >>> 0).toString(36)}`;
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
    Object.keys(storage).every(isAllowedBackupStorageKey) &&
    requiredKeys.every(
      (key) =>
        key in storage &&
        storage[key] !== null &&
        typeof storage[key] === 'object' &&
        !Array.isArray(storage[key]),
    )
  );
};

const isAutoBackupRecord = (value: unknown): value is AutoBackupRecord => {
  if (!isBackupFile(value)) {
    return false;
  }

  const record = value as Partial<AutoBackupRecord>;

  return (
    record.autoBackupVersion === AUTO_BACKUP_VERSION &&
    typeof record.id === 'string' &&
    record.id.trim().length > 0 &&
    typeof record.createdAt === 'string' &&
    !Number.isNaN(Date.parse(record.createdAt)) &&
    typeof record.dataCount === 'number' &&
    Number.isFinite(record.dataCount) &&
    typeof record.contentHash === 'string'
  );
};

const openAutoBackupDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported.'));
      return;
    }

    const request = window.indexedDB.open(AUTO_BACKUP_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(AUTO_BACKUP_STORE_NAME)) {
        db.createObjectStore(AUTO_BACKUP_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed.'));
  });

const runAutoBackupStore = async <Result,>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<Result>,
) => {
  const db = await openAutoBackupDb();

  try {
    return await new Promise<Result>((resolve, reject) => {
      const transaction = db.transaction(AUTO_BACKUP_STORE_NAME, mode);
      const store = transaction.objectStore(AUTO_BACKUP_STORE_NAME);
      const request = action(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    });
  } finally {
    db.close();
  }
};

const loadAutoBackupRecords = async () => {
  const records = await runAutoBackupStore<unknown[]>('readonly', (store) => store.getAll());

  return records
    .filter(isAutoBackupRecord)
    .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));
};

const putAutoBackupRecord = (record: AutoBackupRecord) =>
  runAutoBackupStore<IDBValidKey>('readwrite', (store) => store.put(record));

const deleteAutoBackupRecord = (id: string) =>
  runAutoBackupStore<undefined>('readwrite', (store) => store.delete(id));

const createAutoBackupRecord = (backup: BackupFile): AutoBackupRecord => {
  const createdAt = new Date().toISOString();

  return {
    ...backup,
    autoBackupVersion: AUTO_BACKUP_VERSION,
    id: `auto-backup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    exportedAt: createdAt,
    dataCount: Object.keys(backup.data.storage).length,
    contentHash: getBackupContentHash(backup),
  };
};

const getClosestAutoBackupId = (
  records: AutoBackupRecord[],
  targetTime: number,
) =>
  records.reduce<AutoBackupRecord | null>((closestRecord, record) => {
    if (!closestRecord) {
      return record;
    }

    return Math.abs(Date.parse(record.createdAt) - targetTime) <
      Math.abs(Date.parse(closestRecord.createdAt) - targetTime)
      ? record
      : closestRecord;
  }, null)?.id;

const getAutoBackupIdsToKeep = (records: AutoBackupRecord[]) => {
  const sortedRecords = [...records].sort(
    (first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt),
  );
  const keepIds = new Set<string>();
  const now = Date.now();
  const targetOffsets = [
    0,
    24 * 60 * 60 * 1000,
    3 * 24 * 60 * 60 * 1000,
    7 * 24 * 60 * 60 * 1000,
  ];

  targetOffsets.forEach((offset) => {
    const keepId = getClosestAutoBackupId(sortedRecords, now - offset);

    if (keepId) {
      keepIds.add(keepId);
    }
  });

  sortedRecords.forEach((record) => {
    if (keepIds.size < AUTO_BACKUP_MAX_GENERATIONS) {
      keepIds.add(record.id);
    }
  });

  return keepIds;
};

const pruneAutoBackupRecords = async () => {
  const records = await loadAutoBackupRecords();

  if (records.length <= AUTO_BACKUP_MAX_GENERATIONS) {
    return records;
  }

  const keepIds = getAutoBackupIdsToKeep(records);
  const deletingRecords = records.filter((record) => !keepIds.has(record.id));

  await Promise.all(deletingRecords.map((record) => deleteAutoBackupRecord(record.id)));

  return loadAutoBackupRecords();
};

const saveAutoBackupFromCurrentStorage = async (
  options: {
    force?: boolean;
  } = {},
) => {
  const backup = createBackupFromCurrentStorage();
  const contentHash = getBackupContentHash(backup);
  const records = await loadAutoBackupRecords();
  const latestRecord = records[0];

  if (!options.force && latestRecord?.contentHash === contentHash) {
    return {
      created: false,
      records,
    };
  }

  const record = createAutoBackupRecord(backup);

  await putAutoBackupRecord(record);

  return {
    created: true,
    records: await pruneAutoBackupRecords(),
  };
};

type RhythmConfig = {
  wakeTime: string;
  sleepTime: string;
  startSection: StartSection;
  fixedQuestPlacements?: Partial<Record<'wake' | 'sleep', {
    sectionId: StartSection;
    order: number;
  }>>;
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

const fixedRoutineIds = new Set([
  'morning-wake-up',
  'fixed-schedule-check',
  'fixed-todo-check',
  'night-sleep',
]);

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
const COMMON_TIMER_ITEM_ID = 'hibitin:common-timer';

const dailyMessages = [
  '🌱 今日も、ゆるく一歩。',
  '☕ 焦らなくて大丈夫。',
  '🍃 自分のペースでいこう。',
  '📖 今日という一頁を。',
  '🌞 今日はどんな一日にしよう。',
  '🌸 完璧じゃなくて大丈夫。',
  '🍀 ゆるっと、はじめよう。',
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

const defaultDailyNudgeCompletionMessage = 'ログインクエスト完了。今日も一歩。';
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
  ['daily-nudge-water-sip', '水を一口飲もう', '一口補給完了。体が少し助かった。', '休息'],
  ['daily-nudge-stretch-10', '10秒だけ背伸びしよう', '背伸び完了。少し空気が入れ替わった。', '健康'],
  ['daily-nudge-breath', '深呼吸をひとつしよう', '深呼吸完了。いま、ここに戻れた。', '休息'],
  ['daily-nudge-breath-one', '深呼吸を一回しよう', '深呼吸一回完了。ちゃんと整えた。', '休息'],
  ['daily-nudge-shoulder', '肩を3回まわそう', '肩まわし完了。こわばりを少し解除。', '健康'],
  ['daily-nudge-shoulder-drop', '肩の力を抜こう', '力みリセット完了。少し軽くなった。', '休息'],
  ['daily-nudge-step', '立ち上がって一歩歩こう', '一歩完了。ちゃんと動き出した。', '行動開始'],
  ['daily-nudge-stand-up', '立ち上がろう', '立ち上がり完了。もう始まってる。', '行動開始'],
  ['daily-nudge-three-seconds', '3秒だけ始めよう', '3秒着手完了。入口に立てた。', '行動開始'],
  ['daily-nudge-one-time', 'まず1回だけやろう', '1回完了。小さく突破した。', '行動開始'],
  ['daily-nudge-far-look', '遠くを10秒眺めよう', '視界リセット完了。目にも休憩を。', '休息'],
  ['daily-nudge-look-sky', '空を見よう', '空チェック完了。少し視界が広がった。', '休息'],
  ['daily-nudge-close-eyes', '目を閉じて5秒休もう', '5秒休憩完了。小さく回復。', '休息'],
  ['daily-nudge-desk-one', '机の上を一つだけ片付けよう', '一つ片付いた。場が少し軽くなった。', '行動開始'],
  ['daily-nudge-posture', '背筋を伸ばそう', '姿勢リセット完了。ちょっといい感じ。', '健康'],
  ['daily-nudge-thanks-self', '自分にありがとうと言おう', '自分へのありがとう完了。ナイス存在。', '感謝'],
  ['daily-nudge-say-thanks', 'ありがとうを一回言おう', 'ありがとう完了。小さなあたたかさを渡せた。', '感謝'],
  ['daily-nudge-greeting', 'あいさつを一回しよう', 'あいさつ完了。今日の扉を少し開けた。', '感謝'],
  ['daily-nudge-window', '窓の外をちらっと見よう', '外の世界を確認。視点が少し広がった。', '休息'],
  ['daily-nudge-smile', '口角を少しだけ上げてみよう', '表情ミニ調整完了。気分に小さなバフ。', '遊び'],
  ['daily-nudge-smile-once', '笑顔を一回つくろう', '笑顔一回完了。表情に小さな灯り。', '感謝'],
  ['daily-nudge-hands', '手をぎゅっと握って開こう', '手のリセット完了。操作感が戻った。', '健康'],
  ['daily-nudge-hand-warm', '手のひらを温めよう', '手のひら回復。少し落ち着いた。', '休息'],
  ['daily-nudge-neck', '首をゆっくり一回まわそう', '首まわし完了。こりを少しほどいた。', '健康'],
  ['daily-nudge-foot', '足を一回伸ばそう', '足のばし完了。体に小さな余白。', '健康'],
  ['daily-nudge-open-door', 'ドアか窓を少し開けよう', '空気入れ替え完了。場が少し変わった。', '休息'],
  ['daily-nudge-put-one-away', '目の前の物を一つ戻そう', '一つ戻した。周りが少し整った。', '行動開始'],
  ['daily-nudge-touch-tool', '使う物を一つ手に取ろう', '道具を持った。始める準備クリア。', '行動開始'],
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
const retiredDailyNudgeCandidateIds = new Set([
  'daily-nudge-done-one',
  'daily-nudge-like-one',
  'daily-nudge-survive',
  'daily-nudge-one-word',
  'daily-nudge-kind',
  'daily-nudge-tiny-start',
]);

const defaultNightlyNudgeCompletionMessage = 'おやすみクエスト完了。今日もここまで。';
const nightlyNudgeCelebrationMessages = [
  '今日もここまで。お疲れさま。',
  '一日をやさしく閉じられたね。',
  '今日の終わりに、小さな安心を置けた。',
  'よくここまで来た。今日はもう十分。',
  'おやすみ前の一区切り、完了。',
  '明日の自分へ、やさしいバトン。',
  '今日もちゃんと終われた。',
  '静かに一日をしまえたね。',
  'お疲れさま。ここからは休む時間。',
  '今日をやさしく閉じました。',
];
const defaultNightlyNudgeCandidates: DailyNudgeCandidate[] = [
  ['nightly-nudge-good-work', '今日もお疲れって言ってみよう', '今日もお疲れさま。ちゃんと届いた。', 'ねぎらい'],
  ['nightly-nudge-thanks-feet', 'ありがとうと言いながら足を撫でよう', '足にもありがとう。今日も支えてくれた。', '休息'],
  ['nightly-nudge-shoulder', '肩を軽く回そう', '肩まわし完了。少し力が抜けた。', 'からだ'],
  ['nightly-nudge-breath-three', '深呼吸を3回しよう', '深呼吸3回。夜の空気に戻れた。', '休息'],
  ['nightly-nudge-fun-one', '今日楽しかったことを一つ思い出そう', '楽しかったことをひとつ回収できた。', '記憶'],
  ['nightly-nudge-kind-self', '今日もよく頑張ったねと言ってあげよう', '自分へのねぎらい完了。よく頑張った。', 'ねぎらい'],
  ['nightly-nudge-window', '窓の外を眺めてみよう', '外を少し眺めた。夜に目が慣れた。', '休息'],
  ['nightly-nudge-happy-one', '今日一番嬉しかったことを思い出そう', '嬉しかったことをひとつ持って眠れる。', '記憶'],
  ['nightly-nudge-eyes', '目を閉じて30秒休もう', '30秒休憩完了。もう休んでいい。', '休息'],
  ['nightly-nudge-bed', '布団へ入ってみよう', '布団へ到着。今日の冒険はここまで。', 'おやすみ'],
].map(([id, text, completionMessage, category], index) => ({
  id,
  text,
  completionMessage,
  category,
  enabled: true,
  order: (index + 1) * 10,
  createdAt: '2026-08-07T00:00:00.000Z',
}));

const choiceQuestOptions: ChoiceQuestOption[] = [
  { id: 'walk', label: '散歩', icon: '🚶' },
  { id: 'stretch', label: 'ストレッチ', icon: '🤸' },
  { id: 'meditation', label: '瞑想', icon: '🧘' },
];

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
    items: [],
  },
  {
    id: 'evening',
    title: '夕',
    order: 30,
    items: [],
  },
  {
    id: 'night',
    title: '夜',
    order: 40,
    items: [],
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

const backupDateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
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

const areObjectsEqual = (firstValue: unknown, secondValue: unknown) =>
  JSON.stringify(firstValue) === JSON.stringify(secondValue);

const removeFixedRoutineItems = (sections: RoutineSection[]) =>
  sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => !fixedRoutineIds.has(item.id)),
  }));

const isCoreRoutineSectionId = (sectionId: string): sectionId is StartSection =>
  dailySectionIds.includes(sectionId as StartSection);

const isNumberedCoreRoutineItem = (sectionId: string, item: RoutineItem) =>
  isCoreRoutineSectionId(sectionId) && !item.fixedKind;

const formatRoutineNumber = (routineNumber?: number) => {
  if (!Number.isFinite(routineNumber) || !routineNumber || routineNumber < 1) {
    return '';
  }

  const roundedNumber = Math.floor(routineNumber);
  const circledNumbers = [
    '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩',
    '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳',
  ];

  return circledNumbers[roundedNumber - 1] ?? `${roundedNumber}.`;
};

const getCoreRoutineDisplayLabel = (
  item: RoutineItem,
  options: { showRoutineNumber?: boolean } = {},
) => {
  const numberLabel = options.showRoutineNumber === false
    ? ''
    : formatRoutineNumber(item.routineNumber);

  return numberLabel ? `${numberLabel} ${item.label}` : item.label;
};

const normalizeRoutineNumber = (value: unknown) => {
  const numericValue = Number(value);

  return Number.isFinite(numericValue) && numericValue > 0
    ? Math.floor(numericValue)
    : undefined;
};

const migrateRoutineNumbers = (
  settings: RoutineTemplateSettings,
  dateOverrides: Record<string, RoutineSection[]>,
  dateSnapshots: Record<string, RoutineSection[]>,
  archivedItems: Record<string, ArchivedItem>,
) => {
  const routineNumberById = new Map<string, number>();
  let maxRoutineNumber = 0;
  const registerExistingNumber = (sectionId: string, item: RoutineItem) => {
    if (!isNumberedCoreRoutineItem(sectionId, item)) {
      return;
    }

    const routineNumber = normalizeRoutineNumber(item.routineNumber);

    if (!routineNumber) {
      return;
    }

    const existingNumber = routineNumberById.get(item.id);
    const nextNumber = existingNumber ? Math.min(existingNumber, routineNumber) : routineNumber;

    routineNumberById.set(item.id, nextNumber);
    maxRoutineNumber = Math.max(maxRoutineNumber, nextNumber);
  };
  const visitSections = (
    sections: RoutineSection[],
    visitor: (sectionId: string, item: RoutineItem) => void,
  ) => {
    sections.forEach((section) => {
      section.items.forEach((item) => visitor(section.id, item));
    });
  };

  Object.values(settings.templates).forEach((sections) => visitSections(sections, registerExistingNumber));
  Object.keys(dateOverrides).sort().forEach((dateKey) =>
    visitSections(dateOverrides[dateKey], registerExistingNumber),
  );
  Object.keys(dateSnapshots).sort().forEach((dateKey) =>
    visitSections(dateSnapshots[dateKey], registerExistingNumber),
  );
  Object.values(archivedItems).forEach((archivedItem) =>
    registerExistingNumber(archivedItem.sectionId, archivedItem.item),
  );

  let nextRoutineNumber = maxRoutineNumber + 1;
  const ensureRoutineNumber = (sectionId: string, item: RoutineItem) => {
    if (!isNumberedCoreRoutineItem(sectionId, item)) {
      return;
    }

    if (!routineNumberById.has(item.id)) {
      routineNumberById.set(item.id, nextRoutineNumber);
      nextRoutineNumber += 1;
    }
  };

  Object.values(settings.templates).forEach((sections) => visitSections(sections, ensureRoutineNumber));
  Object.keys(dateOverrides).sort().forEach((dateKey) =>
    visitSections(dateOverrides[dateKey], ensureRoutineNumber),
  );
  Object.keys(dateSnapshots).sort().forEach((dateKey) =>
    visitSections(dateSnapshots[dateKey], ensureRoutineNumber),
  );
  Object.values(archivedItems).forEach((archivedItem) =>
    ensureRoutineNumber(archivedItem.sectionId, archivedItem.item),
  );

  const applyNumbersToSections = (sections: RoutineSection[]) =>
    sections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        const routineNumber = routineNumberById.get(item.id);

        return routineNumber && item.routineNumber !== routineNumber
          ? { ...item, routineNumber }
          : item;
      }),
    }));
  const nextSettings: RoutineTemplateSettings = {
    ...settings,
    templates: {
      normal: applyNumbersToSections(settings.templates.normal),
      holiday: applyNumbersToSections(settings.templates.holiday),
    },
  };
  const nextDateOverrides = Object.fromEntries(
    Object.entries(dateOverrides).map(([dateKey, sections]) => [
      dateKey,
      applyNumbersToSections(sections),
    ]),
  );
  const nextDateSnapshots = Object.fromEntries(
    Object.entries(dateSnapshots).map(([dateKey, sections]) => [
      dateKey,
      applyNumbersToSections(sections),
    ]),
  );
  const nextArchivedItems = Object.fromEntries(
    Object.entries(archivedItems).map(([itemId, archivedItem]) => {
      const routineNumber = routineNumberById.get(archivedItem.item.id);

      return [
        itemId,
        routineNumber && archivedItem.item.routineNumber !== routineNumber
          ? {
            ...archivedItem,
            item: {
              ...archivedItem.item,
              routineNumber,
            },
          }
          : archivedItem,
      ];
    }),
  );

  return {
    nextArchivedItems,
    nextDateOverrides,
    nextDateSnapshots,
    nextRoutineNumber,
    nextSettings,
  };
};

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
    masterId: typeof candidate.masterId === 'string' ? candidate.masterId : undefined,
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
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : undefined,
  };
};

const mapDailyQuestMasterRowToCandidate = (
  row: DailyQuestMasterRow,
  index: number,
): DailyNudgeCandidate => ({
  id: row.slug,
  masterId: row.id,
  text: row.prompt,
  completionMessage: row.completion_message?.trim() || defaultDailyNudgeCompletionMessage,
  category: row.category?.trim() || 'その他',
  enabled: row.is_active ?? true,
  order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : (index + 1) * 10,
  createdAt: row.created_at ?? new Date().toISOString(),
  updatedAt: row.updated_at ?? undefined,
});

const loadDailyQuestMasterCache = () => {
  const savedCandidates = localStorage.getItem(DAILY_QUEST_MASTER_CACHE_STORAGE_KEY);

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
      .filter((candidate) => candidate.enabled)
      .filter((candidate) => !retiredDailyNudgeCandidateIds.has(candidate.id))
      .sort((first, second) => first.order - second.order);

    return normalizedCandidates.length > 0
      ? normalizedCandidates
      : defaultDailyNudgeCandidates.map((candidate) => ({ ...candidate }));
  } catch {
    return defaultDailyNudgeCandidates.map((candidate) => ({ ...candidate }));
  }
};

const loadDailyNudgeCandidates = () => loadDailyQuestMasterCache();

const loadNudgeRecords = (
  storageKey: string,
  fallbackCompletionMessage = defaultDailyNudgeCompletionMessage,
): DailyNudgeRecords => {
  const savedRecords = localStorage.getItem(storageKey);

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
            completionMessage: record.completionMessage ?? fallbackCompletionMessage,
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

const loadDailyNudgeRecords = () => loadNudgeRecords(DAILY_NUDGE_RECORDS_STORAGE_KEY);

const loadNightlyNudgeRecords = () =>
  loadNudgeRecords(NIGHTLY_NUDGE_RECORDS_STORAGE_KEY, defaultNightlyNudgeCompletionMessage);

const loadChoiceQuestRecords = (): ChoiceQuestRecords => {
  const savedRecords = localStorage.getItem(CHOICE_QUEST_RECORDS_STORAGE_KEY);

  if (!savedRecords) {
    return {};
  }

  try {
    const parsedRecords = JSON.parse(savedRecords) as Record<string, Partial<ChoiceQuestRecord>>;

    if (!parsedRecords || typeof parsedRecords !== 'object' || Array.isArray(parsedRecords)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsedRecords)
        .filter(([dateKey, record]) => /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && record)
        .map(([dateKey, record]) => [
          dateKey,
          {
            selectedOptionId:
              typeof record.selectedOptionId === 'string' ? record.selectedOptionId : undefined,
            completed: Boolean(record.completed),
            selectedAt: typeof record.selectedAt === 'string' ? record.selectedAt : undefined,
            completedAt: typeof record.completedAt === 'string' ? record.completedAt : undefined,
          },
        ]),
    ) as ChoiceQuestRecords;
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
  { id: 'robot', emoji: '🤖', label: 'ロボット' },
  { id: 'alien', emoji: '👾', label: 'スペース' },
  { id: 'wizard', emoji: '🧙', label: 'まほうつかい' },
  { id: 'ninja', emoji: '🥷', label: 'にんじゃ' },
  { id: 'hero', emoji: '🦸', label: 'ヒーロー' },
];

const defaultPlayerIconId: PlayerIconId = 'smile';

const isPlayerIconId = (value: unknown): value is PlayerIconId =>
  typeof value === 'string' && playerIconOptions.some((option) => option.id === value);

const getPlayerIconOption = (iconId: PlayerIconId) =>
  playerIconOptions.find((option) => option.id === iconId) ?? playerIconOptions[0];

const defaultPlayerProfile: PlayerProfile = {
  displayName: '',
  iconId: defaultPlayerIconId,
  oneLineProfile: '',
  favoriteThings: '',
  currentGoal: '',
};

const basicBadgeDefinitions: BadgeDefinition[] = [
  {
    id: 'first-step',
    name: 'はじめの一歩',
    description: '初めてクエストを1件達成',
    icon: '👟',
    category: 'quest',
  },
  {
    id: 'three-day-streak',
    name: '三日坊主を越えた',
    description: '3日連続でクエスト達成',
    icon: '🔥',
    category: 'streak',
  },
  {
    id: 'seven-day-traveler',
    name: '一週間の旅人',
    description: '7日連続でクエスト達成',
    icon: '🧭',
    category: 'streak',
  },
  {
    id: 'perfect-day',
    name: 'PERFECT DAY',
    description: '初めてPERFECTを達成',
    icon: '🏆',
    category: 'quest',
  },
  {
    id: 'memo-writer',
    name: 'ひとこと作家',
    description: '今日のひとことを初めて記録',
    icon: '✍️',
    category: 'record',
  },
  {
    id: 'event-sprout',
    name: '記録の芽',
    description: '今日のできごとを初めて記録',
    icon: '🌱',
    category: 'record',
  },
  {
    id: 'cloud-departure',
    name: 'クラウド旅立ち',
    description: '初めてクラウドバックアップ成功',
    icon: '☁️',
    category: 'cloud',
  },
];

const defaultPlayerBadgeState: PlayerBadgeState = {
  earned: {},
  favoriteBadgeIds: [],
};

const normalizePlayerProfile = (value: unknown): PlayerProfile => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaultPlayerProfile;
  }

  const parsedProfile = value as Partial<PlayerProfile>;

  return {
    displayName: typeof parsedProfile.displayName === 'string'
      ? parsedProfile.displayName.trim().slice(0, 20)
      : '',
    iconId: isPlayerIconId(parsedProfile.iconId) ? parsedProfile.iconId : defaultPlayerIconId,
    oneLineProfile: typeof parsedProfile.oneLineProfile === 'string'
      ? parsedProfile.oneLineProfile.slice(0, 120)
      : '',
    favoriteThings: typeof parsedProfile.favoriteThings === 'string'
      ? parsedProfile.favoriteThings.slice(0, 200)
      : '',
    currentGoal: typeof parsedProfile.currentGoal === 'string'
      ? parsedProfile.currentGoal.slice(0, 200)
      : '',
  };
};

const loadPlayerProfile = () => {
  try {
    const savedProfile = localStorage.getItem(PLAYER_PROFILE_STORAGE_KEY);

    return savedProfile
      ? normalizePlayerProfile(JSON.parse(savedProfile) as unknown)
      : defaultPlayerProfile;
  } catch {
    return defaultPlayerProfile;
  }
};

const normalizePlayerBadgeState = (value: unknown): PlayerBadgeState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaultPlayerBadgeState;
  }

  const parsedState = value as Partial<PlayerBadgeState>;
  const validBadgeIds = new Set(basicBadgeDefinitions.map((badge) => badge.id));
  const earned: Record<string, string> = {};

  if (
    parsedState.earned &&
    typeof parsedState.earned === 'object' &&
    !Array.isArray(parsedState.earned)
  ) {
    Object.entries(parsedState.earned).forEach(([badgeId, earnedAt]) => {
      if (validBadgeIds.has(badgeId) && typeof earnedAt === 'string' && !Number.isNaN(Date.parse(earnedAt))) {
        earned[badgeId] = earnedAt;
      }
    });
  }

  const favoriteBadgeIds = Array.isArray(parsedState.favoriteBadgeIds)
    ? parsedState.favoriteBadgeIds
        .filter((badgeId): badgeId is string =>
          typeof badgeId === 'string' && validBadgeIds.has(badgeId) && Boolean(earned[badgeId]))
        .slice(0, 3)
    : [];

  return {
    earned,
    favoriteBadgeIds,
  };
};

const loadPlayerBadgeState = () => {
  try {
    const savedBadges = localStorage.getItem(PLAYER_BADGES_STORAGE_KEY);

    return savedBadges
      ? normalizePlayerBadgeState(JSON.parse(savedBadges) as unknown)
      : defaultPlayerBadgeState;
  } catch {
    return defaultPlayerBadgeState;
  }
};

const createDefaultPlayerUnlocks = (): PlayerUnlocks => ({
  totalQuestSlots: 1,
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
      totalQuestSlots: Math.max(1, Math.floor(Number(parsedUnlocks.totalQuestSlots))),
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

type PlayerStatusCardProps = {
  freeQuestCount: number;
  isDetailOpen: boolean;
  onCloseDetail: () => void;
  onToggleDetail: () => void;
  playerDisplayName: string;
  playerEconomy: PlayerEconomy;
  playerIconEmoji: string;
  playerRankProgress: ReturnType<typeof getPlayerRankProgress>;
  selectedDateEarnedPoints: number;
  selectedDateEarnedPointsLabel: string;
};

function PlayerStatusCard({
  freeQuestCount,
  isDetailOpen,
  onCloseDetail,
  onToggleDetail,
  playerDisplayName,
  playerEconomy,
  playerIconEmoji,
  playerRankProgress,
  selectedDateEarnedPoints,
  selectedDateEarnedPointsLabel,
}: PlayerStatusCardProps) {
  return (
    <section
      className="economy-status"
      aria-label="プレイヤーランクとPT"
      data-popup-ui="true"
    >
      <button
        aria-expanded={isDetailOpen}
        className="rank-status-button"
        onClick={onToggleDetail}
        type="button"
      >
        <span className="rank-status-hero">
          <span className="rank-status-avatar" aria-hidden="true">
            {playerIconEmoji}
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
        <span className="rank-status-routines" aria-label="フリークエスト数">
          <span>🎯 フリークエスト {freeQuestCount}個</span>
        </span>
        <span
          className="rank-status-earned"
          data-empty={selectedDateEarnedPoints === 0 ? 'true' : 'false'}
        >
          ✨ {selectedDateEarnedPointsLabel} +{selectedDateEarnedPoints}PT
        </span>
        <span className="rank-status-caret" aria-hidden="true">
          {isDetailOpen ? '▲' : '▼'}
        </span>
      </button>
      {isDetailOpen && (
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
              onClick={onCloseDetail}
              type="button"
            >
              ×
            </button>
          </div>
          <dl className="rank-detail-stats">
            <div>
              <dt>累計獲得スター</dt>
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
              <dt>PTボーナス倍率</dt>
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
  );
}

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
  const parsedFixedPlacements = parsedSettings.fixedQuestPlacements &&
    typeof parsedSettings.fixedQuestPlacements === 'object'
    ? parsedSettings.fixedQuestPlacements
    : {};
  const fixedQuestPlacements = (['wake', 'sleep'] as const).reduce<NonNullable<RhythmConfig['fixedQuestPlacements']>>(
    (placements, kind) => {
      const placement = parsedFixedPlacements[kind];

      if (
        placement &&
        isStartSection(placement.sectionId) &&
        Number.isFinite(Number(placement.order))
      ) {
        placements[kind] = {
          sectionId: placement.sectionId,
          order: Number(placement.order),
        };
      }

      return placements;
    },
    {},
  );

  return {
    ...defaultRhythmConfig,
    wakeTime: parsedSettings.wakeTime ?? defaultRhythmConfig.wakeTime,
    sleepTime: parsedSettings.sleepTime ?? defaultRhythmConfig.sleepTime,
    startSection: getMigratedStartSection(parsedSettings),
    fixedQuestPlacements,
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

type DateDisplayKind = 'weekday' | 'saturday' | 'sunday' | 'holiday';

const getDateDisplayKind = (date: Date): DateDisplayKind => {
  if (getHolidayName(date)) {
    return 'holiday';
  }

  if (date.getDay() === 6) {
    return 'saturday';
  }

  if (date.getDay() === 0) {
    return 'sunday';
  }

  return 'weekday';
};

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

type ManagedTodoItem = {
  id: string;
  text: string;
  status: TodoStatus;
  dueDate?: string;
  folderId?: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  originalStatus?: Exclude<TodoStatus, 'completed'>;
  pendingReview?: {
    originDate: string;
    fromStatus: Exclude<TodoStatus, 'completed'>;
  };
};

type ManagedTodos = ManagedTodoItem[];

type TodoFolder = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type TodoFolders = TodoFolder[];

type DailyScheduleItem = {
  id: string;
  time: string;
  text: string;
};

type DailySchedule = DailyScheduleItem[];
type ScheduleDetailDraft = {
  hour: string;
  minute: string;
  text: string;
  error?: string;
  message?: string;
};
type TodoDueDateDraft = {
  year?: string;
  month: string;
  day: string;
  error?: string;
};
type TodoFloatingMenuPosition = {
  id: string;
  top: number;
  left: number;
  maxHeight: number;
};
type TodoDraftMeta = {
  dueDate?: string;
  folderId?: string;
};

type NormalizeDailyTodoOptions = {
  preserveEmptyIds?: Iterable<string>;
};

type NormalizeDailyScheduleOptions = {
  preserveEmptyIds?: Iterable<string>;
};

const createDailyTodoId = () =>
  `todo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const createManagedTodoId = () =>
  `managed-todo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const createTodoFolderId = () =>
  `todo-folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const createDailyScheduleId = () =>
  `schedule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const scheduleTimeOptions = Array.from({ length: 48 }, (_, index) => {
  const hours = Math.floor(index / 2);
  const minutes = index % 2 === 0 ? 0 : 30;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
});

const formatScheduleTimeLabel = (time: string) => (time.trim() ? time : '未定');

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

const todoStatusKeys: TodoStatus[] = ['today', 'tomorrow', 'soon', 'someday', 'completed'];

const isTodoStatus = (value: unknown): value is TodoStatus =>
  typeof value === 'string' && todoStatusKeys.includes(value as TodoStatus);

const isActiveTodoStatus = (value: TodoStatus): value is ActiveTodoStatus =>
  value !== 'completed';

const createManagedTodoItem = (
  text = '',
  status: TodoStatus = 'today',
  options: Partial<Pick<ManagedTodoItem, 'id' | 'dueDate' | 'folderId' | 'completed' | 'createdAt' | 'updatedAt' | 'completedAt' | 'originalStatus' | 'pendingReview'>> = {},
): ManagedTodoItem => {
  const timestamp = new Date().toISOString();
  const completed = status === 'completed' || Boolean(options.completed);
  const originalStatus =
    options.originalStatus && isActiveTodoStatus(options.originalStatus)
      ? options.originalStatus
      : status === 'completed'
        ? 'today'
        : undefined;

  return {
    id: options.id ?? createManagedTodoId(),
    text,
    status,
    ...(options.dueDate ? { dueDate: options.dueDate } : {}),
    ...(options.folderId ? { folderId: options.folderId } : {}),
    completed,
    createdAt: options.createdAt ?? timestamp,
    updatedAt: options.updatedAt ?? timestamp,
    ...(completed && (options.completedAt || status === 'completed')
      ? { completedAt: options.completedAt ?? timestamp }
      : {}),
    ...(originalStatus ? { originalStatus } : {}),
    ...(options.pendingReview ? { pendingReview: options.pendingReview } : {}),
  };
};

const hasManagedTodoText = (todo: ManagedTodoItem) => todo.text.trim().length > 0;

const normalizeManagedTodos = (todos: unknown): ManagedTodos => {
  if (!Array.isArray(todos)) {
    return [];
  }

  return todos
    .map((todo) => {
      if (!todo || typeof todo !== 'object' || Array.isArray(todo)) {
        return null;
      }

      const parsedTodo = todo as Partial<ManagedTodoItem>;
      const text = typeof parsedTodo.text === 'string' ? parsedTodo.text : '';
      const status = isTodoStatus(parsedTodo.status) ? parsedTodo.status : 'today';
      const dueDate =
        typeof parsedTodo.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsedTodo.dueDate)
          ? parsedTodo.dueDate
          : undefined;
      const folderId =
        typeof parsedTodo.folderId === 'string' && parsedTodo.folderId.trim()
          ? parsedTodo.folderId
          : undefined;
      const createdAt =
        typeof parsedTodo.createdAt === 'string' && !Number.isNaN(Date.parse(parsedTodo.createdAt))
          ? parsedTodo.createdAt
          : new Date().toISOString();
      const updatedAt =
        typeof parsedTodo.updatedAt === 'string' && !Number.isNaN(Date.parse(parsedTodo.updatedAt))
          ? parsedTodo.updatedAt
          : createdAt;
      const completedAt =
        typeof parsedTodo.completedAt === 'string' && !Number.isNaN(Date.parse(parsedTodo.completedAt))
          ? parsedTodo.completedAt
          : undefined;
      const originalStatus =
        parsedTodo.originalStatus && isActiveTodoStatus(parsedTodo.originalStatus)
          ? parsedTodo.originalStatus
          : status === 'completed'
            ? 'today'
            : undefined;
      const pendingReview =
        parsedTodo.pendingReview &&
        typeof parsedTodo.pendingReview === 'object' &&
        !Array.isArray(parsedTodo.pendingReview) &&
        typeof parsedTodo.pendingReview.originDate === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(parsedTodo.pendingReview.originDate) &&
        isTodoStatus(parsedTodo.pendingReview.fromStatus) &&
        isActiveTodoStatus(parsedTodo.pendingReview.fromStatus)
          ? {
              originDate: parsedTodo.pendingReview.originDate,
              fromStatus: parsedTodo.pendingReview.fromStatus,
            }
          : undefined;

      return createManagedTodoItem(text, status, {
        id:
          typeof parsedTodo.id === 'string' && parsedTodo.id.trim()
            ? parsedTodo.id
            : createManagedTodoId(),
        completed: status === 'completed' || Boolean(parsedTodo.completed),
        dueDate,
        folderId,
        createdAt,
        updatedAt,
        completedAt,
        originalStatus,
        pendingReview,
      });
    })
    .filter((todo): todo is ManagedTodoItem => Boolean(todo))
    .filter(hasManagedTodoText);
};

const serializeManagedTodos = (todos: ManagedTodos) =>
  JSON.stringify(normalizeManagedTodos(todos));

const normalizeTodoFolders = (folders: unknown): TodoFolders => {
  if (!Array.isArray(folders)) {
    return [];
  }

  return folders
    .map((folder) => {
      if (!folder || typeof folder !== 'object' || Array.isArray(folder)) {
        return null;
      }

      const parsedFolder = folder as Partial<TodoFolder>;
      const name = typeof parsedFolder.name === 'string' ? parsedFolder.name.trim() : '';

      if (!name) {
        return null;
      }

      const timestamp = new Date().toISOString();
      const createdAt =
        typeof parsedFolder.createdAt === 'string' && !Number.isNaN(Date.parse(parsedFolder.createdAt))
          ? parsedFolder.createdAt
          : timestamp;
      const updatedAt =
        typeof parsedFolder.updatedAt === 'string' && !Number.isNaN(Date.parse(parsedFolder.updatedAt))
          ? parsedFolder.updatedAt
          : createdAt;

      return {
        id:
          typeof parsedFolder.id === 'string' && parsedFolder.id.trim()
            ? parsedFolder.id
            : createTodoFolderId(),
        name,
        createdAt,
        updatedAt,
      };
    })
    .filter((folder): folder is TodoFolder => Boolean(folder));
};

const loadTodoFolders = () => {
  try {
    return normalizeTodoFolders(JSON.parse(localStorage.getItem(TODO_FOLDERS_STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
};

const saveTodoFolders = (folders: TodoFolders) => {
  const normalizedFolders = normalizeTodoFolders(folders);

  if (normalizedFolders.length > 0) {
    localStorage.setItem(TODO_FOLDERS_STORAGE_KEY, JSON.stringify(normalizedFolders));
    return;
  }

  localStorage.removeItem(TODO_FOLDERS_STORAGE_KEY);
};

const hydrateManagedTodoDates = (todos: ManagedTodos, todayDate: Date): ManagedTodos => {
  const todayDateKey = getDateKey(todayDate);
  const tomorrowDateKey = getDateKey(addDays(todayDate, 1));

  return todos.map((todo) => {
    if (todo.dueDate || todo.status === 'completed') {
      return todo;
    }

    if (todo.status === 'today') {
      return { ...todo, dueDate: todayDateKey };
    }

    if (todo.status === 'tomorrow') {
      return { ...todo, dueDate: tomorrowDateKey };
    }

    return todo;
  });
};

const getLegacyTodoDateKeys = () =>
  Object.keys(localStorage)
    .map((key) => key.match(/^hibitin:todos:(\d{4}-\d{2}-\d{2})$/)?.[1])
    .filter((dateKey): dateKey is string => Boolean(dateKey))
    .sort();

const migrateLegacyDailyTodos = (todayDate: Date): ManagedTodos => {
  const todayDateKey = getDateKey(todayDate);
  const tomorrowDateKey = getDateKey(addDays(todayDate, 1));

  return getLegacyTodoDateKeys().flatMap((dateKey) => {
    const legacyTodos = parseDailyTodos(localStorage.getItem(`hibitin:todos:${dateKey}`))
      .filter(hasTodoText);

    return legacyTodos.map((todo) => {
      const completedAt = `${dateKey}T23:59:00.000`;
      const baseOptions = {
        id: `legacy-${dateKey}-${todo.id}`,
        createdAt: `${dateKey}T00:00:00.000`,
        updatedAt: `${dateKey}T12:00:00.000`,
      };

      if (todo.completed) {
        return createManagedTodoItem(todo.text, 'completed', {
          ...baseOptions,
          completed: true,
          completedAt,
          originalStatus: dateKey === tomorrowDateKey ? 'tomorrow' : 'today',
          dueDate: dateKey,
        });
      }

      if (dateKey === todayDateKey) {
        return createManagedTodoItem(todo.text, 'today', { ...baseOptions, dueDate: dateKey });
      }

      if (dateKey === tomorrowDateKey) {
        return createManagedTodoItem(todo.text, 'tomorrow', { ...baseOptions, dueDate: dateKey });
      }

      return createManagedTodoItem(todo.text, dateKey < todayDateKey ? 'soon' : 'someday', baseOptions);
    });
  });
};

const getEndOfDateIso = (dateKey: string) => {
  const date = getDateFromKey(dateKey);
  date.setHours(23, 59, 0, 0);

  return date.toISOString();
};

const applyTodoRollover = (todos: ManagedTodos, todayDate: Date) => {
  const todayDateKey = getDateKey(todayDate);
  const lastRolloverDateKey = localStorage.getItem(TODO_ROLLOVER_STORAGE_KEY);

  if (!lastRolloverDateKey || lastRolloverDateKey >= todayDateKey) {
    if (!lastRolloverDateKey) {
      localStorage.setItem(TODO_ROLLOVER_STORAGE_KEY, todayDateKey);
    }

    return todos;
  }

  const rolloverTimestamp = new Date().toISOString();
  const rolledTodos = todos.map((todo) => {
    if (todo.status === 'completed') {
      return todo;
    }

    if (todo.pendingReview) {
      return todo;
    }

    if (todo.status === 'today' || todo.status === 'tomorrow') {
      return {
        ...todo,
        pendingReview: {
          originDate: lastRolloverDateKey,
          fromStatus: todo.status,
        },
        updatedAt: rolloverTimestamp,
      };
    }

    return todo;
  });

  localStorage.setItem(TODO_ROLLOVER_STORAGE_KEY, todayDateKey);
  return rolledTodos;
};

const loadManagedTodos = (todayDate: Date): ManagedTodos => {
  const storedTodos = localStorage.getItem(TODO_ITEMS_STORAGE_KEY);
  const loadedTodos = storedTodos
    ? (() => {
        try {
          return normalizeManagedTodos(JSON.parse(storedTodos) as unknown);
        } catch {
          return [];
        }
      })()
    : migrateLegacyDailyTodos(todayDate);

  return applyTodoRollover(hydrateManagedTodoDates(loadedTodos, todayDate), todayDate);
};

const getTodoStatusLabel = (status: TodoStatus) =>
  todoStatusOptions.find((option) => option.key === status)?.title ?? status;

const hasScheduleValue = (scheduleItem: DailyScheduleItem) =>
  scheduleItem.time.trim().length > 0 || scheduleItem.text.trim().length > 0;

const getScheduleTimeMinutes = (time: string) => {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
};

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

const normalizeDailySchedule = (
  schedule: unknown,
  options: NormalizeDailyScheduleOptions = {},
): DailySchedule => {
  if (!Array.isArray(schedule)) {
    return [];
  }

  const preserveEmptyIds = new Set(options.preserveEmptyIds ?? []);

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
      .filter((scheduleItem) => hasScheduleValue(scheduleItem) || preserveEmptyIds.has(scheduleItem.id)),
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

const serializeDailySchedule = (
  schedule: DailySchedule,
  options: NormalizeDailyScheduleOptions = {},
) => {
  const preserveEmptyIds = new Set(options.preserveEmptyIds ?? []);

  return JSON.stringify(sortDailySchedule(
    schedule.filter((scheduleItem) =>
      hasScheduleValue(scheduleItem) || preserveEmptyIds.has(scheduleItem.id)),
  ));
};

const loadDailySchedule = (date: Date) =>
  parseDailySchedule(localStorage.getItem(getDailyScheduleStorageKey(date)));

const getScheduleDateKeys = () =>
  Object.keys(localStorage)
    .map((key) => key.match(/^hibitin:schedule:(\d{4}-\d{2}-\d{2})$/)?.[1])
    .filter((dateKey): dateKey is string => Boolean(dateKey))
    .sort();

const upsertDailyScheduleItem = (
  schedule: DailySchedule,
  item: DailyScheduleItem,
  options: NormalizeDailyScheduleOptions = {},
): DailySchedule => {
  const exists = schedule.some((scheduleItem) => scheduleItem.id === item.id);

  return normalizeDailySchedule(exists
    ? schedule.map((scheduleItem) => (scheduleItem.id === item.id ? item : scheduleItem))
    : [...schedule, item], options);
};

const deleteDailyScheduleItem = (schedule: DailySchedule, id: string): DailySchedule =>
  normalizeDailySchedule(schedule.filter((scheduleItem) => scheduleItem.id !== id));

type DailyRecordEntry = {
  text: string;
  saved: boolean;
  savedAt?: string;
};

type DailyRecordEntries = DailyRecordEntry[];

type AnyMemoItem = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
};

type AnyMemoListItem = AnyMemoItem & {
  source: 'item' | 'legacy';
  dateKey?: string;
  hasTime: boolean;
};

type AnyMemoFolder = {
  id: string;
  name: string;
  parentFolderId: string | null;
  createdAt: string;
  updatedAt: string;
};

type AnyMemoFolderMemoItem = AnyMemoItem & {
  folderId: string;
};

type AnyMemoTabName = 'memo' | 'folders';

const createDailyRecordEntry = (
  text = '',
  saved = false,
  savedAt?: string,
): DailyRecordEntry => ({
  text,
  saved,
  ...(savedAt ? { savedAt } : {}),
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
        const savedAt =
          'savedAt' in entry &&
          typeof (entry as { savedAt: unknown }).savedAt === 'string' &&
          !Number.isNaN(Date.parse((entry as { savedAt: string }).savedAt))
            ? (entry as { savedAt: string }).savedAt
            : undefined;

        return createDailyRecordEntry(text, saved && hasMeaningfulText(text), savedAt);
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
      .map((entry) => ({
        text: entry.text,
        saved: true,
        ...(entry.savedAt ? { savedAt: entry.savedAt } : {}),
      })),
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
    savedAt: currentEntry.saved && hasMeaningfulText(value) ? currentEntry.savedAt : undefined,
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
    savedAt: hasMeaningfulText(value) ? currentEntry.savedAt ?? new Date().toISOString() : undefined,
  };

  return normalizeDailyRecordEntries(
    nextEntries.map((entry) => ({
      ...entry,
      saved: hasMeaningfulText(entry.text),
      savedAt: hasMeaningfulText(entry.text) ? entry.savedAt ?? new Date().toISOString() : undefined,
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
    savedAt: currentEntry.savedAt ?? new Date().toISOString(),
  };

  return normalizeDailyRecordEntries(nextEntries);
};

const updateSavedDailyRecordEntryText = (
  entries: DailyRecordEntries,
  index: number,
  value: string,
): DailyRecordEntries => {
  const nextEntries = [...entries];
  const currentEntry = nextEntries[index];

  if (!currentEntry?.saved) {
    return normalizeDailyRecordEntries(nextEntries);
  }

  nextEntries[index] = {
    ...currentEntry,
    text: value,
    saved: hasMeaningfulText(value),
    savedAt: currentEntry.savedAt,
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

const createAnyMemoId = () =>
  `any-memo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const createAnyMemoFolderId = () =>
  `any-memo-folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const isValidIsoDateString = (value: unknown): value is string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));

const normalizeAnyMemoItems = (items: unknown): AnyMemoItem[] => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const parsedItem = item as Partial<AnyMemoItem>;
      const text = typeof parsedItem.text === 'string' ? parsedItem.text : '';
      const createdAt = isValidIsoDateString(parsedItem.createdAt)
        ? parsedItem.createdAt
        : new Date().toISOString();
      const updatedAt = isValidIsoDateString(parsedItem.updatedAt)
        ? parsedItem.updatedAt
        : undefined;

      if (!hasMeaningfulText(text)) {
        return null;
      }

      return {
        id:
          typeof parsedItem.id === 'string' && parsedItem.id.trim()
            ? parsedItem.id
            : createAnyMemoId(),
        text,
        createdAt,
        ...(updatedAt ? { updatedAt } : {}),
      };
    })
    .filter((item): item is AnyMemoItem => Boolean(item));
};

const normalizeAnyMemoFolders = (folders: unknown): AnyMemoFolder[] => {
  if (!Array.isArray(folders)) {
    return [];
  }

  const normalizedFolders = folders
    .map((folder) => {
      if (!folder || typeof folder !== 'object' || Array.isArray(folder)) {
        return null;
      }

      const parsedFolder = folder as Partial<AnyMemoFolder>;
      const name = typeof parsedFolder.name === 'string' ? parsedFolder.name.trim() : '';
      const parentFolderId =
        typeof parsedFolder.parentFolderId === 'string' && parsedFolder.parentFolderId.trim()
          ? parsedFolder.parentFolderId
          : null;
      const createdAt = isValidIsoDateString(parsedFolder.createdAt)
        ? parsedFolder.createdAt
        : new Date().toISOString();
      const updatedAt = isValidIsoDateString(parsedFolder.updatedAt)
        ? parsedFolder.updatedAt
        : createdAt;

      if (!name) {
        return null;
      }

      return {
        id:
          typeof parsedFolder.id === 'string' && parsedFolder.id.trim()
            ? parsedFolder.id
            : createAnyMemoFolderId(),
        name,
        parentFolderId,
        createdAt,
        updatedAt,
      };
    })
    .filter((folder): folder is AnyMemoFolder => Boolean(folder));

  const folderIds = new Set(normalizedFolders.map((folder) => folder.id));
  const parentMap = new Map(normalizedFolders.map((folder) => [folder.id, folder.parentFolderId]));
  const createsCycle = (folderId: string, parentId: string | null) => {
    let currentParentId = parentId;
    const visitedIds = new Set<string>();

    while (currentParentId) {
      if (currentParentId === folderId || visitedIds.has(currentParentId)) {
        return true;
      }

      visitedIds.add(currentParentId);
      currentParentId = parentMap.get(currentParentId) ?? null;
    }

    return false;
  };

  return normalizedFolders.map((folder) => {
    const parentFolderId =
      folder.parentFolderId &&
      folderIds.has(folder.parentFolderId) &&
      !createsCycle(folder.id, folder.parentFolderId)
        ? folder.parentFolderId
        : null;

    return {
      ...folder,
      parentFolderId,
    };
  });
};

const normalizeAnyMemoFolderMemoItems = (items: unknown): AnyMemoFolderMemoItem[] => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }

      const parsedItem = item as Partial<AnyMemoFolderMemoItem>;
      const text = typeof parsedItem.text === 'string' ? parsedItem.text : '';
      const folderId = typeof parsedItem.folderId === 'string' ? parsedItem.folderId : '';
      const createdAt = isValidIsoDateString(parsedItem.createdAt)
        ? parsedItem.createdAt
        : new Date().toISOString();
      const updatedAt = isValidIsoDateString(parsedItem.updatedAt)
        ? parsedItem.updatedAt
        : undefined;

      if (!folderId || !hasMeaningfulText(text)) {
        return null;
      }

      return {
        id:
          typeof parsedItem.id === 'string' && parsedItem.id.trim()
            ? parsedItem.id
            : createAnyMemoId(),
        folderId,
        text,
        createdAt,
        ...(updatedAt ? { updatedAt } : {}),
      };
    })
    .filter((item): item is AnyMemoFolderMemoItem => Boolean(item));
};

const loadAnyMemoItems = () => {
  try {
    return normalizeAnyMemoItems(JSON.parse(localStorage.getItem(ANY_MEMO_ITEMS_STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
};

const loadAnyMemoFolders = () => {
  try {
    return normalizeAnyMemoFolders(
      JSON.parse(localStorage.getItem(ANY_MEMO_FOLDERS_STORAGE_KEY) ?? '[]'),
    );
  } catch {
    return [];
  }
};

const loadAnyMemoFolderItems = () => {
  try {
    return normalizeAnyMemoFolderMemoItems(
      JSON.parse(localStorage.getItem(ANY_MEMO_FOLDER_ITEMS_STORAGE_KEY) ?? '[]'),
    );
  } catch {
    return [];
  }
};

const saveAnyMemoItems = (items: AnyMemoItem[]) => {
  const normalizedItems = normalizeAnyMemoItems(items);

  if (normalizedItems.length > 0) {
    localStorage.setItem(ANY_MEMO_ITEMS_STORAGE_KEY, JSON.stringify(normalizedItems));
    return;
  }

  localStorage.removeItem(ANY_MEMO_ITEMS_STORAGE_KEY);
};

const saveAnyMemoFolders = (folders: AnyMemoFolder[]) => {
  const normalizedFolders = normalizeAnyMemoFolders(folders);

  if (normalizedFolders.length > 0) {
    localStorage.setItem(ANY_MEMO_FOLDERS_STORAGE_KEY, JSON.stringify(normalizedFolders));
    return;
  }

  localStorage.removeItem(ANY_MEMO_FOLDERS_STORAGE_KEY);
};

const saveAnyMemoFolderItems = (items: AnyMemoFolderMemoItem[]) => {
  const normalizedItems = normalizeAnyMemoFolderMemoItems(items);

  if (normalizedItems.length > 0) {
    localStorage.setItem(ANY_MEMO_FOLDER_ITEMS_STORAGE_KEY, JSON.stringify(normalizedItems));
    return;
  }

  localStorage.removeItem(ANY_MEMO_FOLDER_ITEMS_STORAGE_KEY);
};

const getLegacyAnyMemoItems = (): AnyMemoListItem[] => {
  const legacyItems: AnyMemoListItem[] = [];

  Object.keys(localStorage).forEach((key) => {
      const dateKey = key.match(/^hibitin:anyMemo:(\d{4}-\d{2}-\d{2})$/)?.[1];

      if (!dateKey) {
        return;
      }

      const text = localStorage.getItem(key) ?? '';

      if (!hasMeaningfulText(text)) {
        return;
      }

      legacyItems.push({
        id: `legacy-any-memo-${dateKey}`,
        text,
        createdAt: `${dateKey}T00:00:00.000`,
        source: 'legacy' as const,
        dateKey,
        hasTime: false,
      });
    });

  return legacyItems;
};

const getAnyMemoListItems = (items: AnyMemoItem[]): AnyMemoListItem[] =>
  [
    ...items.map((item) => ({
      ...item,
      source: 'item' as const,
      hasTime: true,
    })),
    ...getLegacyAnyMemoItems(),
  ].sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));

const formatAnyMemoTimestamp = (item: AnyMemoListItem, todayDate: Date) => {
  const createdAt = new Date(item.createdAt);
  const sameYear = createdAt.getFullYear() === todayDate.getFullYear();
  const dateLabel = sameYear
    ? `${createdAt.getMonth() + 1}月${createdAt.getDate()}日`
    : `${createdAt.getFullYear()}年${createdAt.getMonth() + 1}月${createdAt.getDate()}日`;

  if (!item.hasTime) {
    return dateLabel;
  }

  return `${dateLabel} ${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}`;
};

const formatDailyRecordSavedTime = (savedAt?: string) => {
  if (!savedAt || Number.isNaN(Date.parse(savedAt))) {
    return '';
  }

  const date = new Date(savedAt);

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const loadRecordDisplayMode = (): RecordDisplayMode => {
  const savedMode = localStorage.getItem(RECORD_DISPLAY_MODE_STORAGE_KEY);

  if (savedMode === 'all' || savedMode === 'withRecords') {
    return savedMode;
  }

  try {
    const parsedMode = JSON.parse(savedMode ?? 'null') as unknown;

    return parsedMode === 'all' || parsedMode === 'withRecords' ? parsedMode : 'withRecords';
  } catch {
    return 'withRecords';
  }
};

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
    return `🌱 ${safeDisplayName}、今日もゆるく一歩。`;
  }

  if (safeDisplayName && messageIndex === 1) {
    return `☕ ${safeDisplayName}、焦らなくて大丈夫。`;
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
  const leadingBlankCount = firstDate.getDay();
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
    return target.template === 'normal' ? '通常ルーティン' : '休日ルーティン';
  }

  return `${target.dateKey}だけのクエスト`;
};

const getTemplateLabel = (template: TemplateKind) =>
  template === 'normal' ? 'ノーマル' : '休日';

const getRoutineKindLabel = (kind: RoutineKind) => {
  if (kind === 'custom') {
    return '個別カスタム';
  }

  return kind === 'normal' ? '通常ルーティン' : '休日ルーティン';
};

const dailySectionIds: StartSection[] = ['morning', 'noon', 'evening', 'night'];
const bonusSectionId = 'advanced';
const getAdvancedEntriesFromSections = (sections: RoutineSection[]) =>
  sections
    .find((section) => section.id === bonusSectionId)
    ?.items
    .filter((item) => hasMeaningfulText(item.label)) ?? [];
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
  initialTotalSlots: 1,
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
  kind: FixedQuestKind,
  time: string,
  order = kind === 'wake' ? -20 : 9990,
): RoutineItem => ({
  id: kind === 'wake'
    ? 'morning-wake-up'
    : kind === 'sleep'
      ? 'night-sleep'
      : kind === 'scheduleCheck'
        ? 'fixed-schedule-check'
        : 'fixed-todo-check',
  label: kind === 'wake'
    ? '起床'
    : kind === 'sleep'
      ? '就寝'
      : kind === 'scheduleCheck'
        ? '📅 スケジュールをチェック'
        : '✅ やることを眺める',
  order,
  source: 'default',
  createdAt: '2026-06-01T00:00:00.000Z',
  fixedKind: kind,
  ...(kind === 'wake' || kind === 'sleep' ? { time } : {}),
});

const buildDisplaySections = (
  sections: RoutineSection[],
  rhythmConfig: RhythmConfig,
) => {
  const sectionOrder = sectionOrderByStartSection[rhythmConfig.startSection];
  const dailySectionOrder = sectionOrder.filter((sectionId) =>
    dailySectionIds.includes(sectionId as StartSection),
  );
  const defaultWakePlacement = {
    sectionId: rhythmConfig.startSection,
    order: -20,
  };
  const defaultSleepPlacement = {
    sectionId: dailySectionOrder[dailySectionOrder.length - 1] as StartSection,
    order: 9990,
  };
  const wakePlacement = rhythmConfig.fixedQuestPlacements?.wake ?? defaultWakePlacement;
  const sleepPlacement = rhythmConfig.fixedQuestPlacements?.sleep ?? defaultSleepPlacement;

  return removeFixedRoutineItems(sections)
    .map((section) => {
      const fixedItems: RoutineItem[] = [];

      if (section.id === wakePlacement.sectionId) {
        fixedItems.push(createFixedRoutineItem('wake', rhythmConfig.wakeTime, wakePlacement.order));
      }

      if (section.id === rhythmConfig.startSection) {
        fixedItems.push(createFixedRoutineItem('scheduleCheck', '', -12));
        fixedItems.push(createFixedRoutineItem('todoCheck', '', -11));
      }

      if (section.id === sleepPlacement.sectionId) {
        fixedItems.push(createFixedRoutineItem('sleep', rhythmConfig.sleepTime, sleepPlacement.order));
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

const addFixedRecordQuestStats = (
  stats: ReturnType<typeof calculateCompletionStats>,
  completion: Record<CoreRoutineId, boolean>,
  canComplete: boolean,
  extraFixedQuestCompletion: { completedCount: number; totalCount: number } = {
    completedCount: 0,
    totalCount: 0,
  },
) => {
  const fixedRecordQuestCount = coreRoutineDefinitions.length;
  const completedFixedRecordQuestCount = canComplete
    ? coreRoutineDefinitions.filter((definition) => completion[definition.id]).length
    : 0;
  const totalCount = stats.totalCount + fixedRecordQuestCount + extraFixedQuestCompletion.totalCount;
  const completedCount =
    stats.completedCount + completedFixedRecordQuestCount + extraFixedQuestCompletion.completedCount;

  return {
    completedCount,
    totalCount,
    rate: totalCount === 0 ? null : Math.round((completedCount / totalCount) * 100),
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

const monthlyStampSummaryDefinitions = [
  { level: 'first', icon: '🐣', label: 'FIRST' },
  { level: 'start', icon: '👟', label: 'START' },
  { level: 'good', icon: '👍', label: 'GOOD' },
  { level: 'great', icon: '🎉', label: 'GREAT' },
  { level: 'excellent', icon: '🌟', label: 'EXCELLENT' },
  { level: 'perfect', icon: '🏆', label: 'PERFECT' },
] as const;

type MonthlyStampSummaryLevel = typeof monthlyStampSummaryDefinitions[number]['level'];

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
  '対象：固定クエストと朝・昼・夕・夜のフリークエスト',
  `星1〜3：${MASTERY_RULES.earlyStarStreakDays}日連続達成ごとに+1`,
  `星4：星3到達後、${MASTERY_RULES.fourthStarStreakDays}日連続達成で獲得`,
  `星5：星4到達後、${MASTERY_RULES.fifthStarStreakDays}日連続達成で獲得`,
  `${MASTERY_RULES.missedDaysForStarLoss}日連続未達成で星-1`,
  '星5到達で🏆+1、その後星0へ戻る',
  `トロフィー上限：${TROPHY_RULES.maxTrophies}個`,
  'アドバンストは対象外',
];

const getPointAchievementKey = (dateKey: string, itemId: string) => `${dateKey}:${itemId}`;
const getDailyNudgePointAchievementKey = (dateKey: string) => `daily-nudge:${dateKey}`;
const getNightlyNudgePointAchievementKey = (dateKey: string) => `nightly-nudge:${dateKey}`;
const getChoiceQuestPointAchievementKey = (dateKey: string) => `choice-quest:${dateKey}`;
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

  if (item.fixedKind === 'scheduleCheck' || item.fixedKind === 'todoCheck') {
    return 'normal';
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
      .flatMap((section) => section.items.map((item) => item.id)),
  );
  coreRoutineDefinitions.forEach((definition) => {
    currentItemIds.add(`core:${definition.id}`);
  });
  const currentItemOrder = new Map<string, number>();

  currentDisplaySections
    .filter((section) => isMasteryTargetSectionId(section.id))
    .forEach((section, sectionIndex) => {
      section.items.forEach((item, itemIndex) => {
        currentItemOrder.set(item.id, sectionIndex * 1000 + itemIndex);
      });
    });
  coreRoutineDefinitions.forEach((definition, index) => {
    currentItemOrder.set(`core:${definition.id}`, 100000 + index);
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
      section.items.forEach((item, itemIndex) => {
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
          questKind: item.fixedKind ? 'fixed' : 'core',
          routineNumber: item.fixedKind ? undefined : item.routineNumber,
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

    const coreCompletion = getCoreRoutineCompletion(loadDailyMemo(date), loadDailyEvent(date));

    coreRoutineDefinitions.forEach((definition, index) => {
      const itemId = `core:${definition.id}`;
      const order = currentItemOrder.get(itemId) ?? 100000 + index;
      const currentProgress = progressByItemId.get(itemId) ?? createEmptyMasteryProgress();
      const nextProgress = applyMasteryDayResult(currentProgress, Boolean(coreCompletion[definition.id]));

      progressByItemId.set(itemId, nextProgress);
      stats.set(itemId, {
        itemId,
        label: definition.label,
        sectionId: 'fixed-record',
        sectionTitle: '固定クエスト',
        order,
        questKind: 'fixed',
        totalCompletions: nextProgress.totalCompletions,
        currentStreak: nextProgress.currentStreak,
        bestStreak: nextProgress.bestStreak,
        starCount: nextProgress.starCount,
        trophyCount: nextProgress.trophyCount,
        isHallOfFame: nextProgress.trophyCount > 0,
        isCurrentItem: true,
        lastSeenDateKey: dateKey,
      });
    });
  }

  return Array.from(stats.values())
    .filter((itemStats) => itemStats.questKind === 'fixed' || itemStats.isCurrentItem)
    .sort((first, second) => {
      if (first.questKind !== second.questKind) {
        return first.questKind === 'fixed' ? -1 : 1;
      }

      if (first.questKind === 'core' && second.questKind === 'core') {
        const firstNumber = first.routineNumber ?? Number.MAX_SAFE_INTEGER;
        const secondNumber = second.routineNumber ?? Number.MAX_SAFE_INTEGER;

        if (firstNumber !== secondNumber) {
          return firstNumber - secondNumber;
        }
      }

      if (first.order !== second.order) {
        return first.order - second.order;
      }

      return first.label.localeCompare(second.label, 'ja');
    });
};

function App() {
  const [today, setToday] = useState(() => new Date());
  const backupInputRef = useRef<HTMLInputElement>(null);
  const backupDownloadUrlRef = useRef<string | null>(null);
  const anyMemoInputRef = useRef<HTMLTextAreaElement>(null);
  const dailyMemoTextareaRef = useRef<HTMLTextAreaElement>(null);
  const dailyEventTextareaRef = useRef<HTMLTextAreaElement>(null);
  const dailyMemoCardRef = useRef<HTMLElement>(null);
  const dailyEventCardRef = useRef<HTMLElement>(null);
  const dailyRecordEditTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const historyDailyMemoTextareaRef = useRef<HTMLTextAreaElement>(null);
  const historyDailyEventTextareaRef = useRef<HTMLTextAreaElement>(null);
  const initialTimerStateRef = useRef<StoredTimerState | null>(null);
  const alertedFinishedTimerIdRef = useRef<string | null>(null);
  const exchangeLockRef = useRef(false);
  const questEmoteTimeoutsRef = useRef<Record<string, number>>({});
  const scheduleTodayScrollMonthRef = useRef<string | null>(null);
  const recordTodayScrollMonthRef = useRef<string | null>(null);
  const composingScheduleIdsRef = useRef<Set<string>>(new Set());
  const scheduleDetailSavingKeysRef = useRef<Set<string>>(new Set());
  const scheduleListScrollYearRef = useRef<string | null>(null);
  const scheduleAgendaScrollYearRef = useRef<string | null>(null);
  const getInitialTimerState = () => {
    if (!initialTimerStateRef.current) {
      initialTimerStateRef.current = loadStoredTimerState();
    }

    return initialTimerStateRef.current;
  };
  const todayKey = getDateKey(today);
  const yesterday = useMemo(() => addDays(today, -1), [today]);
  const [page, setPage] = useState<PageName>('today');
  const [menuView, setMenuView] = useState<MenuViewName>('list');
  const [isLibraryBackAnimating, setIsLibraryBackAnimating] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => today);
  const [historySelectedDate, setHistorySelectedDate] = useState<Date | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => getMonthStart(today));
  const [scheduleMonth, setScheduleMonth] = useState(() => getMonthStart(today));
  const [scheduleYear, setScheduleYear] = useState(() => today.getFullYear());
  const [scheduleView, setScheduleView] = useState<ScheduleViewName>(INITIAL_SCHEDULE_VIEW);
  const [selectedScheduleYearMonth, setSelectedScheduleYearMonth] = useState<number | null>(null);
  const [recordMonth, setRecordMonth] = useState(() => getMonthStart(today));
  const [recordView, setRecordView] = useState<RecordViewName>('memo');
  const [recordDisplayMode, setRecordDisplayMode] =
    useState<RecordDisplayMode>(() => loadRecordDisplayMode());
  const [selectedScheduleDate, setSelectedScheduleDate] = useState<Date | null>(null);
  const [scheduleRevision, setScheduleRevision] = useState(0);
  const [scheduleDetailDrafts, setScheduleDetailDrafts] = useState<Record<string, ScheduleDetailDraft>>({});
  const [activeScheduleMenuId, setActiveScheduleMenuId] = useState<string | null>(null);
  const [todoView, setTodoView] = useState<TodoViewName>(INITIAL_TODO_VIEW);
  const [todoMonth, setTodoMonth] = useState(() => getMonthStart(today));
  const [selectedTodoDate, setSelectedTodoDate] = useState<Date | null>(null);
  const [newTodoText, setNewTodoText] = useState('');
  const [newTodoTodayText, setNewTodoTodayText] = useState('');
  const [newTodoDateText, setNewTodoDateText] = useState('');
  const [activeTodoMenuId, setActiveTodoMenuId] = useState<string | null>(null);
  const [todoDueDateDrafts, setTodoDueDateDrafts] = useState<Record<string, TodoDueDateDraft>>({});
  const [isTodoSelectionMode, setIsTodoSelectionMode] = useState(false);
  const [selectedTodoIds, setSelectedTodoIds] = useState<Record<string, boolean>>({});
  const [todoBulkStatusMessage, setTodoBulkStatusMessage] = useState('');
  const [todoFolders, setTodoFolders] = useState<TodoFolders>(() => loadTodoFolders());
  const [selectedTodoFolderId, setSelectedTodoFolderId] = useState<string | null>(null);
  const [newTodoFolderName, setNewTodoFolderName] = useState('');
  const [newTodoFolderText, setNewTodoFolderText] = useState('');
  const [activeTodoFolderMenuId, setActiveTodoFolderMenuId] = useState<string | null>(null);
  const [todoFloatingMenuPosition, setTodoFloatingMenuPosition] =
    useState<TodoFloatingMenuPosition | null>(null);
  const newTodoInputRef = useRef<HTMLTextAreaElement | null>(null);
  const newTodoTodayInputRef = useRef<HTMLTextAreaElement | null>(null);
  const newTodoDateInputRef = useRef<HTMLTextAreaElement | null>(null);
  const newTodoFolderInputRef = useRef<HTMLTextAreaElement | null>(null);
  const todoDraftTextsRef = useRef<Record<string, string | undefined>>({});
  const todoMenuAnchorRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const todoMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const [managedTodoDrafts, setManagedTodoDrafts] = useState<Record<ActiveTodoStatus, string>>({
    today: '',
    tomorrow: '',
    soon: '',
    someday: '',
  });
  const managedTodoDraftComposingStatusesRef = useRef(new Set<ActiveTodoStatus>());
  const librarySwipeBackRef = useRef<{
    startX: number;
    startY: number;
    triggered: boolean;
  } | null>(null);
  const [selectedRecordDate, setSelectedRecordDate] = useState<Date | null>(null);
  const [recordRevision, setRecordRevision] = useState(0);
  const [anyMemoItems, setAnyMemoItems] = useState<AnyMemoItem[]>(() => loadAnyMemoItems());
  const [anyMemoTab, setAnyMemoTab] = useState<AnyMemoTabName>('memo');
  const [newAnyMemoText, setNewAnyMemoText] = useState('');
  const [editingAnyMemoId, setEditingAnyMemoId] = useState<string | null>(null);
  const [editingAnyMemoText, setEditingAnyMemoText] = useState('');
  const [expandedAnyMemoIds, setExpandedAnyMemoIds] = useState<Record<string, boolean>>({});
  const [anyMemoStatusMessage, setAnyMemoStatusMessage] = useState('');
  const [anyMemoFolders, setAnyMemoFolders] = useState<AnyMemoFolder[]>(() => loadAnyMemoFolders());
  const [anyMemoFolderItems, setAnyMemoFolderItems] = useState<AnyMemoFolderMemoItem[]>(() =>
    loadAnyMemoFolderItems(),
  );
  const [selectedAnyMemoFolderId, setSelectedAnyMemoFolderId] = useState<string | null>(null);
  const [newAnyMemoFolderName, setNewAnyMemoFolderName] = useState('');
  const [editingAnyMemoFolderId, setEditingAnyMemoFolderId] = useState<string | null>(null);
  const [editingAnyMemoFolderName, setEditingAnyMemoFolderName] = useState('');
  const [newFolderMemoText, setNewFolderMemoText] = useState('');
  const [movingAnyMemoId, setMovingAnyMemoId] = useState<string | null>(null);
  const [newMoveFolderName, setNewMoveFolderName] = useState('');
  const selectedDateKey = getDateKey(selectedDate);
  const questDateLabel = formatQuestDateLabel(selectedDate);
  const historySelectedDateKey = historySelectedDate ? getDateKey(historySelectedDate) : '';
  const historyDateLabel = historySelectedDate ? formatQuestDateLabel(historySelectedDate) : '';
  const shouldShowManagedTodoInWorkingList = (todo: ManagedTodoItem) =>
    todo.status !== 'completed';
  const shouldShowManagedTodoInCompletedHistory = (todo: ManagedTodoItem) =>
    todo.status === 'completed';
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
  const [dailyQuestAdminCandidates, setDailyQuestAdminCandidates] = useState<DailyNudgeCandidate[]>([]);
  const [dailyQuestMasterStatus, setDailyQuestMasterStatus] =
    useState<DailyQuestMasterStatus>('idle');
  const [dailyQuestMasterMessage, setDailyQuestMasterMessage] = useState('');
  const [isDailyQuestMasterBusy, setIsDailyQuestMasterBusy] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [isAdminChecking, setIsAdminChecking] = useState(false);
  const [dailyNudgeRecords, setDailyNudgeRecords] = useState<DailyNudgeRecords>(() =>
    loadDailyNudgeRecords(),
  );
  const [nightlyNudgeRecords, setNightlyNudgeRecords] = useState<DailyNudgeRecords>(() =>
    loadNightlyNudgeRecords(),
  );
  const [choiceQuestRecords, setChoiceQuestRecords] = useState<ChoiceQuestRecords>(() =>
    loadChoiceQuestRecords(),
  );
  const [gameMode, setGameMode] = useState<GameMode>(() => loadGameMode());
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile>(() => loadPlayerProfile());
  const [playerBadges, setPlayerBadges] = useState<PlayerBadgeState>(() => loadPlayerBadgeState());
  const [isStatusProfileEditing, setIsStatusProfileEditing] = useState(false);
  const [statusProfileDraft, setStatusProfileDraft] = useState<PlayerProfile>(() => playerProfile);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [selectedBadgeId, setSelectedBadgeId] = useState<string | null>(null);
  const [playerUnlocks, setPlayerUnlocks] = useState<PlayerUnlocks>(() => loadPlayerUnlocks());
  const dailyMessage = getDailyMessage(selectedDateKey, playerProfile.displayName);
  const dailyOneLineExample = getDailyOneLineExample(selectedDateKey);
  const dailyEventExample = getDailyEventExample(selectedDateKey);
  const dailyEventLabel = isToday ? '今日のできごと' : '昨日のできごと';
  const dailyOneLineLabel = isToday ? '今日のひとこと' : '昨日のひとこと';
  const dailyAnyMemoLabel = 'なんでもメモ';
  const dailyNudgeDisplayLabel = isToday ? '今日のログインクエスト' : '昨日のログインクエスト';
  const nightlyNudgeDisplayLabel = isToday ? '今日のおやすみクエスト' : '昨日のおやすみクエスト';
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
  const [nightlyNudgePointFlash, setNightlyNudgePointFlash] = useState<PointToast | null>(null);
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
  const [routineDrafts, setRoutineDrafts] = useState<RoutineDrafts>({});
  const routineDraftComposingSectionsRef = useRef(new Set<string>());
  const [timerDraftParts, setTimerDraftParts] = useState(() => getTimerParts(300));
  const [noteEditorTarget, setNoteEditorTarget] = useState<NoteEditorTarget | null>(null);
  const [activeQuestInfo, setActiveQuestInfo] = useState<{
    id: string;
    kindLabel: string;
    supportLabel: string;
    actionLabel?: string;
    onSupportClick?: () => void;
    position: { left: number; top: number };
    placement: 'top' | 'bottom';
  } | null>(null);
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
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dropRoutineSectionId, setDropRoutineSectionId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [isQuestSlotGuideOpen, setIsQuestSlotGuideOpen] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>(() =>
    loadCheckedItems(today),
  );
  const [historyCheckedItems, setHistoryCheckedItems] = useState<Record<string, boolean>>({});
  const [backupMessage, setBackupMessage] = useState('');
  const [backupDownload, setBackupDownload] = useState<BackupDownload | null>(null);
  const [autoBackups, setAutoBackups] = useState<AutoBackupRecord[]>([]);
  const [autoBackupMessage, setAutoBackupMessage] = useState('');
  const [isAutoBackupListOpen, setIsAutoBackupListOpen] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [supabaseConnectionStatus, setSupabaseConnectionStatus] =
    useState<SupabaseConnectionStatus>(isSupabaseConfigured ? 'checking' : 'unconfigured');
  const [cloudBackupStatus, setCloudBackupStatus] = useState<CloudBackupStatus>('idle');
  const [cloudBackupMessage, setCloudBackupMessage] = useState('');
  const [lastCloudBackupAt, setLastCloudBackupAt] = useState<string | null>(null);
  const [cloudBackupInfo, setCloudBackupInfo] = useState<CloudBackupInfo | null>(null);
  const [isCloudBackupChecking, setIsCloudBackupChecking] = useState(false);
  const [isCloudRestoreConfirmOpen, setIsCloudRestoreConfirmOpen] = useState(false);
  const [isCloudRestoreBusy, setIsCloudRestoreBusy] = useState(false);
  const authUserRef = useRef<User | null>(null);
  const cloudBackupTimerIdRef = useRef<number | null>(null);
  const initialCloudBackupTimerIdRef = useRef<number | null>(null);
  const cloudBackupHashRef = useRef<string | null>(null);
  const hasPendingCloudBackupRef = useRef(false);
  const initialCloudBackupAttemptedUserIdsRef = useRef<Set<string>>(new Set());
  const isInitialCloudBackupRunningRef = useRef(false);
  const pendingInitialCloudBackupUserIdRef = useRef<string | null>(null);
  const scheduleCloudBackupRef = useRef<() => void>(() => {});
  const [dailyEvent, setDailyEvent] = useState(() => loadDailyEvent(today));
  const [dailyEventDateKey, setDailyEventDateKey] = useState(() => todayKey);
  const [dailyMemo, setDailyMemo] = useState(() => loadDailyMemo(today));
  const [dailyMemoDateKey, setDailyMemoDateKey] = useState(() => todayKey);
  const [editingDailyRecord, setEditingDailyRecord] = useState<{
    kind: CoreRoutineKind;
    index: number;
    text: string;
    originalText: string;
  } | null>(null);
  const [dailyTodos, setDailyTodos] = useState(() => loadDailyTodos(today));
  const [dailyTodosDateKey, setDailyTodosDateKey] = useState(() => todayKey);
  const [managedTodos, setManagedTodos] = useState<ManagedTodos>(() => loadManagedTodos(today));
  const [isTodoReviewOpen, setIsTodoReviewOpen] = useState(false);
  const [todoReviewActions, setTodoReviewActions] = useState<Record<string, TodoReviewAction>>({});
  const [todoReviewDismissed, setTodoReviewDismissed] = useState(false);
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
  const [draggedTodoId, setDraggedTodoId] = useState<string | null>(null);
  const [todoDropTarget, setTodoDropTarget] = useState<{
    status: ActiveTodoStatus;
    beforeId: string | null;
  } | null>(null);
  const pendingTodoReviews = useMemo(
    () => managedTodos.filter((todo) => todo.pendingReview && hasManagedTodoText(todo)),
    [managedTodos],
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setToday((currentToday) => {
        const nextToday = new Date();

        return getDateKey(currentToday) === getDateKey(nextToday) ? currentToday : nextToday;
      });
    }, 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, [selectedTodoDate, selectedTodoFolderId, todayKey]);

  useEffect(() => {
    if (!activeQuestInfo) {
      return undefined;
    }

    const closeQuestInfo = (event: PointerEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('[data-quest-info-ui="true"]')
      ) {
        return;
      }

      setActiveQuestInfo(null);
    };
    const closeQuestInfoOnScroll = () => setActiveQuestInfo(null);
    const closeQuestInfoOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveQuestInfo(null);
      }
    };

    document.addEventListener('pointerdown', closeQuestInfo, true);
    window.addEventListener('touchmove', closeQuestInfoOnScroll, true);
    window.addEventListener('scroll', closeQuestInfoOnScroll, true);
    document.addEventListener('keydown', closeQuestInfoOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeQuestInfo, true);
      window.removeEventListener('touchmove', closeQuestInfoOnScroll, true);
      window.removeEventListener('scroll', closeQuestInfoOnScroll, true);
      document.removeEventListener('keydown', closeQuestInfoOnEscape);
    };
  }, [activeQuestInfo]);

  useEffect(() => {
    setActiveQuestInfo(null);
  }, [page, menuView, isEditMode, isHistoryEditMode]);

  useEffect(() => {
    setManagedTodos((currentTodos) => applyTodoRollover(currentTodos, today));
  }, [todayKey, today]);

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
  const isTodayQuestView = page === 'today';
  const isMenuScheduleView = page === 'schedule' || (page === 'library' && menuView === 'schedule');
  const isMenuTodoView = page === 'todos' || (page === 'library' && menuView === 'todos');
  const isMenuTimerView = page === 'library' && menuView === 'timer';
  const isMenuNotesView = false;
  const isMenuStatusView = page === 'library' && menuView === 'status';
  const isShopView = page === 'library' && menuView === 'shop';
  const isSettingsView = page === 'library' && menuView === 'settings';
  const isLibraryDetailView = page === 'library' && menuView !== 'list';
  const libraryRecordView = libraryRecordViewMap[menuView] ?? null;
  const isLibraryRecordView = page === 'library' && Boolean(libraryRecordView);
  const isLibraryAchievementsView = isLibraryRecordView && recordView === 'achievements';
  const isLibraryAnyMemoView = isLibraryRecordView && recordView === 'anyMemo';
  const isAnyMemoFolderDetailView = isLibraryAnyMemoView && Boolean(selectedAnyMemoFolderId);
  const isTodayScheduleView = isMenuScheduleView;
  const isTodayTodoView = isMenuTodoView;
  const isTodayNotesView = isMenuNotesView;
  const isTodayStatusView = isMenuStatusView;
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
  const todayTemplate = getBaseTemplateForDate(templateSettings, today);
  const todayTarget = resolveDateTarget(
    templateSettings,
    dateOverrides,
    dateSnapshots,
    today,
    todayKey,
  );
  const todayDisplaySections = buildDisplaySections(
    removeFixedRoutineItems(
      getSectionsForTarget(
        templateSettings,
        dateOverrides,
        dateSnapshots,
        todayTarget,
        todayKey,
      ),
    ),
    rhythmSettings[todayTemplate],
  );
  const isCheckMode = page === 'today';
  const canEditRoutines = isSettingsView || (page === 'today' && isEditMode);
  const canEditRoutineDetails = isSettingsView || (page === 'today' && isToday);
  const totalQuestSlotLimit = getEffectiveQuestSlotLimit(playerUnlocks, gameBalance);
  const usedQuestSlots = countFreeQuestItems(displaySections);
  const remainingQuestSlots = Math.max(0, totalQuestSlotLimit - usedQuestSlots);
  const freeQuestCount = countFreeQuestItems(displaySections);
  const selectedCoreRoutineCompletion = getCoreRoutineCompletion(dailyMemo, dailyEvent);
  const selectedCoreRoutineCanComplete = selectedDateKey <= todayKey;
  const selectedNightlyNudgeRecord = nightlyNudgeRecords[selectedDateKey] ?? null;
  const selectedChoiceQuestRecord = choiceQuestRecords[selectedDateKey] ?? null;
  const selectedDateStats = addFixedRecordQuestStats(
    calculateCompletionStats(displaySections, checkedItems),
    selectedCoreRoutineCompletion,
    selectedCoreRoutineCanComplete,
    {
      completedCount:
        selectedCoreRoutineCanComplete
          ? (selectedNightlyNudgeRecord?.completed ? 1 : 0) +
            (selectedChoiceQuestRecord?.completed ? 1 : 0)
          : 0,
      totalCount: selectedCoreRoutineCanComplete ? 2 : 0,
    },
  );
  const selectedDateRank = getCompletionRank(selectedDateStats.rate);
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
  const selectedNightlyNudgeAward =
    playerEconomy.pointAwards[getNightlyNudgePointAchievementKey(selectedDateKey)];
  const selectedChoiceQuestOption = choiceQuestOptions.find(
    (option) => option.id === selectedChoiceQuestRecord?.selectedOptionId,
  ) ?? null;
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
  const historyCoreRoutineCompletion = getCoreRoutineCompletion(
    historyDailyMemo,
    historyDailyEvent,
  );
  const historyCoreRoutineCanComplete = Boolean(
    historySelectedDateKey && historySelectedDateKey <= todayKey,
  );
  const historyDateStats = addFixedRecordQuestStats(
    calculateCompletionStats(historyDisplaySections, historyCheckedItems),
    historyCoreRoutineCompletion,
    historyCoreRoutineCanComplete,
    {
      completedCount:
        historyCoreRoutineCanComplete
          ? (nightlyNudgeRecords[historySelectedDateKey]?.completed ? 1 : 0) +
            (choiceQuestRecords[historySelectedDateKey]?.completed ? 1 : 0)
          : 0,
      totalCount: historyCoreRoutineCanComplete ? 2 : 0,
    },
  );
  const historyDateRank = getCompletionRank(historyDateStats.rate);
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
  const fixedQuestMasteryStats = useMemo(
    () => masteryStats.filter((itemStats) => itemStats.questKind === 'fixed'),
    [masteryStats],
  );
  const coreRoutineMasteryStats = useMemo(
    () => masteryStats.filter((itemStats) => itemStats.questKind === 'core'),
    [masteryStats],
  );
  const calendarMonthLabel = monthFormatter.format(calendarMonth);
  const todoMonthLabel = monthFormatter.format(todoMonth);
  const todoMonthDates = useMemo(
    () => getMonthDateCells(todoMonth).filter((date): date is Date => Boolean(date)),
    [todoMonth],
  );
  const scheduleMonthDates = useMemo(
    () => getMonthDateCells(scheduleMonth).filter((date): date is Date => Boolean(date)),
    [scheduleMonth, scheduleRevision],
  );
  const todayScheduleItems = useMemo(
    () => loadDailySchedule(today),
    [scheduleRevision, todayKey, today],
  );
  const yearlyScheduleGroups = useMemo(() => (
    Array.from({ length: 12 }, (_, monthIndex) => {
      const days = getScheduleDateKeys()
        .filter((dateKey) => dateKey.startsWith(`${scheduleYear}-`))
        .map((dateKey) => {
          const date = getDateFromKey(dateKey);
          const scheduleItems = loadDailySchedule(date);

          return {
            date,
            dateKey,
            items: scheduleItems,
          };
        })
        .filter(({ date, items }) => date.getMonth() === monthIndex && items.length > 0);

      return {
        monthIndex,
        days,
      };
    }).filter((group) => group.days.length > 0)
  ), [scheduleRevision, scheduleYear]);
  const recordMonthLabel = monthFormatter.format(recordMonth);
  const recordMonthDates = useMemo(
    () => getMonthDateCells(recordMonth).filter((date): date is Date => Boolean(date)),
    [recordMonth, recordRevision],
  );
  const recordDaySummaries = useMemo(() => (
    recordMonthDates.map((recordDate) => {
      const dateKey = getDateKey(recordDate);
      const holidayName = getHolidayName(recordDate);
      const dayKind = getDateDisplayKind(recordDate);
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
      const advancedEntries = getAdvancedEntriesFromSections(
        removeFixedRoutineItems(getSectionsForTarget(
          templateSettings,
          dateOverrides,
          dateSnapshots,
          resolveDateTarget(
            templateSettings,
            dateOverrides,
            dateSnapshots,
            recordDate,
            todayKey,
          ),
          todayKey,
        )),
      );
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
            : recordView === 'anyMemo'
              ? anyMemoText.length > 0
                ? 1
                : 0
              : recordView === 'advanced'
                ? advancedEntries.length
                : 0;
      const hasRecordContent = recordContentCount > 0;
      const dateTitle = `${recordDate.getMonth() + 1}月${recordDate.getDate()}日（${
        weekdayShortLabels[recordDate.getDay()]
      }${holidayName ? `・${holidayName}` : ''}）`;

      return {
        advancedEntries,
        anyMemoText,
        dateKey,
        dateTitle,
        dayKind,
        hasRecordContent,
        recordContentCount,
        recordDate,
        savedEventEntries,
        savedMemoEntries,
      };
    })
  ), [
    dailyAnyMemo,
    dailyEvent,
    dailyMemo,
    dateOverrides,
    dateSnapshots,
    historyDailyAnyMemo,
    historyDailyEvent,
    historyDailyMemo,
    historySelectedDateKey,
    recordMonthDates,
    recordRevision,
    recordView,
    selectedDateKey,
    templateSettings,
    todayKey,
  ]);
  const visibleRecordDaySummaries = recordDisplayMode === 'withRecords'
    ? recordDaySummaries.filter((summary) => summary.hasRecordContent)
    : recordDaySummaries;
  const anyMemoListItems = useMemo(
    () => getAnyMemoListItems(anyMemoItems),
    [anyMemoItems, recordRevision],
  );
  const sortedAnyMemoFolders = useMemo(
    () => [...anyMemoFolders].sort((first, second) =>
      Date.parse(second.updatedAt) - Date.parse(first.updatedAt),
    ),
    [anyMemoFolders],
  );
  const getAnyMemoFolderPath = (folderId: string | null) => {
    if (!folderId) {
      return [];
    }

    const path: AnyMemoFolder[] = [];
    const visitedIds = new Set<string>();
    let currentFolder = anyMemoFolders.find((folder) => folder.id === folderId) ?? null;

    while (currentFolder && !visitedIds.has(currentFolder.id)) {
      path.unshift(currentFolder);
      visitedIds.add(currentFolder.id);
      currentFolder = currentFolder.parentFolderId
        ? anyMemoFolders.find((folder) => folder.id === currentFolder?.parentFolderId) ?? null
        : null;
    }

    return path;
  };
  const isAnyMemoFolderDescendant = (folderId: string, possibleAncestorId: string) => {
    let currentFolder = anyMemoFolders.find((folder) => folder.id === folderId) ?? null;
    const visitedIds = new Set<string>();

    while (currentFolder?.parentFolderId && !visitedIds.has(currentFolder.id)) {
      if (currentFolder.parentFolderId === possibleAncestorId) {
        return true;
      }

      visitedIds.add(currentFolder.id);
      currentFolder = anyMemoFolders.find((folder) => folder.id === currentFolder?.parentFolderId) ?? null;
    }

    return false;
  };
  const getAnyMemoMoveCandidateFolders = (movingFolderId?: string) =>
    sortedAnyMemoFolders.filter((folder) =>
      movingFolderId
        ? folder.id !== movingFolderId && !isAnyMemoFolderDescendant(folder.id, movingFolderId)
        : true,
    );
  const getAnyMemoFolderDisplayName = (folder: AnyMemoFolder) =>
    getAnyMemoFolderPath(folder.id).map((pathFolder) => pathFolder.name).join(' ＞ ');
  const selectedAnyMemoFolder = useMemo(
    () =>
      anyMemoFolders.find((folder) => folder.id === selectedAnyMemoFolderId) ?? null,
    [anyMemoFolders, selectedAnyMemoFolderId],
  );
  const selectedAnyMemoFolderItems = useMemo(
    () =>
      anyMemoFolderItems
        .filter((item) => item.folderId === selectedAnyMemoFolderId)
        .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt)),
    [anyMemoFolderItems, selectedAnyMemoFolderId],
  );
  const selectedAnyMemoFolderPath = useMemo(
    () => getAnyMemoFolderPath(selectedAnyMemoFolderId),
    [anyMemoFolders, selectedAnyMemoFolderId],
  );
  const visibleAnyMemoFolders = useMemo(
    () =>
      sortedAnyMemoFolders.filter((folder) =>
        selectedAnyMemoFolderId
          ? folder.parentFolderId === selectedAnyMemoFolderId
          : folder.parentFolderId === null,
      ),
    [selectedAnyMemoFolderId, sortedAnyMemoFolders],
  );
  useEffect(() => {
    if (
      !isTodayScheduleView ||
      scheduleView !== 'year' ||
      selectedScheduleYearMonth !== today.getMonth() ||
      getDateKey(scheduleMonth) !== getDateKey(getMonthStart(today))
    ) {
      return;
    }

    const scrollKey = `today-schedule:${getDateKey(scheduleMonth)}`;

    if (scheduleTodayScrollMonthRef.current === scrollKey) {
      return;
    }

    scheduleTodayScrollMonthRef.current = scrollKey;
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`.schedule-day-list [data-date-key="${todayKey}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'auto' });
    });
  }, [isTodayScheduleView, scheduleMonth, scheduleView, selectedScheduleYearMonth, today, todayKey]);

  useEffect(() => {
    if (
      !isTodayScheduleView ||
      scheduleView !== 'list' ||
      scheduleYear !== today.getFullYear()
    ) {
      return;
    }

    const scrollKey = `schedule-list:${scheduleYear}:${todayKey}`;

    if (scheduleListScrollYearRef.current === scrollKey) {
      return;
    }

    scheduleListScrollYearRef.current = scrollKey;
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`.schedule-list-day-button[data-today="true"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'auto' });
    });
  }, [isTodayScheduleView, scheduleView, scheduleYear, today, todayKey]);

  useEffect(() => {
    if (
      !isTodayScheduleView ||
      scheduleView !== 'agenda' ||
      scheduleYear !== today.getFullYear() ||
      yearlyScheduleGroups.length === 0
    ) {
      return;
    }

    const agendaDays = yearlyScheduleGroups.flatMap((group) => group.days);
    const firstUpcomingDay = agendaDays.find((day) => day.dateKey >= todayKey);
    const targetDay = firstUpcomingDay ?? agendaDays[agendaDays.length - 1];

    if (!targetDay) {
      return;
    }

    const scrollKey = `schedule-agenda:${scheduleYear}:${todayKey}:${targetDay.dateKey}`;

    if (scheduleAgendaScrollYearRef.current === scrollKey) {
      return;
    }

    scheduleAgendaScrollYearRef.current = scrollKey;
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-schedule-agenda-date="${targetDay.dateKey}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'auto' });
    });
  }, [isTodayScheduleView, scheduleView, scheduleYear, today, todayKey, yearlyScheduleGroups]);
  useEffect(() => {
    if (!isLibraryRecordView || getDateKey(recordMonth) !== getDateKey(getMonthStart(today))) {
      return;
    }

    const scrollKey = `${page}:${menuView}:${getDateKey(recordMonth)}`;

    if (recordTodayScrollMonthRef.current === scrollKey) {
      return;
    }

    recordTodayScrollMonthRef.current = scrollKey;
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`.records-day-list [data-date-key="${todayKey}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, [isLibraryRecordView, menuView, page, recordMonth, today, todayKey]);
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
      const stats = addFixedRecordQuestStats(
        calculateCompletionStats(daySections, loadCheckedItems(date)),
        getCoreRoutineCompletion(loadDailyMemo(date), loadDailyEvent(date)),
        dateKey <= todayKey,
        {
          completedCount: dateKey <= todayKey
            ? (nightlyNudgeRecords[dateKey]?.completed ? 1 : 0) +
              (choiceQuestRecords[dateKey]?.completed ? 1 : 0)
            : 0,
          totalCount: dateKey <= todayKey ? 2 : 0,
        },
      );
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
        dayKind: getDateDisplayKind(date),
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
    choiceQuestRecords,
    dateOverrides,
    dateSnapshots,
    dailyNudgeRecords,
    nightlyNudgeRecords,
    checkedItems,
    historyCheckedItems,
    historySelectedDateKey,
    rhythmSettings,
    templateSettings,
    todayKey,
  ]);
  const monthlyStampSummary = useMemo(() => {
    const counts = monthlyStampSummaryDefinitions.reduce<Record<MonthlyStampSummaryLevel, number>>(
      (nextCounts, definition) => ({
        ...nextCounts,
        [definition.level]: 0,
      }),
      {} as Record<MonthlyStampSummaryLevel, number>,
    );

    completionCalendarDays.forEach((day) => {
      if (
        !day ||
        !day.shouldShowStamp ||
        !monthlyStampSummaryDefinitions.some((definition) => definition.level === day.rankLevel)
      ) {
        return;
      }

      counts[day.rankLevel as MonthlyStampSummaryLevel] += 1;
    });

    const items = monthlyStampSummaryDefinitions.map((definition) => ({
      ...definition,
      count: counts[definition.level],
    }));

    return {
      items,
      total: items.reduce((total, item) => total + item.count, 0),
    };
  }, [completionCalendarDays]);

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
    const {
      nextArchivedItems,
      nextDateOverrides,
      nextDateSnapshots,
      nextSettings,
    } = migrateRoutineNumbers(templateSettings, dateOverrides, dateSnapshots, archivedItems);

    if (!areObjectsEqual(templateSettings, nextSettings)) {
      setTemplateSettings(nextSettings);
    }

    if (!areObjectsEqual(dateOverrides, nextDateOverrides)) {
      setDateOverrides(nextDateOverrides);
    }

    if (!areObjectsEqual(dateSnapshots, nextDateSnapshots)) {
      setDateSnapshots(nextDateSnapshots);
    }

    if (!areObjectsEqual(archivedItems, nextArchivedItems)) {
      setArchivedItems(nextArchivedItems);
    }
  }, [archivedItems, dateOverrides, dateSnapshots, templateSettings]);

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
      DAILY_QUEST_MASTER_CACHE_STORAGE_KEY,
      JSON.stringify(dailyNudgeCandidates),
    );
  }, [dailyNudgeCandidates]);

  useEffect(() => {
    localStorage.setItem(DAILY_NUDGE_RECORDS_STORAGE_KEY, JSON.stringify(dailyNudgeRecords));
  }, [dailyNudgeRecords]);

  useEffect(() => {
    localStorage.setItem(NIGHTLY_NUDGE_RECORDS_STORAGE_KEY, JSON.stringify(nightlyNudgeRecords));
  }, [nightlyNudgeRecords]);

  useEffect(() => {
    localStorage.setItem(CHOICE_QUEST_RECORDS_STORAGE_KEY, JSON.stringify(choiceQuestRecords));
  }, [choiceQuestRecords]);

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
    setNightlyNudgeRecords((currentRecords) => {
      if (currentRecords[selectedDateKey]) {
        return currentRecords;
      }

      const candidate = selectDailyNudgeCandidate(
        selectedDateKey,
        defaultNightlyNudgeCandidates,
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
  }, [selectedDateKey]);

  useEffect(() => {
    localStorage.setItem(GAME_MODE_STORAGE_KEY, JSON.stringify(gameMode));
  }, [gameMode]);

  useEffect(() => {
    localStorage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify(playerProfile));
  }, [playerProfile]);

  useEffect(() => {
    localStorage.setItem(PLAYER_BADGES_STORAGE_KEY, JSON.stringify(playerBadges));
  }, [playerBadges]);

  useEffect(() => {
    localStorage.setItem(RECORD_DISPLAY_MODE_STORAGE_KEY, JSON.stringify(recordDisplayMode));
  }, [recordDisplayMode]);

  useEffect(() => {
    if (page !== 'library' || menuView !== 'recordAnyMemo') {
      return;
    }

    const focusTimerId = window.setTimeout(() => {
      if (anyMemoTab !== 'memo') {
        return;
      }

      anyMemoInputRef.current?.focus({ preventScroll: true });
      adjustTextareaHeight(anyMemoInputRef.current);
    }, 120);

    return () => window.clearTimeout(focusTimerId);
  }, [anyMemoTab, menuView, page]);

  useEffect(() => {
    if (!isTodayTodoView || todoView !== 'todo') {
      return;
    }

    const focusTimerId = window.setTimeout(() => {
      newTodoInputRef.current?.focus({ preventScroll: true });
      adjustTextareaHeight(newTodoInputRef.current);
    }, 120);

    return () => window.clearTimeout(focusTimerId);
  }, [isTodayTodoView, todoView]);

  useEffect(() => {
    if (!editingDailyRecord) {
      return;
    }

    const focusTimerId = window.setTimeout(() => {
      const textarea = dailyRecordEditTextareaRef.current;

      if (!textarea) {
        return;
      }

      adjustTextareaHeight(textarea);
      textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }, 80);

    return () => window.clearTimeout(focusTimerId);
  }, [editingDailyRecord?.kind, editingDailyRecord?.index]);

  useEffect(() => {
    setEditingDailyRecord(null);
  }, [selectedDateKey]);

  useEffect(() => {
    if (!anyMemoStatusMessage) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setAnyMemoStatusMessage('');
    }, 1800);

    return () => window.clearTimeout(timerId);
  }, [anyMemoStatusMessage]);

  useEffect(() => {
    const hasAnyCompletedQuest = getStoredCheckDateKeys().some((dateKey) =>
      Object.values(loadCheckedItems(getDateFromKey(dateKey))).some(Boolean),
    );
    const hasSavedDailyRecord = (kind: 'memo' | 'events') => {
      const prefix = `hibitin:${kind}:`;

      return Object.keys(localStorage)
        .filter((key) => key.startsWith(prefix))
        .some((key) => {
          const dateKey = key.slice(prefix.length);

          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
            return false;
          }

          const entries = kind === 'memo'
            ? loadDailyMemo(getDateFromKey(dateKey))
            : loadDailyEvent(getDateFromKey(dateKey));

          return entries.some((entry) => entry.saved && hasMeaningfulText(entry.text));
        });
    };

    if (hasAnyCompletedQuest) {
      earnPlayerBadge('first-step');
    }

    if (hasSavedDailyRecord('memo')) {
      earnPlayerBadge('memo-writer');
    }

    if (hasSavedDailyRecord('events')) {
      earnPlayerBadge('event-sprout');
    }

    if (cloudBackupInfo?.updatedAt || lastCloudBackupAt) {
      earnPlayerBadge('cloud-departure', cloudBackupInfo?.updatedAt ?? lastCloudBackupAt ?? undefined);
    }
  }, [checkedItems, cloudBackupInfo?.updatedAt, dailyEvent, dailyMemo, lastCloudBackupAt]);

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

    const timeoutId = window.setTimeout(() => setPointToast(null), 5200);

    return () => window.clearTimeout(timeoutId);
  }, [pointToast]);

  useEffect(() => {
    if (!dailyNudgePointFlash) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setDailyNudgePointFlash(null), 5000);

    return () => window.clearTimeout(timeoutId);
  }, [dailyNudgePointFlash]);

  useEffect(() => {
    if (!nightlyNudgePointFlash) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setNightlyNudgePointFlash(null), 5000);

    return () => window.clearTimeout(timeoutId);
  }, [nightlyNudgePointFlash]);

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
    localStorage.setItem(TODO_ITEMS_STORAGE_KEY, serializeManagedTodos(managedTodos));
  }, [managedTodos]);

  useEffect(() => {
    saveTodoFolders(todoFolders);
  }, [todoFolders]);

  useEffect(() => {
    if (pendingTodoReviews.length === 0) {
      setIsTodoReviewOpen(false);
      setTodoReviewActions({});
      setTodoReviewDismissed(false);
      return;
    }

    setTodoReviewActions((currentActions) => {
      const nextActions = { ...currentActions };

      pendingTodoReviews.forEach((todo) => {
        if (!nextActions[todo.id]) {
          nextActions[todo.id] = 'today';
        }
      });

      Object.keys(nextActions).forEach((todoId) => {
        if (!pendingTodoReviews.some((todo) => todo.id === todoId)) {
          delete nextActions[todoId];
        }
      });

      return nextActions;
    });

    if (!todoReviewDismissed) {
      setIsTodoReviewOpen(true);
    }
  }, [pendingTodoReviews, todoReviewDismissed]);

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
    }, 5800);
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
          itemLabel: '今日のログインクエスト',
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
          itemLabel: '今日のログインクエスト',
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
            itemLabel: '今日のログインクエスト',
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

  const applyPointChangeForNightlyNudge = (
    dateKey: string,
    nextCompleted: boolean,
    record: DailyNudgeRecord,
  ) => {
    const achievementKey = getNightlyNudgePointAchievementKey(dateKey);
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
          itemId: 'nightly-nudge',
          itemLabel: '今日のおやすみクエスト',
          sectionId: 'nightly-nudge',
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
          itemId: 'nightly-nudge',
          itemLabel: '今日のおやすみクエスト',
          sectionId: 'nightly-nudge',
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
            itemLabel: '今日のおやすみクエスト',
          };

          enqueuePointToast(pointFlash);
          setNightlyNudgePointFlash(pointFlash);
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

      setNightlyNudgePointFlash(null);

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

  const toggleNightlyNudgeCompletion = (dateKey: string) => {
    const selectedRecord = nightlyNudgeRecords[dateKey];

    if (!selectedRecord) {
      return;
    }

    const nextCompleted = !selectedRecord.completed;

    applyPointChangeForNightlyNudge(dateKey, nextCompleted, selectedRecord);

    setNightlyNudgeRecords((currentRecords) => {
      const currentRecord = currentRecords[dateKey];

      if (!currentRecord) {
        return currentRecords;
      }

      const celebrationMessage =
        currentRecord.celebrationMessage ??
        nightlyNudgeCelebrationMessages[
          getStableStringHash(`${dateKey}:${currentRecord.candidateId}:nightly`) %
            nightlyNudgeCelebrationMessages.length
        ];

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

  const selectChoiceQuestOption = (dateKey: string, optionId: string) => {
    setChoiceQuestRecords((currentRecords) => {
      const currentRecord = currentRecords[dateKey];

      if (currentRecord?.completed) {
        return currentRecords;
      }

      return {
        ...currentRecords,
        [dateKey]: {
          ...currentRecord,
          completed: false,
          selectedOptionId: optionId,
          selectedAt: new Date().toISOString(),
        },
      };
    });
  };

  const completeChoiceQuest = (dateKey: string) => {
    const currentRecord = choiceQuestRecords[dateKey];
    const selectedOption = choiceQuestOptions.find(
      (option) => option.id === currentRecord?.selectedOptionId,
    );

    if (!currentRecord || currentRecord.completed || !selectedOption) {
      return;
    }

    const achievementKey = getChoiceQuestPointAchievementKey(dateKey);
    const now = new Date().toISOString();
    const pointTargetKind: PointTargetKind = 'normal';
    const pointSetting = gameBalance.pointSettings[pointTargetKind];

    setPlayerEconomy((currentEconomy) => {
      const existingAward = currentEconomy.pointAwards[achievementKey];

      if (existingAward?.active || !pointSetting.enabled) {
        return currentEconomy;
      }

      const points = existingAward?.points ??
        calculateQuestPoints(gameBalance, playerRankProgress.multiplier, pointTargetKind);
      const basePoints = existingAward?.basePoints ?? pointSetting.basePoints;
      const multiplier = existingAward?.multiplier ?? playerRankProgress.multiplier;
      const itemLabel = `選択クエスト：${selectedOption.label}`;
      const nextAward: PointAwardRecord = {
        achievementKey,
        dateKey,
        itemId: 'choice-quest',
        itemLabel,
        sectionId: 'choice-quest',
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
        itemId: 'choice-quest',
        itemLabel,
        sectionId: 'choice-quest',
        type: 'earn',
        points,
        basePoints,
        multiplier,
        createdAt: now,
        reason: selectedOption.label,
      };

      enqueuePointToast({
        id: nextLedgerEntry.id,
        points,
        itemLabel,
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
    });

    setChoiceQuestRecords((currentRecords) => {
      const latestRecord = currentRecords[dateKey];

      if (!latestRecord || latestRecord.completed || latestRecord.selectedOptionId !== selectedOption.id) {
        return currentRecords;
      }

      return {
        ...currentRecords,
        [dateKey]: {
          ...latestRecord,
          completed: true,
          completedAt: now,
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
        reason: '本文削除による固定クエスト未達成',
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

  const getDailyQuestMasterPayload = (candidate: DailyNudgeCandidate) => ({
    slug: candidate.id,
    prompt: candidate.text.trim() || '小さな一歩をひとつ選ぼう',
    completion_message: candidate.completionMessage.trim() || defaultDailyNudgeCompletionMessage,
    category: candidate.category.trim() || 'その他',
    is_active: candidate.enabled,
    sort_order: candidate.order,
  });

  const refreshDailyQuestMaster = async (options: { includeInactive?: boolean } = {}) => {
    if (!supabase) {
      setDailyQuestMasterStatus('cache');
      setDailyQuestMasterMessage('Supabase未設定のため、端末内キャッシュまたは予備候補を使用しています。');
      return;
    }

    setDailyQuestMasterStatus('loading');

    try {
      let query = supabase
        .from('daily_quest_master')
        .select('id, slug, prompt, completion_message, category, is_active, sort_order, created_at, updated_at')
        .order('sort_order', { ascending: true });

      if (!options.includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      const candidates = ((data ?? []) as DailyQuestMasterRow[])
        .map(mapDailyQuestMasterRowToCandidate)
        .filter((candidate) => !retiredDailyNudgeCandidateIds.has(candidate.id))
        .sort((first, second) => first.order - second.order);
      const activeCandidates = candidates.filter((candidate) => candidate.enabled);

      if (options.includeInactive) {
        setDailyQuestAdminCandidates(candidates);
      }

      if (activeCandidates.length > 0) {
        setDailyNudgeCandidates(activeCandidates);
        localStorage.setItem(DAILY_QUEST_MASTER_CACHE_STORAGE_KEY, JSON.stringify(activeCandidates));
        setDailyQuestMasterStatus('success');
        setDailyQuestMasterMessage('全プレイヤー共通のログインクエストを取得しました。');
        return;
      }

      const cachedCandidates = loadDailyQuestMasterCache();
      setDailyNudgeCandidates(cachedCandidates);
      setDailyQuestMasterStatus('cache');
      setDailyQuestMasterMessage('共通候補が空のため、端末内キャッシュまたは予備候補を使用しています。');
    } catch (error) {
      console.warn('Daily quest master fetch failed:', error);
      const cachedCandidates = loadDailyQuestMasterCache();
      setDailyNudgeCandidates(cachedCandidates);
      setDailyQuestMasterStatus('cache');
      setDailyQuestMasterMessage('共通候補を取得できませんでした。端末内キャッシュまたは予備候補を使用しています。');
    }
  };

  const refreshAdminStatus = async (user: User | null) => {
    if (!supabase || !user) {
      setIsAdminUser(false);
      setDailyQuestAdminCandidates([]);
      return;
    }

    setIsAdminChecking(true);

    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      const nextIsAdmin = Boolean(data);
      setIsAdminUser(nextIsAdmin);

      if (nextIsAdmin) {
        void refreshDailyQuestMaster({ includeInactive: true });
      } else {
        setDailyQuestAdminCandidates([]);
      }
    } catch (error) {
      console.warn('Admin status check failed:', error);
      setIsAdminUser(false);
      setDailyQuestAdminCandidates([]);
    } finally {
      setIsAdminChecking(false);
    }
  };

  const updateDailyQuestAdminCandidate = (
    candidateId: string,
    field: keyof Pick<
      DailyNudgeCandidate,
      'text' | 'completionMessage' | 'category' | 'enabled'
    >,
    value: string | boolean,
  ) => {
    setDailyQuestAdminCandidates((currentCandidates) =>
      currentCandidates.map((candidate) =>
        candidate.id === candidateId
          ? { ...candidate, [field]: value }
          : candidate,
      ),
    );
  };

  const saveDailyQuestMasterCandidate = async (candidate: DailyNudgeCandidate) => {
    if (!supabase || !authUser || !isAdminUser) {
      setDailyQuestMasterMessage('管理者ログインが必要です。');
      return;
    }

    setIsDailyQuestMasterBusy(true);
    setDailyQuestMasterMessage('');

    try {
      const { data, error } = await supabase
        .from('daily_quest_master')
        .upsert(
          {
            ...getDailyQuestMasterPayload(candidate),
            created_by: authUser.id,
            updated_by: authUser.id,
          },
          { onConflict: 'slug' },
        )
        .select('id, slug, prompt, completion_message, category, is_active, sort_order, created_at, updated_at')
        .single();

      if (error) {
        throw error;
      }

      const savedCandidate = mapDailyQuestMasterRowToCandidate(data as DailyQuestMasterRow, 0);

      setDailyQuestAdminCandidates((currentCandidates) =>
        currentCandidates
          .map((currentCandidate) =>
            currentCandidate.id === candidate.id ? savedCandidate : currentCandidate,
          )
          .sort((first, second) => first.order - second.order),
      );
      await refreshDailyQuestMaster({ includeInactive: true });
      setDailyQuestMasterMessage('全プレイヤー共通のログインクエストを更新しました。');
    } catch (error) {
      console.warn('Daily quest master save failed:', error);
      setDailyQuestMasterMessage('更新に失敗しました。変更内容を確認してください。');
    } finally {
      setIsDailyQuestMasterBusy(false);
    }
  };

  const moveDailyQuestAdminCandidate = async (candidateId: string, direction: -1 | 1) => {
    if (!supabase || !authUser || !isAdminUser || isDailyQuestMasterBusy) {
      return;
    }

    const previousCandidates = dailyQuestAdminCandidates;
    const orderedCandidates = [...previousCandidates].sort(
      (first, second) => first.order - second.order,
    );
    const currentIndex = orderedCandidates.findIndex((candidate) => candidate.id === candidateId);
    const nextIndex = currentIndex + direction;

    if (
      currentIndex === -1 ||
      nextIndex < 0 ||
      nextIndex >= orderedCandidates.length
    ) {
      return;
    }

    const nextCandidates = [...orderedCandidates];
    const [movedCandidate] = nextCandidates.splice(currentIndex, 1);

    nextCandidates.splice(nextIndex, 0, movedCandidate);

    const reorderedCandidates = nextCandidates.map((candidate, index) => ({
      ...candidate,
      order: (index + 1) * 10,
    }));

    setDailyQuestAdminCandidates(reorderedCandidates);
    setIsDailyQuestMasterBusy(true);
    setDailyQuestMasterMessage('');

    try {
      const { error } = await supabase
        .from('daily_quest_master')
        .upsert(
          reorderedCandidates.map((candidate) => ({
            ...getDailyQuestMasterPayload(candidate),
            created_by: authUser.id,
            updated_by: authUser.id,
          })),
          { onConflict: 'slug' },
        );

      if (error) {
        throw error;
      }

      await refreshDailyQuestMaster({ includeInactive: true });
      setDailyQuestMasterMessage('並び順を保存しました。');
    } catch (error) {
      console.warn('Daily quest master reorder failed:', error);
      setDailyQuestAdminCandidates(previousCandidates);
      setDailyQuestMasterMessage('並び替えの保存に失敗しました。');
    } finally {
      setIsDailyQuestMasterBusy(false);
    }
  };

  const addDailyQuestAdminCandidate = () => {
    const newCandidateId = createRoutineId('daily-quest');

    setDailyQuestAdminCandidates((currentCandidates) => [
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

  const deleteDailyQuestAdminCandidate = async (candidateId: string) => {
    if (!supabase || !authUser || !isAdminUser) {
      setDailyQuestMasterMessage('管理者ログインが必要です。');
      return;
    }

    const candidate = dailyQuestAdminCandidates.find(
      (currentCandidate) => currentCandidate.id === candidateId,
    );

    if (!candidate) {
      return;
    }

    const shouldDelete = window.confirm(
      `「${candidate.text}」を共通候補から削除しますか？過去の日付に保存済みのログインクエストは残ります。`,
    );

    if (!shouldDelete) {
      return;
    }

    setIsDailyQuestMasterBusy(true);
    setDailyQuestMasterMessage('');

    try {
      const { error } = await supabase
        .from('daily_quest_master')
        .delete()
        .eq('slug', candidate.id);

      if (error) {
        throw error;
      }

      await refreshDailyQuestMaster({ includeInactive: true });
      setDailyQuestMasterMessage('全プレイヤー共通のログインクエストを更新しました。');
    } catch (error) {
      console.warn('Daily quest master delete failed:', error);
      setDailyQuestMasterMessage('削除に失敗しました。');
    } finally {
      setIsDailyQuestMasterBusy(false);
    }
  };

  const toggleItemNoteEditor = (dateKey: string, itemId: string) => {
    setIsRankPanelOpen(false);
    setNoteEditorTarget((currentTarget) =>
      currentTarget?.dateKey === dateKey && currentTarget.itemId === itemId
        ? null
        : { dateKey, itemId },
    );
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

  const completeFixedOpenQuest = (itemId: 'fixed-schedule-check' | 'fixed-todo-check') => {
    const storedChecks = loadCheckedItems(today);

    if (storedChecks[itemId]) {
      return;
    }

    const nextChecks = {
      ...storedChecks,
      [itemId]: true,
    };

    localStorage.setItem(getChecksStorageKey(today), JSON.stringify(nextChecks));
    applyPointChangeForItemCheck(todayKey, itemId, true, todayDisplaySections);

    if (selectedDateKey === todayKey) {
      setCheckedItems(nextChecks);
    }

    if (historySelectedDate && historySelectedDateKey === todayKey) {
      setHistoryCheckedItems(nextChecks);
    }
  };

  useEffect(() => {
    if (isMenuScheduleView) {
      completeFixedOpenQuest('fixed-schedule-check');
    }

    if (isMenuTodoView) {
      completeFixedOpenQuest('fixed-todo-check');
    }
  }, [isMenuScheduleView, isMenuTodoView, todayKey]);

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

  const startCommonTimer = (durationSeconds: number) => {
    if (durationSeconds <= 0) {
      return;
    }

    setTimerAlertSilenced(true);
    alertedFinishedTimerIdRef.current = null;
    setPausedTimers((currentTimers) => {
      const nextTimers = { ...currentTimers };

      delete nextTimers[COMMON_TIMER_ITEM_ID];

      return nextTimers;
    });
    setActiveTimer(createRunningTimer(
      COMMON_TIMER_ITEM_ID,
      'タイマー',
      durationSeconds,
      durationSeconds,
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
    setDraggedItemId(null);
    setEditingItemId(null);
    setEditingLabel('');
    setRoutineDrafts({});
    routineDraftComposingSectionsRef.current.clear();
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
    setDraggedItemId(null);
    setEditingItemId(null);
    setEditingLabel('');
    setRoutineDrafts({});
    routineDraftComposingSectionsRef.current.clear();
  };

  const canAddRoutineToSection = (sectionId: string) => {
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
        return false;
      }
    }

    return true;
  };

  const addRoutine = (sectionId: string) => {
    if (!canAddRoutineToSection(sectionId)) {
      setIsQuestSlotGuideOpen(true);
      setRoutineDrafts((currentDrafts) => {
        if (!Object.prototype.hasOwnProperty.call(currentDrafts, sectionId)) {
          return currentDrafts;
        }

        const nextDrafts = { ...currentDrafts };

        delete nextDrafts[sectionId];

        return nextDrafts;
      });
      return;
    }

    setRoutineDrafts((currentDrafts) => ({
      ...currentDrafts,
      [sectionId]: currentDrafts[sectionId] ?? '',
    }));
    setEditingItemId(null);
    setEditingLabel('');
  };

  const goToQuestSlotShop = () => {
    setIsQuestSlotGuideOpen(false);
    setPage('library');
    setMenuView('shop');
    window.setTimeout(() => {
      document
        .getElementById('quest-slot-shop-section')
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 80);
  };

  const updateRoutineDraft = (sectionId: string, value: string) => {
    setRoutineDrafts((currentDrafts) => ({
      ...currentDrafts,
      [sectionId]: value,
    }));
  };

  const getNextCoreRoutineNumber = () =>
    migrateRoutineNumbers(templateSettings, dateOverrides, dateSnapshots, archivedItems)
      .nextRoutineNumber;

  const discardRoutineDraft = (sectionId: string) => {
    routineDraftComposingSectionsRef.current.delete(sectionId);
    setRoutineDrafts((currentDrafts) => {
      const nextDrafts = { ...currentDrafts };

      delete nextDrafts[sectionId];

      return nextDrafts;
    });
  };

  const commitRoutineDraft = (sectionId: string, rawValue = routineDrafts[sectionId] ?? '') => {
    if (routineDraftComposingSectionsRef.current.has(sectionId)) {
      return;
    }

    const nextItemLabel = rawValue.trim();

    if (!nextItemLabel) {
      discardRoutineDraft(sectionId);
      return;
    }

    if (!canAddRoutineToSection(sectionId)) {
      discardRoutineDraft(sectionId);
      return;
    }

    const newItemId = createRoutineId(sectionId);
    const routineNumber = isCoreRoutineSectionId(sectionId)
      ? getNextCoreRoutineNumber()
      : undefined;

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
              label: nextItemLabel,
              order: nextOrder,
              source: 'user',
              createdAt: new Date().toISOString(),
              routineNumber,
            },
          ],
        };
      }),
    );
    discardRoutineDraft(sectionId);
    setEditingItemId(null);
    setEditingLabel('');
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
          const retiredAt = new Date().toISOString();

          archivedItem = {
            item: { ...itemToArchive, retiredAt },
            sectionId: section.id,
            sectionTitle: section.title,
            target: deleteTarget,
            archivedAt: retiredAt,
            retiredAt,
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

  const updateRhythmConfig = <K extends keyof RhythmConfig>(
    template: TemplateKind,
    field: K,
    value: RhythmConfig[K],
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
    if (item.fixedKind !== 'wake' && item.fixedKind !== 'sleep') {
      return;
    }

    const targetTemplate = page === 'today' ? selectedDateTemplate : editTargetKey;
    const field = item.fixedKind === 'wake' ? 'wakeTime' : 'sleepTime';

    updateRhythmConfig(targetTemplate, field, time);
  };

  const saveDisplayedRoutineAsTemplate = (template: TemplateKind) => {
    const label = getTemplateLabel(template);
    const shouldSave = window.confirm(
      `現在表示しているチェック表を、今後使う${label}のクエストに設定しますか？過去の日付には影響しません。`,
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

  const createBackupFile = (): BackupFile | null => {
    try {
      return createBackupFromCurrentStorage();
    } catch {
      setBackupMessage('');
      window.alert('保存データの一部を読み取れなかったため、バックアップを作成できませんでした。');
      return null;
    }
  };

  const downloadBackupFile = (backup: BackupFile, message?: string) => {
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
    setBackupMessage(message ?? 'バックアップを書き出しました。ダウンロードが始まらない場合は下のリンクを押してください。');
  };

  const exportBackup = () => {
    const backup = createBackupFile();

    if (!backup) {
      return;
    }

    downloadBackupFile(backup);
  };

  const refreshAutoBackupList = async () => {
    try {
      setAutoBackups(await loadAutoBackupRecords());
    } catch {
      setAutoBackupMessage('自動バックアップ一覧を読み込めませんでした。');
    }
  };

  const createAutoBackupNow = async (message = '自動バックアップを作成しました。') => {
    try {
      const result = await saveAutoBackupFromCurrentStorage();

      setAutoBackups(result.records);
      setAutoBackupMessage(result.created ? message : '前回と同じ内容のため、新しい自動バックアップは作成しませんでした。');
    } catch {
      setAutoBackupMessage('自動バックアップを保存できませんでした。端末の空き容量やブラウザ設定を確認してください。');
    }
  };

  const refreshCloudBackupInfo = async (
    userId = authUser?.id,
  ): Promise<CloudBackupLookupResult> => {
    if (!supabase || !userId) {
      setCloudBackupInfo(null);
      return { status: 'failed' };
    }

    setIsCloudBackupChecking(true);

    try {
      const { data, error } = await supabase
        .from('hibitin_backups')
        .select('backup_data, backup_version, data_count, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        setCloudBackupInfo(null);
        cloudBackupHashRef.current = null;
        setCloudBackupMessage('クラウドバックアップはまだありません。');
        return { status: 'missing' };
      }

      const row = data as CloudBackupRow;

      if (
        typeof row.updated_at !== 'string' ||
        typeof row.data_count !== 'number' ||
        typeof row.backup_version !== 'number' ||
        !isBackupFile(row.backup_data)
      ) {
        throw new Error('Invalid cloud backup metadata.');
      }

      cloudBackupHashRef.current = getBackupContentHash(row.backup_data);

      const backupInfo = {
        updatedAt: row.updated_at,
        dataCount: row.data_count,
        backupVersion: row.backup_version,
      };

      setCloudBackupInfo(backupInfo);

      if (cloudBackupMessage === 'クラウドバックアップはまだありません。') {
        setCloudBackupMessage('');
      }

      return {
        status: 'found',
        info: backupInfo,
      };
    } catch (error) {
      console.warn('Cloud backup metadata fetch failed:', error);
      setCloudBackupInfo(null);
      setCloudBackupMessage('クラウドバックアップの確認に失敗しました。');
      return { status: 'failed' };
    } finally {
      setIsCloudBackupChecking(false);
    }
  };

  const uploadCloudBackup = async (
    options: {
      manual?: boolean;
      force?: boolean;
      initial?: boolean;
    } = {},
  ) => {
    if (!supabase) {
      setCloudBackupStatus('failed');
      setCloudBackupMessage('Supabase接続が設定されていません。');
      return false;
    }

    const uploadUser = authUserRef.current;

    if (!uploadUser) {
      if (options.manual) {
        setCloudBackupStatus('idle');
        setCloudBackupMessage('クラウド保存にはログインが必要です。');
      }

      return false;
    }

    const backup = createBackupFromCurrentStorage();
    const contentHash = getBackupContentHash(backup);

    if (!options.force && cloudBackupHashRef.current === contentHash) {
      setCloudBackupStatus('success');

      if (options.manual) {
        setCloudBackupMessage('クラウドバックアップは最新です。');
      }

      hasPendingCloudBackupRef.current = false;
      return true;
    }

    if (!window.navigator.onLine) {
      hasPendingCloudBackupRef.current = true;
      setCloudBackupStatus('pending');
      setCloudBackupMessage('オフラインのため、クラウド保存は通信復帰後に再試行します。端末内データは保存されています。');
      return false;
    }

    if (options.manual) {
      setCloudBackupStatus('saving');
      setCloudBackupMessage('端末内バックアップを作成しています。');

      try {
        await saveAutoBackupFromCurrentStorage({ force: true });
      } catch (error) {
        console.warn('Cloud backup safety auto backup failed:', error);
        setCloudBackupStatus('failed');
        setCloudBackupMessage('端末内バックアップを作成できなかったため、クラウド保存を中止しました。');
        return false;
      }
    } else {
      setCloudBackupStatus('saving');
      setCloudBackupMessage(options.initial
        ? '最初のクラウドバックアップを作成中…'
        : 'クラウドへ自動バックアップしています。');
    }

    try {
      const updatedAt = new Date().toISOString();
      const dataCount = Object.keys(backup.data.storage).length;
      const { error } = await supabase
        .from('hibitin_backups')
        .upsert(
          {
            user_id: uploadUser.id,
            backup_data: backup,
            backup_version: backup.backupVersion,
            data_count: dataCount,
            updated_at: updatedAt,
          },
          {
            onConflict: 'user_id',
          },
        );

      if (error) {
        throw error;
      }

      cloudBackupHashRef.current = contentHash;
      hasPendingCloudBackupRef.current = false;
      setLastCloudBackupAt(updatedAt);
      setCloudBackupInfo({
        updatedAt,
        dataCount,
        backupVersion: backup.backupVersion,
      });
      setCloudBackupStatus('success');
      setCloudBackupMessage(options.initial
        ? '最初のクラウドバックアップを保存しました。'
        : options.manual
          ? 'クラウドへバックアップしました。'
          : 'クラウドへ自動バックアップしました。');
      return true;
    } catch (error) {
      console.warn('Cloud backup failed:', error);
      const shouldWaitForOnline =
        !window.navigator.onLine ||
        (error instanceof Error && /fetch|network|offline|failed to fetch/i.test(error.message));

      hasPendingCloudBackupRef.current = shouldWaitForOnline;
      setCloudBackupStatus(shouldWaitForOnline ? 'pending' : 'failed');
      setCloudBackupMessage(shouldWaitForOnline
        ? '通信できなかったため、クラウド保存は保留中です。端末内データは保存されています。'
        : options.initial
          ? '初回クラウド保存に失敗しました。端末データはそのまま残っています。'
          : 'クラウド保存に失敗しました。端末データはそのまま残っています。');
      return false;
    }
  };

  const saveCloudBackup = async () => {
    await uploadCloudBackup({
      manual: true,
      force: true,
    });
  };

  const runInitialCloudBackup = async (userId: string) => {
    const currentUser = authUserRef.current;

    if (
      isInitialCloudBackupRunningRef.current ||
      !currentUser ||
      currentUser.id !== userId
    ) {
      return;
    }

    const localDataCount = Object.keys(collectHibitinStorage()).length;

    if (localDataCount === 0) {
      return;
    }

    if (!window.navigator.onLine) {
      pendingInitialCloudBackupUserIdRef.current = userId;
      initialCloudBackupAttemptedUserIdsRef.current.delete(userId);
      hasPendingCloudBackupRef.current = true;
      setCloudBackupStatus('pending');
      setCloudBackupMessage('オフラインのため、最初のクラウドバックアップは通信復帰後に再試行します。端末内データは保存されています。');
      return;
    }

    isInitialCloudBackupRunningRef.current = true;

    try {
      const latestCloudState = await refreshCloudBackupInfo(userId);

      if (latestCloudState.status !== 'missing') {
        if (latestCloudState.status === 'failed' && !window.navigator.onLine) {
          pendingInitialCloudBackupUserIdRef.current = userId;
          initialCloudBackupAttemptedUserIdsRef.current.delete(userId);
          hasPendingCloudBackupRef.current = true;
          setCloudBackupStatus('pending');
          setCloudBackupMessage('オフラインのため、最初のクラウドバックアップは通信復帰後に再試行します。端末内データは保存されています。');
        }

        return;
      }

      pendingInitialCloudBackupUserIdRef.current = null;
      setCloudBackupStatus('saving');
      setCloudBackupMessage('最初のクラウドバックアップを作成中…');

      try {
        const result = await saveAutoBackupFromCurrentStorage({ force: true });
        setAutoBackups(result.records);
      } catch (error) {
        console.warn('Initial cloud backup safety auto backup failed:', error);
        setCloudBackupStatus('failed');
        setCloudBackupMessage('初回クラウド保存に失敗しました。端末データはそのまま残っています。');
        return;
      }

      await uploadCloudBackup({
        initial: true,
      });
    } finally {
      isInitialCloudBackupRunningRef.current = false;
    }
  };

  const scheduleInitialCloudBackup = (userId: string) => {
    if (initialCloudBackupAttemptedUserIdsRef.current.has(userId)) {
      return;
    }

    initialCloudBackupAttemptedUserIdsRef.current.add(userId);

    if (initialCloudBackupTimerIdRef.current !== null) {
      window.clearTimeout(initialCloudBackupTimerIdRef.current);
    }

    initialCloudBackupTimerIdRef.current = window.setTimeout(() => {
      initialCloudBackupTimerIdRef.current = null;
      void runInitialCloudBackup(userId);
    }, CLOUD_AUTO_BACKUP_DELAY_MS);
  };

  const openCloudRestoreConfirm = async () => {
    if (!authUser) {
      setCloudBackupMessage('クラウドバックアップからの復元にはログインが必要です。');
      return;
    }

    const backupInfo = await refreshCloudBackupInfo(authUser.id);

    if (backupInfo.status !== 'found') {
      return;
    }

    setIsCloudRestoreConfirmOpen(true);
  };

  const restoreCloudBackup = async () => {
    if (!supabase || !authUser) {
      setCloudBackupMessage('クラウドバックアップからの復元にはログインが必要です。');
      return;
    }

    setIsCloudRestoreBusy(true);
    setCloudBackupMessage('クラウドバックアップを確認中…');

    try {
      const { data, error } = await supabase
        .from('hibitin_backups')
        .select('backup_data, backup_version, data_count, updated_at')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        setCloudBackupMessage('クラウドバックアップはまだありません。');
        return;
      }

      const row = data as CloudBackupRow;

      if (!isBackupFile(row.backup_data)) {
        throw new Error('Invalid cloud backup data.');
      }

      const safetyBackup = createBackupFile();

      if (!safetyBackup) {
        setCloudBackupMessage('復元前バックアップを作成できなかったため、復元を中止しました。');
        return;
      }

      downloadBackupFile(
        safetyBackup,
        '復元前に現在データをJSONファイルとして書き出しました。復元後に画面を再読み込みします。',
      );

      await saveAutoBackupFromCurrentStorage({ force: true });
      await new Promise((resolve) => {
        window.setTimeout(resolve, 100);
      });

      try {
        restoreStorageFromBackup(row.backup_data);
      } catch (restoreError) {
        console.warn('Cloud backup restore failed after safety backup:', restoreError);
        restoreStorageFromBackup(safetyBackup);
        throw restoreError;
      }

      setCloudBackupMessage('クラウドバックアップから復元しました。');
      window.location.reload();
    } catch (error) {
      console.warn('Cloud backup restore failed:', error);
      setCloudBackupMessage('クラウドバックアップの復元に失敗しました。端末データは変更されていません。');
    } finally {
      setIsCloudRestoreBusy(false);
      setIsCloudRestoreConfirmOpen(false);
    }
  };

  const restoreStorageFromBackup = (backup: BackupFile) => {
    Array.from({ length: window.localStorage.length }, (_, index) =>
      window.localStorage.key(index),
    )
      .filter((key): key is string => key !== null && isHibitinStorageKey(key))
      .forEach((key) => window.localStorage.removeItem(key));

    Object.entries(backup.data.storage).forEach(([key, value]) => {
      window.localStorage.setItem(key, serializeRestoredStorageValue(key, value));
    });
  };

  const restoreAutoBackup = async (record: AutoBackupRecord) => {
    if (!isAutoBackupRecord(record)) {
      window.alert('壊れた自動バックアップのため、復元しませんでした。');
      return;
    }

    const shouldRestore = window.confirm(
      'このバックアップへ復元しますか？ 現在のデータは先に書き出されます。',
    );

    if (!shouldRestore) {
      return;
    }

    const safetyBackup = createBackupFile();

    if (!safetyBackup) {
      window.alert('現在データの自動バックアップを作成できなかったため、復元を中止しました。');
      return;
    }

    downloadBackupFile(
      safetyBackup,
      '復元前に現在データを書き出しました。復元後に画面を再読み込みします。',
    );

    await new Promise((resolve) => {
      window.setTimeout(resolve, 100);
    });

    restoreStorageFromBackup(record);
    window.location.reload();
  };

  const removeAutoBackup = async (record: AutoBackupRecord) => {
    const shouldDelete = window.confirm('この自動バックアップを削除しますか？');

    if (!shouldDelete) {
      return;
    }

    try {
      await deleteAutoBackupRecord(record.id);
      await refreshAutoBackupList();
      setAutoBackupMessage('自動バックアップを削除しました。');
    } catch {
      setAutoBackupMessage('自動バックアップを削除できませんでした。');
    }
  };

  const scheduleCloudBackup = () => {
    if (!authUserRef.current) {
      return;
    }

    hasPendingCloudBackupRef.current = true;

    if (cloudBackupTimerIdRef.current !== null) {
      window.clearTimeout(cloudBackupTimerIdRef.current);
    }

    if (!window.navigator.onLine) {
      setCloudBackupStatus('pending');
      setCloudBackupMessage('オフラインのため、クラウド保存は通信復帰後に再試行します。端末内データは保存されています。');
      return;
    }

    cloudBackupTimerIdRef.current = window.setTimeout(() => {
      cloudBackupTimerIdRef.current = null;
      void uploadCloudBackup();
    }, CLOUD_AUTO_BACKUP_DELAY_MS);
  };

  scheduleCloudBackupRef.current = scheduleCloudBackup;

  useEffect(() => {
    void refreshAutoBackupList();
  }, []);

  useEffect(() => {
    let backupTimerId: number | null = null;

    const scheduleAutomaticBackup = () => {
      if (backupTimerId !== null) {
        window.clearTimeout(backupTimerId);
      }

      backupTimerId = window.setTimeout(() => {
        void saveAutoBackupFromCurrentStorage()
          .then((result) => {
            setAutoBackups(result.records);

            if (result.created) {
              setAutoBackupMessage('自動バックアップを保存しました。');
            }
          })
          .catch(() => {
            setAutoBackupMessage('自動バックアップを保存できませんでした。端末の空き容量やブラウザ設定を確認してください。');
          });
      }, AUTO_BACKUP_DELAY_MS);
    };

    const originalSetItem = Storage.prototype.setItem;
    const originalRemoveItem = Storage.prototype.removeItem;

    Storage.prototype.setItem = function setItemWithAutoBackup(key, value) {
      const previousValue = this === window.localStorage && isHibitinStorageKey(key)
        ? this.getItem(key)
        : null;

      originalSetItem.call(this, key, value);

      if (
        this === window.localStorage &&
        isHibitinStorageKey(key) &&
        previousValue !== value
      ) {
        scheduleAutomaticBackup();
        scheduleCloudBackupRef.current();
      }
    };

    Storage.prototype.removeItem = function removeItemWithAutoBackup(key) {
      const hadValue = this === window.localStorage && isHibitinStorageKey(key)
        ? this.getItem(key) !== null
        : false;

      originalRemoveItem.call(this, key);

      if (hadValue) {
        scheduleAutomaticBackup();
        scheduleCloudBackupRef.current();
      }
    };

    return () => {
      if (backupTimerId !== null) {
        window.clearTimeout(backupTimerId);
      }

      Storage.prototype.setItem = originalSetItem;
      Storage.prototype.removeItem = originalRemoveItem;
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      return undefined;
    }

    let isMounted = true;

    void supabase.auth.getUser().then(({ data, error }) => {
      if (error && error.message !== 'Auth session missing!') {
        console.warn('Supabase user restore failed:', error.message);
      }

      if (isMounted) {
        setAuthUser(data.user ?? null);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void refreshDailyQuestMaster();
  }, []);

  useEffect(() => {
    authUserRef.current = authUser;
    void refreshAdminStatus(authUser);

    if (!authUser) {
      if (cloudBackupTimerIdRef.current !== null) {
        window.clearTimeout(cloudBackupTimerIdRef.current);
        cloudBackupTimerIdRef.current = null;
      }

      if (initialCloudBackupTimerIdRef.current !== null) {
        window.clearTimeout(initialCloudBackupTimerIdRef.current);
        initialCloudBackupTimerIdRef.current = null;
      }

      hasPendingCloudBackupRef.current = false;
      cloudBackupHashRef.current = null;
      pendingInitialCloudBackupUserIdRef.current = null;
      initialCloudBackupAttemptedUserIdsRef.current.clear();
      setCloudBackupInfo(null);
      setLastCloudBackupAt(null);
      setCloudBackupStatus('idle');
      return;
    }

    void refreshCloudBackupInfo(authUser.id).then((result) => {
      if (result.status === 'missing') {
        scheduleInitialCloudBackup(authUser.id);
      }
    });
  }, [authUser]);

  useEffect(() => {
    const retryPendingCloudBackup = () => {
      const pendingInitialUserId = pendingInitialCloudBackupUserIdRef.current;

      if (
        pendingInitialUserId &&
        authUserRef.current &&
        authUserRef.current.id === pendingInitialUserId
      ) {
        scheduleInitialCloudBackup(pendingInitialUserId);
        return;
      }

      if (hasPendingCloudBackupRef.current && authUserRef.current) {
        scheduleCloudBackupRef.current();
      }
    };

    const markCloudBackupPending = () => {
      if (
        (hasPendingCloudBackupRef.current || pendingInitialCloudBackupUserIdRef.current) &&
        authUserRef.current
      ) {
        setCloudBackupStatus('pending');
        setCloudBackupMessage('オフラインのため、クラウド保存は通信復帰後に再試行します。端末内データは保存されています。');
      }
    };

    window.addEventListener('online', retryPendingCloudBackup);
    window.addEventListener('offline', markCloudBackupPending);

    return () => {
      window.removeEventListener('online', retryPendingCloudBackup);
      window.removeEventListener('offline', markCloudBackupPending);
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSupabaseConnectionStatus('unconfigured');
      return;
    }

    const controller = new AbortController();

    setSupabaseConnectionStatus('checking');

    void fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/health`, {
      headers: {
        apikey: supabasePublishableKey,
      },
      signal: controller.signal,
    })
      .then((response) => {
        setSupabaseConnectionStatus(response.ok ? 'connected' : 'failed');
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        console.warn('Supabase connection check failed:', error);
        setSupabaseConnectionStatus('failed');
      });

    return () => {
      controller.abort();
    };
  }, []);

  const handleAuthAction = async (mode: AuthMode) => {
    if (!supabase) {
      setAuthMessage('クラウド機能はまだ設定されていません。');
      return;
    }

    const email = authEmail.trim();

    if (!email) {
      setAuthMessage('メールアドレスを入力してください。');
      return;
    }

    if (authPassword.length < 6) {
      setAuthMessage('パスワードは6文字以上で入力してください。');
      return;
    }

    setIsAuthBusy(true);
    setAuthMode(mode);
    setAuthMessage('');

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: authPassword,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });

        if (error) {
          throw error;
        }

        setAuthMessage(
          data.session
            ? 'アカウントを作成し、ログインしました。'
            : '確認メールを送信しました。メール内のリンクを開いてください。',
        );
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: authPassword,
      });

      if (error) {
        throw error;
      }

      setAuthMessage('ログインしました。');
    } catch (error) {
      console.warn('Supabase auth failed:', error);
      setAuthMessage(error instanceof Error
        ? getAuthErrorMessage(error.message)
        : 'しばらくしてから再度お試しください。');
    } finally {
      setIsAuthBusy(false);
    }
  };

  const sendPasswordResetEmail = async () => {
    if (!supabase) {
      setAuthMessage('クラウド機能はまだ設定されていません。');
      return;
    }

    const email = authEmail.trim();

    if (!email) {
      setAuthMessage('メールアドレスを入力してください。');
      return;
    }

    setIsAuthBusy(true);
    setAuthMessage('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });

      if (error) {
        throw error;
      }

      setAuthMessage('パスワード再設定メールを送信しました。');
    } catch (error) {
      console.warn('Supabase password reset failed:', error);
      setAuthMessage(error instanceof Error
        ? getAuthErrorMessage(error.message)
        : 'しばらくしてから再度お試しください。');
    } finally {
      setIsAuthBusy(false);
    }
  };

  const signOutAccount = async () => {
    if (!supabase) {
      setAuthMessage('クラウド機能はまだ設定されていません。');
      return;
    }

    setIsAuthBusy(true);
    setAuthMessage('');

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      setAuthMessage('ログアウトしました。端末内のhibitinデータはそのまま残っています。');
    } catch (error) {
      console.warn('Supabase sign out failed:', error);
      setAuthMessage('ログアウトできませんでした。しばらくしてから再度お試しください。');
    } finally {
      setIsAuthBusy(false);
    }
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

      const shouldRestore = window.confirm('本当に復元しますか？');

      if (!shouldRestore) {
        return;
      }

      const safetyBackup = createBackupFile();

      if (!safetyBackup) {
        window.alert('現在データの自動バックアップを作成できなかったため、復元を中止しました。');
        return;
      }

      downloadBackupFile(
        safetyBackup,
        '復元前に現在データの自動バックアップを書き出しました。復元後に画面を再読み込みします。',
      );

      await new Promise((resolve) => {
        window.setTimeout(resolve, 100);
      });

      restoreStorageFromBackup(parsedBackup);
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
      '最終確認です。クエスト、チェック履歴、記録、メモ、タイマー、実績、削除済みクエストの内部記録を含む全データを削除します。よろしいですか？',
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
    setDraggedItemId(null);
    setEditingItemId(null);
    setEditingLabel('');
    setRoutineDrafts({});
    routineDraftComposingSectionsRef.current.clear();
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

  const updateManagedTodoText = (
    id: string,
    _status: ActiveTodoStatus,
    text: string,
  ) => {
    setManagedTodos((currentTodos) => {
      const timestamp = new Date().toISOString();

      if (id.startsWith('new-')) {
        return currentTodos;
      }

      return currentTodos.map((todo) =>
        todo.id === id
          ? {
              ...todo,
              text,
              completed: todo.completed && text.trim().length > 0,
              updatedAt: timestamp,
              ...(text.trim().length > 0 ? {} : { completedAt: undefined, originalStatus: undefined }),
            }
          : todo,
      );
    });
  };

  const updateManagedTodoDraft = (status: ActiveTodoStatus, text: string) => {
    setManagedTodoDrafts((currentDrafts) => ({
      ...currentDrafts,
      [status]: text,
    }));
  };

  const commitManagedTodoDraft = (status: ActiveTodoStatus, text?: string) => {
    if (managedTodoDraftComposingStatusesRef.current.has(status)) {
      return;
    }

    const draftText = text ?? managedTodoDrafts[status] ?? '';

    if (!draftText.trim()) {
      setManagedTodoDrafts((currentDrafts) => ({
        ...currentDrafts,
        [status]: '',
      }));
      return;
    }

    const timestamp = new Date().toISOString();

    setManagedTodos((currentTodos) => [
      ...currentTodos,
      createManagedTodoItem(draftText, status, {
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ]);
    setManagedTodoDrafts((currentDrafts) => ({
      ...currentDrafts,
      [status]: '',
    }));
  };

  const startManagedTodoDraftComposition = (status: ActiveTodoStatus) => {
    managedTodoDraftComposingStatusesRef.current.add(status);
  };

  const endManagedTodoDraftComposition = (status: ActiveTodoStatus, text: string) => {
    managedTodoDraftComposingStatusesRef.current.delete(status);
    updateManagedTodoDraft(status, text);
  };

  const cleanupManagedTodos = () => {
    setManagedTodos((currentTodos) => normalizeManagedTodos(currentTodos));
  };

  const toggleManagedTodo = (id: string, completed: boolean) => {
    setManagedTodos((currentTodos) => {
      const timestamp = new Date().toISOString();

      return currentTodos.map((todo) => {
        if (todo.id !== id || !hasManagedTodoText(todo) || todo.status === 'completed') {
          return todo;
        }

        if (!completed) {
          return {
            ...todo,
            completed: false,
            completedAt: undefined,
            originalStatus: undefined,
            updatedAt: timestamp,
          };
        }

        // Checked items stay in place until the user explicitly finalizes them.
        return {
          ...todo,
          completed: true,
          completedAt: timestamp,
          originalStatus: todo.originalStatus ?? todo.status,
          updatedAt: timestamp,
        };
      });
    });
  };

  const finalizeManagedTodo = (id: string) => {
    setManagedTodos((currentTodos) => {
      const timestamp = new Date().toISOString();

      return currentTodos.map((todo) => {
        if (todo.id !== id || !hasManagedTodoText(todo) || todo.status === 'completed') {
          return todo;
        }

        return {
          ...todo,
          status: 'completed' as const,
          completed: true,
          completedAt: todo.completedAt ?? timestamp,
          originalStatus:
            todo.originalStatus ??
            (isActiveTodoStatus(todo.status) ? todo.status : getTodoStatusForDueDate(todo.dueDate)),
          pendingReview: undefined,
          updatedAt: timestamp,
        };
      });
    });
  };

  const moveManagedTodo = (id: string, status: ActiveTodoStatus) => {
    setManagedTodos((currentTodos) =>
      currentTodos.map((todo) =>
        todo.id === id && todo.status !== 'completed'
          ? {
              ...todo,
              status,
              completed: false,
              completedAt: undefined,
              originalStatus: undefined,
              updatedAt: new Date().toISOString(),
            }
          : todo,
      ),
    );
  };

  const restoreManagedTodo = (id: string, status: ActiveTodoStatus) => {
    setManagedTodos((currentTodos) =>
      currentTodos.map((todo) =>
        todo.id === id && (todo.status === 'completed' || todo.completed)
          ? {
              ...todo,
              status,
              completed: false,
              completedAt: undefined,
              originalStatus: undefined,
              pendingReview: undefined,
              updatedAt: new Date().toISOString(),
            }
          : todo,
      ),
    );
  };

  const reorderManagedTodo = (
    id: string,
    targetStatus: ActiveTodoStatus,
    beforeId: string | null,
  ) => {
    setManagedTodos((currentTodos) => {
      const movingTodo = currentTodos.find((todo) => todo.id === id);

      if (
        !movingTodo ||
        movingTodo.status === 'completed' ||
        movingTodo.completed ||
        !hasManagedTodoText(movingTodo)
      ) {
        return currentTodos;
      }

      if (beforeId === id) {
        return currentTodos;
      }

      const timestamp = new Date().toISOString();
      const remainingTodos = currentTodos.filter((todo) => todo.id !== id);
      const movedTodo: ManagedTodoItem = {
        ...movingTodo,
        status: targetStatus,
        completed: false,
        completedAt: undefined,
        originalStatus: undefined,
        pendingReview: undefined,
        updatedAt: timestamp,
      };
      const beforeIndex = beforeId
        ? remainingTodos.findIndex((todo) => todo.id === beforeId)
        : -1;
      const insertIndex = beforeIndex >= 0
        ? beforeIndex
        : remainingTodos.reduce(
            (lastIndex, todo, index) => (todo.status === targetStatus ? index + 1 : lastIndex),
            remainingTodos.length,
          );

      return [
        ...remainingTodos.slice(0, insertIndex),
        movedTodo,
        ...remainingTodos.slice(insertIndex),
      ];
    });
  };

  const startManagedTodoDrag = (
    event: DragEvent<HTMLButtonElement>,
    todo: ManagedTodoItem,
  ) => {
    if (todo.status === 'completed' || todo.completed || !hasManagedTodoText(todo)) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', todo.id);
    setDraggedTodoId(todo.id);
  };

  const updateManagedTodoDropTarget = (
    event: DragEvent<HTMLElement>,
    status: ActiveTodoStatus,
    beforeId: string | null,
  ) => {
    if (!draggedTodoId) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setTodoDropTarget((currentTarget) =>
      currentTarget?.status === status && currentTarget.beforeId === beforeId
        ? currentTarget
        : { status, beforeId },
    );
  };

  const dropManagedTodo = (
    event: DragEvent<HTMLElement>,
    status: ActiveTodoStatus,
    beforeId: string | null,
  ) => {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData('text/plain') || draggedTodoId;

    if (draggedId) {
      reorderManagedTodo(draggedId, status, beforeId);
    }

    setDraggedTodoId(null);
    setTodoDropTarget(null);
  };

  const endManagedTodoDrag = () => {
    setDraggedTodoId(null);
    setTodoDropTarget(null);
  };

  const deleteManagedTodo = (id: string) => {
    setManagedTodos((currentTodos) => currentTodos.filter((todo) => todo.id !== id));
  };

  const getTodoStatusForDueDate = (dueDate?: string): ActiveTodoStatus => {
    if (!dueDate) {
      return 'soon';
    }

    const tomorrowKey = getDateKey(addDays(today, 1));

    if (dueDate === todayKey) {
      return 'today';
    }

    if (dueDate === tomorrowKey) {
      return 'tomorrow';
    }

    return 'someday';
  };

  const addManagedTodoQuick = (text: string, dueDate?: string, folderId?: string) => {
    const trimmedText = text.trim();

    if (!trimmedText) {
      return false;
    }

    const timestamp = new Date().toISOString();
    setManagedTodos((currentTodos) => [
      ...currentTodos,
      createManagedTodoItem(trimmedText, getTodoStatusForDueDate(dueDate), {
        dueDate,
        folderId,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ]);

    if (folderId) {
      setTodoFolders((currentFolders) =>
        currentFolders.map((folder) =>
          folder.id === folderId ? { ...folder, updatedAt: timestamp } : folder,
        ),
      );
    }

    return true;
  };

  const updateTodoDraftText = (
    draftKey: string,
    value: string,
    setText: (nextValue: string) => void,
  ) => {
    todoDraftTextsRef.current[draftKey] = value;
    setText(value);
  };

  const commitTodoDraft = (
    draftKey: string,
    setText: (nextValue: string) => void,
    meta: TodoDraftMeta = {},
  ) => {
    const draftText = todoDraftTextsRef.current[draftKey] ?? '';
    const trimmedText = draftText.trim();

    todoDraftTextsRef.current[draftKey] = '';
    setText('');

    if (!trimmedText) {
      return false;
    }

    return addManagedTodoQuick(trimmedText, meta.dueDate, meta.folderId);
  };

  const commitAndResetTodoDraftInputs = () => {
    commitTodoDraft('todo:list', setNewTodoText);
    commitTodoDraft('todo:today', setNewTodoTodayText, { dueDate: todayKey });

    if (selectedTodoDate) {
      const dateKey = getDateKey(selectedTodoDate);
      commitTodoDraft(`todo:date:${dateKey}`, setNewTodoDateText, { dueDate: dateKey });
    } else {
      todoDraftTextsRef.current['todo:date:'] = '';
      setNewTodoDateText('');
    }

    if (selectedTodoFolderId) {
      commitTodoDraft(`todo:folder:${selectedTodoFolderId}`, setNewTodoFolderText, {
        folderId: selectedTodoFolderId,
      });
    } else {
      todoDraftTextsRef.current['todo:folder:'] = '';
      setNewTodoFolderText('');
    }
  };

  const positionTodoFloatingMenu = (id: string, panelElement?: HTMLDivElement | null) => {
    const anchorElement = todoMenuAnchorRefs.current[id];
    const menuElement = panelElement ?? todoMenuPanelRef.current;

    if (!anchorElement || !menuElement) {
      return;
    }

    const margin = 8;
    const anchorRect = anchorElement.getBoundingClientRect();
    const menuRect = menuElement.getBoundingClientRect();
    const navRect = document.querySelector('.bottom-tab-nav')?.getBoundingClientRect();
    const bottomLimit = navRect ? navRect.top - margin : window.innerHeight - margin;
    const availableHeight = Math.max(160, bottomLimit - margin);
    const menuWidth = Math.min(menuRect.width || 230, window.innerWidth - margin * 2);
    const menuHeight = Math.min(menuRect.height || availableHeight, availableHeight);
    const hasBottomSpace = anchorRect.bottom + 6 + menuHeight <= bottomLimit;
    const preferredTop = hasBottomSpace ? anchorRect.bottom + 6 : anchorRect.top - menuHeight - 6;
    const preferredLeft = anchorRect.right - menuWidth;
    const top = Math.min(Math.max(preferredTop, margin), Math.max(margin, bottomLimit - menuHeight));
    const left = Math.min(
      Math.max(preferredLeft, margin),
      Math.max(margin, window.innerWidth - menuWidth - margin),
    );

    const nextPosition = {
      id,
      top,
      left,
      maxHeight: Math.max(120, bottomLimit - top - margin),
    };

    setTodoFloatingMenuPosition((currentPosition) =>
      currentPosition &&
      currentPosition.id === nextPosition.id &&
      Math.abs(currentPosition.top - nextPosition.top) < 1 &&
      Math.abs(currentPosition.left - nextPosition.left) < 1 &&
      Math.abs(currentPosition.maxHeight - nextPosition.maxHeight) < 1
        ? currentPosition
        : nextPosition,
    );
  };

  const submitNewTodo = () => {
    commitTodoDraft('todo:list', setNewTodoText);
    window.setTimeout(() => adjustTextareaHeight(newTodoInputRef.current), 0);
  };

  const submitNewTodoForToday = () => {
    commitTodoDraft('todo:today', setNewTodoTodayText, { dueDate: todayKey });
    window.setTimeout(() => adjustTextareaHeight(newTodoTodayInputRef.current), 0);
  };

  const submitNewTodoForDate = (date: Date) => {
    const dateKey = getDateKey(date);

    commitTodoDraft(`todo:date:${dateKey}`, setNewTodoDateText, { dueDate: dateKey });
    window.setTimeout(() => adjustTextareaHeight(newTodoDateInputRef.current), 0);
  };

  const submitNewTodoForFolder = (folderId: string) => {
    commitTodoDraft(`todo:folder:${folderId}`, setNewTodoFolderText, { folderId });
    window.setTimeout(() => adjustTextareaHeight(newTodoFolderInputRef.current), 0);
  };

  const handleTodoCaptureKeyDown = (
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
    submit: () => void,
  ) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
      return;
    }

    if (event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();
    submit();
  };

  const updateManagedTodoDueDate = (id: string, dueDate?: string) => {
    setManagedTodos((currentTodos) =>
      currentTodos.map((todo) =>
        todo.id === id && todo.status !== 'completed'
          ? {
              ...todo,
              dueDate,
              status: getTodoStatusForDueDate(dueDate),
              pendingReview: undefined,
	              updatedAt: new Date().toISOString(),
	            }
	          : todo,
	      ),
	    );
    setTodoDueDateDrafts((currentDrafts) => {
      if (!currentDrafts[id]) {
        return currentDrafts;
      }

      const nextDrafts = { ...currentDrafts };
      delete nextDrafts[id];
      return nextDrafts;
    });
	  };

  const getTodoDueDateDraft = (todo: ManagedTodoItem): TodoDueDateDraft => {
    const draft = todoDueDateDrafts[todo.id];

    if (draft) {
      return draft;
    }

    if (todo.dueDate) {
      const dueDate = getDateFromKey(todo.dueDate);

      return {
        year: String(dueDate.getFullYear()),
        month: String(dueDate.getMonth() + 1),
        day: String(dueDate.getDate()),
      };
    }

    return {
      year: String(today.getFullYear()),
      month: '',
      day: '',
    };
  };

  const updateTodoDueDateDraft = (todoId: string, patch: Partial<TodoDueDateDraft>) => {
    setTodoDueDateDrafts((currentDrafts) => ({
      ...currentDrafts,
      [todoId]: {
        ...(currentDrafts[todoId] ?? { year: String(today.getFullYear()), month: '', day: '' }),
        ...patch,
        ...(patch.error === undefined ? { error: undefined } : {}),
      },
    }));
  };

  const commitTodoDueDateDraft = (
    todo: ManagedTodoItem,
    options: { allowTodayFallback?: boolean } = {},
  ) => {
    const draft = getTodoDueDateDraft(todo);
    const hasMonth = draft.month.trim().length > 0;
    const hasDay = draft.day.trim().length > 0;

    if (!hasMonth && !hasDay) {
      if (!options.allowTodayFallback) {
        return false;
      }

      updateManagedTodoDueDate(todo.id, todayKey);
      setActiveTodoMenuId(null);
      return true;
    }

    if (!hasMonth || !hasDay) {
      updateTodoDueDateDraft(todo.id, { error: '月と日を入力してください' });
      return false;
    }

    const monthNumber = Number(draft.month);
    const dayNumber = Number(draft.day);
    let yearNumber = Number(draft.year || today.getFullYear());

    if (
      !Number.isInteger(yearNumber) ||
      yearNumber < 1900 ||
      !Number.isInteger(monthNumber) ||
      monthNumber < 1 ||
      monthNumber > 12 ||
      !Number.isInteger(dayNumber) ||
      dayNumber < 1 ||
      dayNumber > 31
    ) {
      updateTodoDueDateDraft(todo.id, { error: '有効な月日を入力してください' });
      return false;
    }

    const targetDate = new Date(yearNumber, monthNumber - 1, dayNumber);

    if (
      targetDate.getFullYear() !== yearNumber ||
      targetDate.getMonth() !== monthNumber - 1 ||
      targetDate.getDate() !== dayNumber
    ) {
      updateTodoDueDateDraft(todo.id, { error: '存在する日付を入力してください' });
      return false;
    }

    updateManagedTodoDueDate(todo.id, getDateKey(targetDate));
    setActiveTodoMenuId(null);
    return true;
  };

  const updateManagedTodoFolder = (id: string, folderId?: string) => {
    setManagedTodos((currentTodos) =>
      currentTodos.map((todo) =>
        todo.id === id
          ? {
              ...todo,
              ...(folderId ? { folderId } : { folderId: undefined }),
              updatedAt: new Date().toISOString(),
            }
          : todo,
      ),
    );

    if (folderId) {
      setTodoFolders((currentFolders) =>
        currentFolders.map((folder) =>
          folder.id === folderId ? { ...folder, updatedAt: new Date().toISOString() } : folder,
        ),
      );
    }
  };

  const clearTodoSelection = () => {
    setIsTodoSelectionMode(false);
    setSelectedTodoIds({});
  };

  const enterTodoSelectionMode = () => {
    setActiveTodoMenuId(null);
    setIsTodoSelectionMode(true);
    setSelectedTodoIds({});
  };

  const toggleTodoSelection = (id: string) => {
    setSelectedTodoIds((currentIds) => {
      const nextIds = { ...currentIds };

      if (nextIds[id]) {
        delete nextIds[id];
      } else {
        nextIds[id] = true;
      }

      return nextIds;
    });
  };

  const selectVisibleTodos = (todos: ManagedTodoItem[]) => {
    setSelectedTodoIds(
      todos.reduce<Record<string, boolean>>((nextIds, todo) => {
        if (todo.status !== 'completed' && hasManagedTodoText(todo)) {
          nextIds[todo.id] = true;
        }

        return nextIds;
      }, {}),
    );
  };

  const getSelectedTodoIdList = () =>
    Object.entries(selectedTodoIds)
      .filter(([, selected]) => selected)
      .map(([id]) => id);

  const showTodoBulkStatus = (message: string) => {
    setTodoBulkStatusMessage(message);
    window.setTimeout(() => setTodoBulkStatusMessage(''), 2200);
  };

  const bulkUpdateSelectedTodoDueDate = (dueDate?: string) => {
    const targetIds = new Set(getSelectedTodoIdList());

    if (targetIds.size === 0) {
      return;
    }

    const timestamp = new Date().toISOString();
    setManagedTodos((currentTodos) =>
      currentTodos.map((todo) =>
        targetIds.has(todo.id) && todo.status !== 'completed'
          ? {
              ...todo,
              dueDate,
              status: getTodoStatusForDueDate(dueDate),
              pendingReview: undefined,
              updatedAt: timestamp,
            }
          : todo,
      ),
    );
    showTodoBulkStatus(
      dueDate === todayKey
        ? `${targetIds.size}件を今日に設定しました`
        : dueDate
          ? `${targetIds.size}件の日付を設定しました`
          : `${targetIds.size}件の日付を外しました`,
    );
    clearTodoSelection();
  };

  const bulkUpdateSelectedTodoFolder = (folderId?: string) => {
    const targetIds = new Set(getSelectedTodoIdList());

    if (targetIds.size === 0) {
      return;
    }

    const timestamp = new Date().toISOString();
    setManagedTodos((currentTodos) =>
      currentTodos.map((todo) =>
        targetIds.has(todo.id) && todo.status !== 'completed'
          ? {
              ...todo,
              ...(folderId ? { folderId } : { folderId: undefined }),
              updatedAt: timestamp,
            }
          : todo,
      ),
    );

    if (folderId) {
      setTodoFolders((currentFolders) =>
        currentFolders.map((folder) =>
          folder.id === folderId ? { ...folder, updatedAt: timestamp } : folder,
        ),
      );
    }

    showTodoBulkStatus(
      folderId
        ? `${targetIds.size}件をフォルダへ移動しました`
        : `${targetIds.size}件をフォルダなしにしました`,
    );
    clearTodoSelection();
  };

  const bulkCreateTodoFolderAndMove = () => {
    const folderName = window.prompt('新しいフォルダ名');
    const folder = folderName ? createTodoFolder(folderName) : null;

    if (folder) {
      bulkUpdateSelectedTodoFolder(folder.id);
    }
  };

  useEffect(() => {
    setIsTodoSelectionMode(false);
    setSelectedTodoIds({});
    setActiveTodoMenuId(null);
    setActiveTodoFolderMenuId(null);
    commitAndResetTodoDraftInputs();
  }, [page, todoView, selectedTodoFolderId, selectedTodoDate]);

  useEffect(() => {
    const commitDrafts = () => commitAndResetTodoDraftInputs();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        commitDrafts();
      }
    };

    window.addEventListener('pagehide', commitDrafts);
    window.addEventListener('beforeunload', commitDrafts);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      commitDrafts();
      window.removeEventListener('pagehide', commitDrafts);
      window.removeEventListener('beforeunload', commitDrafts);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!activeTodoMenuId && !activeTodoFolderMenuId) {
      setTodoFloatingMenuPosition(null);
      return undefined;
    }

    const closeTodoMenus = () => {
      setActiveTodoMenuId(null);
      setActiveTodoFolderMenuId(null);
      setTodoFloatingMenuPosition(null);
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;

	      if (target?.closest('.todo-actions-menu')) {
	        return;
	      }

	      if (activeTodoMenuId) {
	        const activeTodo = managedTodos.find((todo) => todo.id === activeTodoMenuId);

	        if (activeTodo) {
	          commitTodoDueDateDraft(activeTodo);
	        }
	      }

	      closeTodoMenus();
	    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeTodoMenus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', closeTodoMenus, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', closeTodoMenus, true);
    };
  }, [activeTodoFolderMenuId, activeTodoMenuId, managedTodos, todoDueDateDrafts]);

  useEffect(() => {
    if (!activeTodoMenuId) {
      return undefined;
    }

    const repositionMenu = () => positionTodoFloatingMenu(activeTodoMenuId);

    window.setTimeout(repositionMenu, 0);
    window.addEventListener('resize', repositionMenu);

    return () => {
      window.removeEventListener('resize', repositionMenu);
    };
  }, [activeTodoMenuId, todoDueDateDrafts]);

  const createTodoFolder = (name: string) => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return null;
    }

    const timestamp = new Date().toISOString();
    const folder: TodoFolder = {
      id: createTodoFolderId(),
      name: trimmedName,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    setTodoFolders((currentFolders) => [folder, ...currentFolders]);
    return folder;
  };

  const submitNewTodoFolder = () => {
    const folder = createTodoFolder(newTodoFolderName);

    if (!folder) {
      return;
    }

    setNewTodoFolderName('');
  };

  const promptCreateTodoFolderForTodo = (todoId: string) => {
    const folderName = window.prompt('新しいフォルダ名');
    const folder = folderName ? createTodoFolder(folderName) : null;

    if (folder) {
      updateManagedTodoFolder(todoId, folder.id);
    }
    setActiveTodoMenuId(null);
  };

  const renameTodoFolder = (folder: TodoFolder) => {
    const nextName = window.prompt('フォルダ名を変更', folder.name)?.trim();

    if (!nextName) {
      return;
    }

    setTodoFolders((currentFolders) =>
      currentFolders.map((currentFolder) =>
        currentFolder.id === folder.id
          ? { ...currentFolder, name: nextName, updatedAt: new Date().toISOString() }
          : currentFolder,
      ),
    );
    setActiveTodoFolderMenuId(null);
  };

  const deleteTodoFolder = (folder: TodoFolder) => {
    if (!window.confirm('フォルダだけを削除します。中のやることは残ります。')) {
      return;
    }

    setTodoFolders((currentFolders) => currentFolders.filter((currentFolder) => currentFolder.id !== folder.id));
    setManagedTodos((currentTodos) =>
      currentTodos.map((todo) =>
        todo.folderId === folder.id
          ? { ...todo, folderId: undefined, updatedAt: new Date().toISOString() }
          : todo,
      ),
    );
    if (selectedTodoFolderId === folder.id) {
      setSelectedTodoFolderId(null);
    }
    setActiveTodoFolderMenuId(null);
  };

  const openTodayTodoDateView = () => {
    resetEditUiState();
    setPage('todos');
    setMenuView('list');
    setTodoView('date');
    setTodoMonth(getMonthStart(today));
    setSelectedTodoDate(today);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const copyManagedTodoText = async (todo: ManagedTodoItem) => {
    try {
      await navigator.clipboard?.writeText(todo.text);
    } catch {
      window.prompt('コピーしてください', todo.text);
    }
    setActiveTodoMenuId(null);
  };

  const focusManagedTodo = (todoId: string) => {
    window.setTimeout(() => {
      document.getElementById(`managed-todo-text-${todoId}`)?.focus();
    }, 0);
    setActiveTodoMenuId(null);
  };

  const confirmDeleteManagedTodo = (todo: ManagedTodoItem) => {
    if (window.confirm('このやることを削除しますか？')) {
      deleteManagedTodo(todo.id);
    }
    setActiveTodoMenuId(null);
  };

  const moveTodoMonth = (months: number) => {
    setTodoMonth((currentMonth) => addMonths(currentMonth, months));
    setSelectedTodoDate(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showTodoToday = () => {
    setTodoMonth(getMonthStart(today));
    setSelectedTodoDate(today);
  };

  const applyTodoReviewActions = (actions: Record<string, TodoReviewAction>) => {
    const hasCompletionAction = pendingTodoReviews.some(
      (todo) => (actions[todo.id] ?? 'today') === 'completed',
    );

    if (
      hasCompletionAction &&
      !window.confirm('完了にする項目があります。完了日時を昨日として記録してよいですか？')
    ) {
      return;
    }

    setManagedTodos((currentTodos) =>
      currentTodos.flatMap((todo) => {
        if (!todo.pendingReview) {
          return [todo];
        }

        const action = actions[todo.id] ?? 'today';
        const timestamp = new Date().toISOString();

        if (action === 'delete') {
          return [];
        }

        if (action === 'completed') {
          return [{
            ...todo,
            status: 'completed' as const,
            completed: true,
            completedAt: getEndOfDateIso(todo.pendingReview.originDate),
            originalStatus: todo.pendingReview.fromStatus,
            pendingReview: undefined,
            updatedAt: timestamp,
          }];
        }

        return [{
          ...todo,
          status: action,
          completed: false,
          completedAt: undefined,
          originalStatus: undefined,
          pendingReview: undefined,
          updatedAt: timestamp,
        }];
      }),
    );
    setIsTodoReviewOpen(false);
    setTodoReviewDismissed(false);
  };

  const applyTodoReviewBulkAction = (action: TodoReviewAction) => {
    applyTodoReviewActions(
      Object.fromEntries(pendingTodoReviews.map((todo) => [todo.id, action])),
    );
  };

  const deferTodoReview = () => {
    setIsTodoReviewOpen(false);
    setTodoReviewDismissed(true);
  };

  const updateRecordAnyMemo = (date: Date, value: string) => {
    localStorage.setItem(getDailyAnyMemoStorageKey(date), value);
    syncRecordAnyMemoToActiveDates(date, value);
    setRecordRevision((revision) => revision + 1);
  };

  const persistAnyMemoItems = (updater: (items: AnyMemoItem[]) => AnyMemoItem[]) => {
    setAnyMemoItems((currentItems) => {
      const nextItems = normalizeAnyMemoItems(updater(currentItems));
      saveAnyMemoItems(nextItems);

      return nextItems;
    });
    setRecordRevision((revision) => revision + 1);
  };

  const addAnyMemoItem = () => {
    const text = newAnyMemoText.trim();

    if (!text) {
      return;
    }

    const timestamp = new Date().toISOString();
    persistAnyMemoItems((currentItems) => [
      {
        id: createAnyMemoId(),
        text,
        createdAt: timestamp,
      },
      ...currentItems,
    ]);
    setNewAnyMemoText('');
    setAnyMemoStatusMessage('追加しました');
    window.setTimeout(() => {
      anyMemoInputRef.current?.focus({ preventScroll: true });
      adjustTextareaHeight(anyMemoInputRef.current);
    }, 0);
  };

  const startEditingAnyMemo = (item: AnyMemoListItem) => {
    setEditingAnyMemoId(item.id);
    setEditingAnyMemoText(item.text);
  };

  const cancelEditingAnyMemo = () => {
    setEditingAnyMemoId(null);
    setEditingAnyMemoText('');
  };

  const saveEditingAnyMemo = (item: AnyMemoListItem) => {
    const text = editingAnyMemoText.trim();

    if (!text) {
      return;
    }

    if (item.source === 'legacy' && item.dateKey) {
      updateRecordAnyMemo(getDateFromKey(item.dateKey), text);
    } else {
      persistAnyMemoItems((currentItems) =>
        currentItems.map((currentItem) =>
          currentItem.id === item.id
            ? {
                ...currentItem,
                text,
                updatedAt: new Date().toISOString(),
              }
            : currentItem,
        ),
      );
    }

    setEditingAnyMemoId(null);
    setEditingAnyMemoText('');
    setAnyMemoStatusMessage('更新しました');
  };

  const deleteAnyMemoItem = (item: AnyMemoListItem) => {
    if (!window.confirm('このメモを削除しますか？')) {
      return;
    }

    if (item.source === 'legacy' && item.dateKey) {
      localStorage.removeItem(getDailyAnyMemoStorageKey(getDateFromKey(item.dateKey)));
      syncRecordAnyMemoToActiveDates(getDateFromKey(item.dateKey), '');
      setRecordRevision((revision) => revision + 1);
    } else {
      persistAnyMemoItems((currentItems) =>
        currentItems.filter((currentItem) => currentItem.id !== item.id),
      );
    }

    if (editingAnyMemoId === item.id) {
      cancelEditingAnyMemo();
    }
    setAnyMemoStatusMessage('削除しました');
  };

  const removeAnyMemoFromSource = (item: AnyMemoListItem) => {
    if (item.source === 'legacy' && item.dateKey) {
      localStorage.removeItem(getDailyAnyMemoStorageKey(getDateFromKey(item.dateKey)));
      syncRecordAnyMemoToActiveDates(getDateFromKey(item.dateKey), '');
      setRecordRevision((revision) => revision + 1);
      return;
    }

    persistAnyMemoItems((currentItems) =>
      currentItems.filter((currentItem) => currentItem.id !== item.id),
    );
  };

  const toggleAnyMemoExpansion = (id: string) => {
    setExpandedAnyMemoIds((currentExpandedIds) => ({
      ...currentExpandedIds,
      [id]: !currentExpandedIds[id],
    }));
  };

  const persistAnyMemoFolders = (updater: (folders: AnyMemoFolder[]) => AnyMemoFolder[]) => {
    setAnyMemoFolders((currentFolders) => {
      const nextFolders = normalizeAnyMemoFolders(updater(currentFolders));
      saveAnyMemoFolders(nextFolders);

      return nextFolders;
    });
    setRecordRevision((revision) => revision + 1);
  };

  const persistAnyMemoFolderItems = (
    updater: (items: AnyMemoFolderMemoItem[]) => AnyMemoFolderMemoItem[],
  ) => {
    setAnyMemoFolderItems((currentItems) => {
      const nextItems = normalizeAnyMemoFolderMemoItems(updater(currentItems));
      saveAnyMemoFolderItems(nextItems);

      return nextItems;
    });
    setRecordRevision((revision) => revision + 1);
  };

  const createAnyMemoFolder = (parentFolderId: string | null = selectedAnyMemoFolderId) => {
    const name = newAnyMemoFolderName.trim();

    if (!name) {
      return;
    }

    const timestamp = new Date().toISOString();
    const folder: AnyMemoFolder = {
      id: createAnyMemoFolderId(),
      name,
      parentFolderId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    persistAnyMemoFolders((currentFolders) => [folder, ...currentFolders]);
    setNewAnyMemoFolderName('');
    setAnyMemoStatusMessage('フォルダを作りました');
  };

  const startEditingAnyMemoFolder = (folder: AnyMemoFolder) => {
    setEditingAnyMemoFolderId(folder.id);
    setEditingAnyMemoFolderName(folder.name);
  };

  const cancelEditingAnyMemoFolder = () => {
    setEditingAnyMemoFolderId(null);
    setEditingAnyMemoFolderName('');
  };

  const saveEditingAnyMemoFolder = (folderId: string) => {
    const name = editingAnyMemoFolderName.trim();

    if (!name) {
      return;
    }

    persistAnyMemoFolders((currentFolders) =>
      currentFolders.map((folder) =>
        folder.id === folderId
          ? { ...folder, name, updatedAt: new Date().toISOString() }
          : folder,
      ),
    );
    cancelEditingAnyMemoFolder();
    setAnyMemoStatusMessage('フォルダ名を変更しました');
  };

  const deleteAnyMemoFolder = (folder: AnyMemoFolder) => {
    const folderMemoCount = anyMemoFolderItems.filter((item) => item.folderId === folder.id).length;
    const childFolderCount = anyMemoFolders.filter((currentFolder) => currentFolder.parentFolderId === folder.id).length;
    const confirmMessage =
      folderMemoCount > 0 || childFolderCount > 0
        ? `「${folder.name}」だけを削除します。中のメモと子フォルダは親フォルダへ戻します。`
        : `「${folder.name}」を削除しますか？`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    const nextParentFolderId = folder.parentFolderId ?? null;
    if (!nextParentFolderId) {
      const orphanedItems = anyMemoFolderItems.filter((item) => item.folderId === folder.id);
      if (orphanedItems.length > 0) {
        persistAnyMemoItems((currentItems) => [
          ...orphanedItems.map((item) => ({
            id: item.id,
            text: item.text,
            createdAt: item.createdAt,
            ...(item.updatedAt ? { updatedAt: item.updatedAt } : {}),
          })),
          ...currentItems,
        ]);
      }
    }
    persistAnyMemoFolders((currentFolders) =>
      currentFolders
        .filter((currentFolder) => currentFolder.id !== folder.id)
        .map((currentFolder) =>
          currentFolder.parentFolderId === folder.id
            ? { ...currentFolder, parentFolderId: nextParentFolderId, updatedAt: new Date().toISOString() }
            : currentFolder,
        ),
    );
    persistAnyMemoFolderItems((currentItems) =>
      currentItems
        .map((item) =>
          item.folderId === folder.id && nextParentFolderId
            ? { ...item, folderId: nextParentFolderId, updatedAt: new Date().toISOString() }
            : item,
        )
        .filter((item) => item.folderId !== folder.id),
    );

    if (selectedAnyMemoFolderId === folder.id) {
      setSelectedAnyMemoFolderId(null);
    }
    if (editingAnyMemoFolderId === folder.id) {
      cancelEditingAnyMemoFolder();
    }
    setAnyMemoStatusMessage('フォルダを削除しました');
  };

  const moveAnyMemoFolder = (folder: AnyMemoFolder, parentFolderId: string | null) => {
    if (parentFolderId === folder.id || (parentFolderId && isAnyMemoFolderDescendant(parentFolderId, folder.id))) {
      setAnyMemoStatusMessage('その場所へは移動できません');
      return;
    }

    persistAnyMemoFolders((currentFolders) =>
      currentFolders.map((currentFolder) =>
        currentFolder.id === folder.id
          ? { ...currentFolder, parentFolderId, updatedAt: new Date().toISOString() }
          : currentFolder,
      ),
    );
    setAnyMemoStatusMessage(parentFolderId ? 'フォルダを移動しました' : '最上位へ移動しました');
  };

  const addFolderMemoItem = (folderId: string) => {
    const text = newFolderMemoText.trim();

    if (!text) {
      return;
    }

    const timestamp = new Date().toISOString();
    persistAnyMemoFolderItems((currentItems) => [
      {
        id: createAnyMemoId(),
        folderId,
        text,
        createdAt: timestamp,
      },
      ...currentItems,
    ]);
    persistAnyMemoFolders((currentFolders) =>
      currentFolders.map((folder) =>
        folder.id === folderId ? { ...folder, updatedAt: timestamp } : folder,
      ),
    );
    setNewFolderMemoText('');
    setAnyMemoStatusMessage('追加しました');
  };

  const startEditingFolderMemo = (item: AnyMemoFolderMemoItem) => {
    setEditingAnyMemoId(item.id);
    setEditingAnyMemoText(item.text);
  };

  const saveEditingFolderMemo = (item: AnyMemoFolderMemoItem) => {
    const text = editingAnyMemoText.trim();

    if (!text) {
      return;
    }

    const timestamp = new Date().toISOString();
    persistAnyMemoFolderItems((currentItems) =>
      currentItems.map((currentItem) =>
        currentItem.id === item.id
          ? {
              ...currentItem,
              text,
              updatedAt: timestamp,
            }
          : currentItem,
      ),
    );
    persistAnyMemoFolders((currentFolders) =>
      currentFolders.map((folder) =>
        folder.id === item.folderId ? { ...folder, updatedAt: timestamp } : folder,
      ),
    );
    setEditingAnyMemoId(null);
    setEditingAnyMemoText('');
    setAnyMemoStatusMessage('更新しました');
  };

  const deleteFolderMemoItem = (item: AnyMemoFolderMemoItem) => {
    if (!window.confirm('このメモを削除しますか？')) {
      return;
    }

    persistAnyMemoFolderItems((currentItems) =>
      currentItems.filter((currentItem) => currentItem.id !== item.id),
    );
    if (editingAnyMemoId === item.id) {
      cancelEditingAnyMemo();
    }
    setAnyMemoStatusMessage('削除しました');
  };

  const moveFolderMemoItemToFolder = (item: AnyMemoFolderMemoItem, folderId: string) => {
    const targetFolder = anyMemoFolders.find((folder) => folder.id === folderId);

    if (!targetFolder) {
      return;
    }

    const timestamp = new Date().toISOString();
    persistAnyMemoFolderItems((currentItems) =>
      currentItems.map((currentItem) =>
        currentItem.id === item.id
          ? { ...currentItem, folderId, updatedAt: timestamp }
          : currentItem,
      ),
    );
    persistAnyMemoFolders((currentFolders) =>
      currentFolders.map((folder) =>
        folder.id === folderId || folder.id === item.folderId
          ? { ...folder, updatedAt: timestamp }
          : folder,
      ),
    );
    setMovingAnyMemoId(null);
    setNewMoveFolderName('');
    setAnyMemoStatusMessage(`「${targetFolder.name}」へ移動しました`);
  };

  const moveAnyMemoItemToFolder = (item: AnyMemoListItem, folderId: string) => {
    const targetFolder = anyMemoFolders.find((folder) => folder.id === folderId);

    if (!targetFolder) {
      return;
    }

    const timestamp = new Date().toISOString();
    const movedItem: AnyMemoFolderMemoItem = {
      id: item.source === 'item' ? item.id : createAnyMemoId(),
      folderId,
      text: item.text,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt ?? timestamp,
    };

    removeAnyMemoFromSource(item);
    persistAnyMemoFolderItems((currentItems) => [movedItem, ...currentItems]);
    persistAnyMemoFolders((currentFolders) =>
      currentFolders.map((folder) =>
        folder.id === folderId ? { ...folder, updatedAt: timestamp } : folder,
      ),
    );
    if (editingAnyMemoId === item.id) {
      cancelEditingAnyMemo();
    }
    setMovingAnyMemoId(null);
    setNewMoveFolderName('');
    setAnyMemoStatusMessage(`「${targetFolder.name}」へ移動しました`);
  };

  const createFolderAndMoveAnyMemoItem = (item: AnyMemoListItem) => {
    const folderName = newMoveFolderName.trim();

    if (!folderName) {
      return;
    }

    const timestamp = new Date().toISOString();
    const folder: AnyMemoFolder = {
      id: createAnyMemoFolderId(),
      name: folderName,
      parentFolderId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const movedItem: AnyMemoFolderMemoItem = {
      id: item.source === 'item' ? item.id : createAnyMemoId(),
      folderId: folder.id,
      text: item.text,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt ?? timestamp,
    };

    removeAnyMemoFromSource(item);
    persistAnyMemoFolders((currentFolders) => [folder, ...currentFolders]);
    persistAnyMemoFolderItems((currentItems) => [movedItem, ...currentItems]);
    if (editingAnyMemoId === item.id) {
      cancelEditingAnyMemo();
    }
    setMovingAnyMemoId(null);
    setNewMoveFolderName('');
    setAnyMemoStatusMessage(`「${folder.name}」へ移動しました`);
  };

  const updateRecordAdvancedEntry = (date: Date, itemId: string, value: string) => {
    const target = resolveDateTarget(
      templateSettings,
      dateOverrides,
      dateSnapshots,
      date,
      todayKey,
    );

    updateSectionsForTarget(target, (currentSections) =>
      currentSections.map((section) =>
        section.id === bonusSectionId
          ? {
            ...section,
            items: section.items.map((item) =>
              item.id === itemId
                ? { ...item, label: value }
                : item,
            ),
          }
          : section,
      ),
    );
    setRecordRevision((revision) => revision + 1);
  };

  const saveScheduleForDate = (
    date: Date,
    schedule: DailySchedule,
    options: NormalizeDailyScheduleOptions = {},
  ) => {
    const normalizedSchedule = normalizeDailySchedule(schedule, options);
    const hasStoredSchedule = normalizedSchedule.length > 0;
    const storageKey = getDailyScheduleStorageKey(date);

    if (hasStoredSchedule) {
      localStorage.setItem(storageKey, serializeDailySchedule(normalizedSchedule, options));
    } else {
      localStorage.removeItem(storageKey);
    }

    setScheduleRevision((revision) => revision + 1);
  };

  const getEmptyScheduleDetailDraft = (): ScheduleDetailDraft => ({
    hour: '',
    minute: '',
    text: '',
  });

  const getScheduleDetailDraft = (dateKey: string) =>
    scheduleDetailDrafts[dateKey] ?? getEmptyScheduleDetailDraft();

  const getScheduleDetailDraftTime = (draft: ScheduleDetailDraft) => {
    const hasHour = draft.hour.trim().length > 0;
    const hasMinute = draft.minute.trim().length > 0;

    if (!hasHour && !hasMinute) {
      return '';
    }

    if (!hasHour) {
      return '';
    }

    const hourNumber = Number(draft.hour);
    const minuteNumber = hasMinute ? Number(draft.minute) : 0;

    if (
      !Number.isInteger(hourNumber) ||
      hourNumber < 0 ||
      hourNumber > 23 ||
      !Number.isInteger(minuteNumber) ||
      minuteNumber < 0 ||
      minuteNumber > 59
    ) {
      return '';
    }

    return `${String(hourNumber).padStart(2, '0')}:${String(minuteNumber).padStart(2, '0')}`;
  };

  const updateScheduleDetailDraft = (
    date: Date,
    patch: Partial<ScheduleDetailDraft>,
  ) => {
    const dateKey = getDateKey(date);

    setScheduleDetailDrafts((currentDrafts) => ({
      ...currentDrafts,
      [dateKey]: {
        ...(currentDrafts[dateKey] ?? getEmptyScheduleDetailDraft()),
        ...patch,
        ...(patch.error === undefined ? { error: undefined } : {}),
        ...(patch.message === undefined ? { message: undefined } : {}),
      },
    }));
  };

  const commitScheduleDetailDraft = (date: Date) => {
    const dateKey = getDateKey(date);
    const draft = scheduleDetailDrafts[dateKey] ?? getEmptyScheduleDetailDraft();
    const text = draft.text.trim();

    if (scheduleDetailSavingKeysRef.current.has(dateKey) || !text) {
      return;
    }

    const hasHour = draft.hour.trim().length > 0;
    const hasMinute = draft.minute.trim().length > 0;
    let scheduleTime = '';

    if (!hasHour && hasMinute) {
      updateScheduleDetailDraft(date, {
        error: '分を入れる場合は時も入力してください',
      });
      return;
    }

    if (!hasHour && !hasMinute) {
      scheduleTime = '';
    } else {
      const hourNumber = Number(draft.hour);
      const minuteNumber = hasMinute ? Number(draft.minute) : 0;

      if (!Number.isInteger(hourNumber) || hourNumber < 0 || hourNumber > 23) {
        updateScheduleDetailDraft(date, {
          error: '時は0〜23で入力してください',
        });
        return;
      }

      if (!Number.isInteger(minuteNumber) || minuteNumber < 0 || minuteNumber > 59) {
        updateScheduleDetailDraft(date, {
          error: '分は0〜59で入力してください',
        });
        return;
      }

      scheduleTime = `${String(hourNumber).padStart(2, '0')}:${String(minuteNumber).padStart(2, '0')}`;
    }

    scheduleDetailSavingKeysRef.current.add(dateKey);
    const currentSchedule = loadDailySchedule(date);
    const nextSchedule = upsertDailyScheduleItem(
      currentSchedule,
      createDailyScheduleItem(scheduleTime, text),
    );

    saveScheduleForDate(date, nextSchedule);
    setScheduleDetailDrafts((currentDrafts) => ({
      ...currentDrafts,
      [dateKey]: {
        ...getEmptyScheduleDetailDraft(),
        message: '予定を追加しました',
      },
    }));
    window.setTimeout(() => {
      scheduleDetailSavingKeysRef.current.delete(dateKey);
      document
        .querySelector<HTMLInputElement>(`[data-schedule-detail-text="${dateKey}"]`)
        ?.focus({ preventScroll: true });
    }, 0);
  };

  const updateScheduleItem = (
    date: Date,
    item: DailyScheduleItem,
    field: keyof Pick<DailyScheduleItem, 'time' | 'text'>,
    value: string,
  ) => {
    const currentSchedule = loadDailySchedule(date);
    const nextItem = {
      ...item,
      [field]: value,
    };
    const isComposing = composingScheduleIdsRef.current.has(item.id);
    const preserveOptions = isComposing ? { preserveEmptyIds: [item.id] } : {};
    const nextSchedule = hasScheduleValue(nextItem) || isComposing
      ? upsertDailyScheduleItem(currentSchedule, nextItem, preserveOptions)
      : deleteDailyScheduleItem(currentSchedule, item.id);

    saveScheduleForDate(date, nextSchedule, preserveOptions);
  };

  const startScheduleComposition = (id: string) => {
    composingScheduleIdsRef.current.add(id);
  };

  const endScheduleComposition = (date: Date, item: DailyScheduleItem, value: string) => {
    composingScheduleIdsRef.current.delete(item.id);
    updateScheduleItem(date, item, 'text', value);
  };

  const removeScheduleItem = (date: Date, id: string) => {
    const currentSchedule = loadDailySchedule(date);

    saveScheduleForDate(date, deleteDailyScheduleItem(currentSchedule, id));
  };

  const openScheduleEditor = (date: Date) => {
    setScheduleMonth(getMonthStart(date));
    setScheduleYear(date.getFullYear());
    setSelectedScheduleDate(date);
  };

  const scrollToScheduleTodayCell = (behavior: ScrollBehavior = 'smooth') => {
    window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        const todayCell = document.querySelector<HTMLElement>(
          '.schedule-list-day-button[data-today="true"]',
        );

        if (todayCell) {
          todayCell.scrollIntoView({ block: 'center', behavior });
          return;
        }

        window.scrollTo({ top: 0, behavior });
      });
    }, 0);
  };

  const moveScheduleYear = (years: number) => {
    setScheduleYear((currentYear) => currentYear + years);
    setSelectedScheduleYearMonth(null);
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

  const resetMainPageHome = (targetPage: PageName) => {
    resetEditUiState();
    setActiveQuestInfo(null);
    setSelectedScheduleDate(null);
    setActiveScheduleMenuId(null);
    setActiveTodoMenuId(null);
    setActiveTodoFolderMenuId(null);
    setTodoFloatingMenuPosition(null);
    clearTodoSelection();
    commitAndResetTodoDraftInputs();
    setSelectedRecordDate(null);

    if (targetPage === 'today') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (targetPage === 'history') {
      setCalendarMonth(getMonthStart(today));
      setHistorySelectedDate(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (targetPage === 'todos') {
      setMenuView('list');
      setTodoView(INITIAL_TODO_VIEW);
      setSelectedTodoDate(null);
      setSelectedTodoFolderId(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (targetPage === 'schedule') {
      scheduleTodayScrollMonthRef.current = null;
      scheduleListScrollYearRef.current = null;
      scheduleAgendaScrollYearRef.current = null;
      setMenuView('list');
      setScheduleMonth(getMonthStart(today));
      setScheduleYear(today.getFullYear());
      setSelectedScheduleYearMonth(null);
      setScheduleView(INITIAL_SCHEDULE_VIEW);
      scrollToScheduleTodayCell('smooth');
      return;
    }

    if (targetPage === 'library') {
      setMenuView('list');
      setSelectedAnyMemoFolderId(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const changePage = (nextPage: PageName) => {
    if (nextPage === page) {
      resetMainPageHome(nextPage);
      return;
    }

    resetEditUiState();
    if (nextPage === 'library') {
      setMenuView('list');
    }
    if (nextPage === 'schedule') {
      scheduleTodayScrollMonthRef.current = null;
      scheduleListScrollYearRef.current = null;
      scheduleAgendaScrollYearRef.current = null;
      setMenuView('list');
      setScheduleMonth(getMonthStart(today));
      setScheduleYear(today.getFullYear());
      setSelectedScheduleYearMonth(null);
      setSelectedScheduleDate(null);
      setScheduleView(INITIAL_SCHEDULE_VIEW);
    }
    if (nextPage === 'todos') {
      setMenuView('list');
    }
    setPage(nextPage);
  };

  const openMenuView = (nextMenuView: Exclude<MenuViewName, 'list'>) => {
    resetEditUiState();
    setPage('library');
    setMenuView(nextMenuView);
    if (nextMenuView === 'schedule') {
      scheduleTodayScrollMonthRef.current = null;
      scheduleListScrollYearRef.current = null;
      scheduleAgendaScrollYearRef.current = null;
      setScheduleMonth(getMonthStart(today));
      setScheduleYear(today.getFullYear());
      setSelectedScheduleYearMonth(null);
      setSelectedScheduleDate(null);
      setScheduleView(INITIAL_SCHEDULE_VIEW);
    }
    const nextRecordView = libraryRecordViewMap[nextMenuView];
    if (nextRecordView) {
      setRecordView(nextRecordView);
      setSelectedRecordDate(null);
    }
    if (nextMenuView !== 'schedule') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const openTodayScheduleView = () => {
    resetEditUiState();
    scheduleTodayScrollMonthRef.current = null;
    scheduleListScrollYearRef.current = null;
    scheduleAgendaScrollYearRef.current = null;
    setPage('schedule');
    setMenuView('list');
    setScheduleMonth(getMonthStart(today));
    setScheduleYear(today.getFullYear());
    setSelectedScheduleYearMonth(null);
    setSelectedScheduleDate(null);
    setScheduleView('today');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openFixedQuestDestination = (fixedKind?: RoutineItem['fixedKind']) => {
    if (fixedKind === 'scheduleCheck') {
      changePage('schedule');
      return true;
    }

    if (fixedKind === 'todoCheck') {
      changePage('todos');
      return true;
    }

    return false;
  };

  const returnFromLibraryDetail = (options: { animated?: boolean } = {}) => {
    if (isAnyMemoFolderDetailView) {
      setSelectedAnyMemoFolderId(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    returnToLibraryList(options);
  };

  const returnToLibraryList = (options: { animated?: boolean } = {}) => {
    if (!isLibraryDetailView) {
      return;
    }

    const finishReturn = () => {
      resetEditUiState();
      setMenuView('list');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setIsLibraryBackAnimating(false);
    };

    if (options.animated) {
      setIsLibraryBackAnimating(true);
      window.setTimeout(finishReturn, 180);
      return;
    }

    finishReturn();
  };

  const shouldIgnoreLibraryBackSwipe = (target: EventTarget | null) => {
    const element = target instanceof Element ? target : null;

    return Boolean(
      element?.closest(
        [
          'input',
          'textarea',
          'select',
          'button',
          'a',
          '[contenteditable="true"]',
          '[data-quest-info-ui="true"]',
          '.schedule-view-tabs',
          '.record-tabs',
          '.records-display-toggle',
          '.todo-status-tabs',
          '.todo-card-menu',
          '.timer-shortcut-grid',
          '.timer-controls',
        ].join(', '),
      ),
    );
  };

  const handleLibraryBackTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!isLibraryDetailView || isLibraryBackAnimating || event.touches.length !== 1) {
      librarySwipeBackRef.current = null;
      return;
    }

    const touch = event.touches[0];

    if (touch.clientX > 40 || shouldIgnoreLibraryBackSwipe(event.target)) {
      librarySwipeBackRef.current = null;
      return;
    }

    librarySwipeBackRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      triggered: false,
    };
  };

  const handleLibraryBackTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const swipe = librarySwipeBackRef.current;

    if (!swipe || swipe.triggered || event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - swipe.startX;
    const deltaY = touch.clientY - swipe.startY;
    const absY = Math.abs(deltaY);

    if (deltaX < 0 || absY > Math.max(26, Math.abs(deltaX) * 0.72)) {
      if (absY > 18) {
        librarySwipeBackRef.current = null;
      }
      return;
    }

    if (deltaX >= 58 && deltaX > absY * 1.45) {
      swipe.triggered = true;
      setActiveQuestInfo(null);
      returnFromLibraryDetail({ animated: true });
    }
  };

  const handleLibraryBackTouchEnd = () => {
    librarySwipeBackRef.current = null;
  };

  const startStatusProfileEditing = () => {
    setStatusProfileDraft(playerProfile);
    setIsStatusProfileEditing(true);
    setIsIconPickerOpen(false);
  };

  const cancelStatusProfileEditing = () => {
    setStatusProfileDraft(playerProfile);
    setIsStatusProfileEditing(false);
    setIsIconPickerOpen(false);
  };

  const saveStatusProfileEditing = () => {
    const nextDisplayName = statusProfileDraft.displayName.trim().slice(0, 20);

    if (!nextDisplayName) {
      return;
    }

    setPlayerProfile({
      displayName: nextDisplayName,
      iconId: statusProfileDraft.iconId,
      oneLineProfile: statusProfileDraft.oneLineProfile.trim().slice(0, 120),
      favoriteThings: statusProfileDraft.favoriteThings.trim().slice(0, 200),
      currentGoal: statusProfileDraft.currentGoal.trim().slice(0, 200),
    });
    setIsStatusProfileEditing(false);
    setIsIconPickerOpen(false);
  };

  const earnPlayerBadge = (badgeId: string, earnedAt = new Date().toISOString()) => {
    setPlayerBadges((currentBadges) => {
      if (currentBadges.earned[badgeId]) {
        return currentBadges;
      }

      return {
        ...currentBadges,
        earned: {
          ...currentBadges.earned,
          [badgeId]: earnedAt,
        },
      };
    });
  };

  const toggleFavoriteBadge = (badgeId: string) => {
    setPlayerBadges((currentBadges) => {
      if (!currentBadges.earned[badgeId]) {
        return currentBadges;
      }

      if (currentBadges.favoriteBadgeIds.includes(badgeId)) {
        return {
          ...currentBadges,
          favoriteBadgeIds: currentBadges.favoriteBadgeIds.filter((currentBadgeId) => currentBadgeId !== badgeId),
        };
      }

      if (currentBadges.favoriteBadgeIds.length >= 3) {
        return currentBadges;
      }

      return {
        ...currentBadges,
        favoriteBadgeIds: [...currentBadges.favoriteBadgeIds, badgeId],
      };
    });
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
    if (context === 'today') {
      const targetCardRef = kind === 'memo' ? dailyMemoCardRef : dailyEventCardRef;
      const targetTextareaRef = kind === 'memo' ? dailyMemoTextareaRef : dailyEventTextareaRef;

      window.requestAnimationFrame(() => {
        targetCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => {
          adjustTextareaHeight(targetTextareaRef.current);
          targetTextareaRef.current?.focus({ preventScroll: true });
        }, 260);
      });
      return;
    }

    const targetRef =
      context === 'history'
        ? kind === 'memo'
          ? historyDailyMemoTextareaRef
          : historyDailyEventTextareaRef
        : kind === 'memo'
        ? dailyMemoTextareaRef
        : dailyEventTextareaRef;

    window.requestAnimationFrame(() => {
      targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => targetRef.current?.focus(), 240);
    });
  };
  const getFixedQuestSupportLabel = (fixedKind?: RoutineItem['fixedKind']) => {
    if (fixedKind === 'wake') {
      return '決めた時間に起きてみよう';
    }

    if (fixedKind === 'sleep') {
      return '決めた時間に寝てみよう';
    }

    if (fixedKind === 'scheduleCheck') {
      return 'スケジュールを開いたら達成';
    }

    if (fixedKind === 'todoCheck') {
      return 'やることを開いたら達成';
    }

    return '開いて眺めたら達成';
  };
  const renderQuestInfoButton = ({
    id,
    kind,
    onSupportClick,
    supportLabel,
  }: {
    id: string;
    kind: 'fixed' | 'core';
    onSupportClick?: () => void;
    supportLabel: string;
  }) => {
    const kindLabel = kind === 'fixed' ? '固定クエスト' : 'フリークエスト';
    const isOpen = activeQuestInfo?.id === id;
    const actionLabel = supportLabel === '変更可能' ? '編集する' : supportLabel;

    return (
      <span className="quest-info-wrap" data-quest-info-ui="true">
        <button
          aria-expanded={isOpen}
          aria-label={`${kindLabel}の説明を表示`}
          className="quest-info-button"
          onClick={(event) => {
            event.stopPropagation();
            const buttonRect = event.currentTarget.getBoundingClientRect();
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            const margin = 14;
            const popoverWidth = Math.min(240, viewportWidth - margin * 2);
            const estimatedHeight = onSupportClick ? 112 : 82;
            const hasBottomSpace = buttonRect.bottom + 8 + estimatedHeight <= viewportHeight - margin;
            const placement = hasBottomSpace ? 'bottom' : 'top';
            const left = Math.min(
              Math.max(margin, buttonRect.left - 10),
              Math.max(margin, viewportWidth - popoverWidth - margin),
            );
            const top = placement === 'bottom'
              ? buttonRect.bottom + 8
              : Math.max(margin, buttonRect.top - estimatedHeight - 8);

            setActiveQuestInfo((currentInfo) => (
              currentInfo?.id === id
                ? null
                : {
                  id,
                  kindLabel,
                  supportLabel,
                  actionLabel: onSupportClick ? actionLabel : undefined,
                  onSupportClick,
                  position: { left, top },
                  placement,
                }
            ));
          }}
          type="button"
        >
          ?
        </button>
      </span>
    );
  };
  const startDailyRecordEdit = (
    kind: CoreRoutineKind,
    index: number,
    text: string,
  ) => {
    if (
      editingDailyRecord &&
      editingDailyRecord.text !== editingDailyRecord.originalText &&
      !window.confirm('編集中の内容を破棄して、別の記録を編集しますか？')
    ) {
      return;
    }

    setEditingDailyRecord({
      kind,
      index,
      text,
      originalText: text,
    });
  };
  const cancelDailyRecordEdit = () => {
    setEditingDailyRecord(null);
  };
  const saveDailyRecordEdit = () => {
    if (!editingDailyRecord) {
      return;
    }

    const { kind, index, text } = editingDailyRecord;

    if (kind === 'memo') {
      setDailyMemoDateKey(selectedDateKey);
      setDailyMemo((currentEntries) =>
        updateSavedDailyRecordEntryText(currentEntries, index, text),
      );
    } else {
      setDailyEventDateKey(selectedDateKey);
      setDailyEvent((currentEntries) =>
        updateSavedDailyRecordEntryText(currentEntries, index, text),
      );
    }

    setRecordRevision((revision) => revision + 1);
    setEditingDailyRecord(null);
  };
  const renderTodayDailyRecordCard = (kind: CoreRoutineKind) => {
    const isMemo = kind === 'memo';
    const entries = isMemo ? dailyMemo : dailyEvent;
    const label = isMemo ? dailyOneLineLabel : dailyEventLabel;
    const icon = isMemo ? '✍️' : '📖';
    const placeholder = isMemo
      ? '今日の気付きや思ったことを書き残しておこう'
      : `${isToday ? '今日あったことややったこと書き残してみよう' : '昨日あったことややったこと書き残してみよう'}`;
    const updateEntry = isMemo
      ? updateDailyMemoForSelectedDate
      : updateDailyEventForSelectedDate;
    const saveEntry = isMemo
      ? saveDailyMemoForSelectedDate
      : saveDailyEventForSelectedDate;
    const primaryRef = isMemo ? dailyMemoTextareaRef : dailyEventTextareaRef;
    const cardRef = isMemo ? dailyMemoCardRef : dailyEventCardRef;
    const savedEntries = entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.saved && hasMeaningfulText(entry.text));
    const draftEntries = entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => !entry.saved);

    return (
      <section
        aria-label={label}
        className="today-record-write-card"
        data-record-kind={kind}
        ref={cardRef}
      >
        <div className="today-record-write-header">
          <h2>{icon} {label}</h2>
        </div>
        {savedEntries.length > 0 && (
          <div className="today-record-saved-list">
            {savedEntries.map(({ entry, index }) => {
              const savedTime = formatDailyRecordSavedTime(entry.savedAt);
              const isEditing =
                editingDailyRecord?.kind === kind && editingDailyRecord.index === index;

              return (
                <article
                  className="today-record-saved-item"
                  data-editing={isEditing ? 'true' : 'false'}
                  key={`${kind}-saved-${index}`}
                >
                  {isEditing ? (
                    <div className="today-record-edit-row">
                      <textarea
                        aria-label={`${label} ${index + 1}を編集`}
                        onChange={(event) => {
                          adjustTextareaHeight(event.currentTarget);
                          setEditingDailyRecord((currentEdit) =>
                            currentEdit && currentEdit.kind === kind && currentEdit.index === index
                              ? { ...currentEdit, text: event.target.value }
                              : currentEdit,
                          );
                        }}
                        onKeyDown={(event) => {
                          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                            event.preventDefault();
                            saveDailyRecordEdit();
                          }
                        }}
                        ref={(element) => {
                          dailyRecordEditTextareaRef.current = element;
                          adjustTextareaHeight(element);
                        }}
                        rows={isMemo ? 2 : 4}
                        value={editingDailyRecord.text}
                      />
                      <div className="today-record-edit-actions">
                        <button onClick={cancelDailyRecordEdit} type="button">
                          キャンセル
                        </button>
                        <button
                          disabled={!hasMeaningfulText(editingDailyRecord.text)}
                          onClick={saveDailyRecordEdit}
                          type="button"
                        >
                          保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        className="today-record-saved-text-button"
                        onClick={() => startDailyRecordEdit(kind, index, entry.text)}
                        type="button"
                      >
                        {entry.text.trim()}
                      </button>
                      {savedTime && <time dateTime={entry.savedAt}>{savedTime}</time>}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}
        <div className="today-record-write-fields">
          {draftEntries.map(({ entry, index }, draftIndex) => {
            const canSaveEntry = hasMeaningfulText(entry.text);

            return (
              <div className="today-record-write-row" key={`${kind}-${index}`}>
                <textarea
                  aria-label={`${label} ${index + 1}`}
                  onChange={(event) => {
                    adjustTextareaHeight(event.currentTarget);
                    updateEntry(index, event.target.value);
                  }}
                  placeholder={placeholder}
                  ref={(element) => {
                    if (draftIndex === 0) {
                      primaryRef.current = element;
                    }

                    adjustTextareaHeight(element);
                  }}
                  rows={1}
                  value={entry.text}
                />
                <button
                  aria-label={`${label} ${index + 1}をOKにする`}
                  className="today-record-write-save-button"
                  disabled={!canSaveEntry}
                  onClick={() => {
                    saveEntry(index);
                    window.setTimeout(() => {
                      adjustTextareaHeight(primaryRef.current);
                      primaryRef.current?.focus({ preventScroll: true });
                    }, 0);
                  }}
                  type="button"
                >
                  OK
                </button>
              </div>
            );
          })}
        </div>
      </section>
    );
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
  const getCoreRoutineIdFromEntryKey = (entryKey: string): CoreRoutineId | null => {
    const coreRoutineId = entryKey.replace(/^core:/, '') as CoreRoutineId;

    return coreRoutineDefinitions.some((definition) => definition.id === coreRoutineId)
      ? coreRoutineId
      : null;
  };
  const getFixedQuestKindFromEntryKey = (entryKey: string): FixedQuestKind | null => {
    if (entryKey === 'morning-wake-up') {
      return 'wake';
    }

    if (entryKey === 'night-sleep') {
      return 'sleep';
    }

    if (entryKey === 'fixed-schedule-check') {
      return 'scheduleCheck';
    }

    if (entryKey === 'fixed-todo-check') {
      return 'todoCheck';
    }

    return null;
  };
  const getTargetEntryOrder = (
    draggedKey: string,
    targetSectionId: StartSection,
    beforeKey: string | null,
  ) => {
    const targetSection = displaySections.find((section) => section.id === targetSectionId);

    if (!targetSection) {
      return 10;
    }

    const orderedKeys = getMixedRoutineEntries(targetSection, { includeCoreRoutines: true })
      .map((entry) => entry.key)
      .filter((entryKey) => entryKey !== draggedKey);
    const insertIndex = beforeKey ? orderedKeys.indexOf(beforeKey) : orderedKeys.length;
    const safeInsertIndex = insertIndex >= 0 ? insertIndex : orderedKeys.length;

    orderedKeys.splice(safeInsertIndex, 0, draggedKey);

    return ((orderedKeys.indexOf(draggedKey) >= 0 ? orderedKeys.indexOf(draggedKey) : safeInsertIndex) + 1) * 10;
  };
  const moveQuestEntry = (
    draggedKey: string,
    targetSectionId: string,
    beforeKey: string | null,
  ) => {
    if (!dailySectionIds.includes(targetSectionId as StartSection)) {
      return;
    }

    if (draggedKey === beforeKey) {
      return;
    }

    const targetStartSectionId = targetSectionId as StartSection;
    const nextOrder = getTargetEntryOrder(draggedKey, targetStartSectionId, beforeKey);
    const coreRoutineId = getCoreRoutineIdFromEntryKey(draggedKey);
    const fixedQuestKind = getFixedQuestKindFromEntryKey(draggedKey);

    if (coreRoutineId) {
      setCoreRoutinePlacements((currentPlacements) => ({
        ...currentPlacements,
        [coreRoutineId]: {
          sectionId: targetStartSectionId,
          order: nextOrder,
        },
      }));
      return;
    }

    if (fixedQuestKind === 'wake' || fixedQuestKind === 'sleep') {
      const targetTemplate = page === 'today' ? selectedDateTemplate : editTargetKey;

      setRhythmSettings((currentSettings) => ({
        ...currentSettings,
        [targetTemplate]: {
          ...currentSettings[targetTemplate],
          fixedQuestPlacements: {
            ...currentSettings[targetTemplate].fixedQuestPlacements,
            [fixedQuestKind]: {
              sectionId: targetStartSectionId,
              order: nextOrder,
            },
          },
        },
      }));
      return;
    }

    updateSectionsForTarget(getUpdateTargetForSection(targetSectionId), (currentSections) => {
      const draggedItem = currentSections
        .flatMap((section) => section.items)
        .find((item) => item.id === draggedKey);

      if (!draggedItem) {
        return currentSections;
      }

      const targetSection = currentSections.find((section) => section.id === targetSectionId);

      if (!targetSection) {
        return currentSections;
      }

      const nextSections = currentSections.map((section) => ({
        ...section,
        items: section.items.filter((item) => item.id !== draggedKey),
      }));

      return nextSections.map((section) => {
        const nextItems = [...section.items];

        if (section.id === targetSectionId) {
          const insertIndex = beforeKey
            ? nextItems.findIndex((item) => item.id === beforeKey)
            : nextItems.length;
          const safeInsertIndex = insertIndex >= 0 ? insertIndex : nextItems.length;

          nextItems.splice(safeInsertIndex, 0, draggedItem);
        }

        return {
          ...section,
          items: nextItems.map((item, index) => ({
            ...item,
            order: (index + 1) * 10,
          })),
        };
      });
    });
  };
  const moveQuestEntryAtPoint = (
    draggedKey: string,
    clientX: number,
    clientY: number,
    shouldCommit = false,
  ) => {
    const targetElement = document.elementFromPoint(clientX, clientY);
    const targetItem = targetElement?.closest<HTMLElement>(
      '.routine-item[data-routine-kind="quest"]',
    );
    const targetItemId = targetItem?.dataset.routineId;
    const targetSectionId =
      targetItem?.dataset.sectionId ??
      targetElement?.closest<HTMLElement>('.routine-section')?.dataset.sectionId;

    if (
      !targetSectionId ||
      !dailySectionIds.includes(targetSectionId as StartSection)
    ) {
      return false;
    }

    setDropRoutineSectionId(targetSectionId);
    if (!shouldCommit || targetItemId === draggedKey) {
      return true;
    }

    moveQuestEntry(
      draggedKey,
      targetSectionId,
      targetItemId && targetItemId !== draggedKey ? targetItemId : null,
    );

    return true;
  };

  const routineRenderSections = displaySections;
  const activeMenuViewOption = menuViewOptions.find((option) => option.key === menuView);
  const menuViewOptionMap = new Map(menuViewOptions.map((option) => [option.key, option]));

  return (
    <main
      className="app"
      data-page={page}
      data-record-view={isLibraryRecordView ? recordView : undefined}
      data-timer-alert={activeTimer?.isComplete && !timerAlertSilenced ? 'true' : 'false'}
    >
      {activeQuestInfo && typeof document !== 'undefined' && createPortal(
        <span
          className="quest-info-popover"
          data-placement={activeQuestInfo.placement}
          data-quest-info-ui="true"
          role="status"
          style={{
            left: `${activeQuestInfo.position.left}px`,
            top: `${activeQuestInfo.position.top}px`,
          }}
        >
          <strong>{activeQuestInfo.kindLabel}</strong>
          <span>{activeQuestInfo.supportLabel}</span>
          {activeQuestInfo.onSupportClick && activeQuestInfo.actionLabel && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                const supportAction = activeQuestInfo.onSupportClick;
                setActiveQuestInfo(null);
                supportAction?.();
              }}
              type="button"
            >
              {activeQuestInfo.actionLabel}
            </button>
          )}
        </span>,
        document.body,
      )}
      <nav
        className="bottom-tab-nav main-tab-nav"
        aria-label="メインナビゲーション"
      >
        {mainPageOptions.map((option) => (
          <button
            aria-current={page === option.key ? 'page' : undefined}
            className="bottom-tab-item main-tab-item"
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

      <div
        className="app-content"
        data-swipe-back={isLibraryDetailView ? 'true' : undefined}
        data-swipe-back-animating={isLibraryBackAnimating ? 'true' : undefined}
        onTouchCancel={handleLibraryBackTouchEnd}
        onTouchEnd={handleLibraryBackTouchEnd}
        onTouchMove={handleLibraryBackTouchMove}
        onTouchStart={handleLibraryBackTouchStart}
      >
        <header
          className={[
            'app-header',
            page === 'today' ? 'today-title-header' : '',
            isLibraryDetailView ? 'library-detail-header' : '',
          ].filter(Boolean).join(' ')}
        >
          <div className="top-bar">
            <p className="project-name">hibitin</p>
          </div>
          {isLibraryDetailView && (
            <button
              className="header-back-icon-button"
              aria-label={isAnyMemoFolderDetailView ? 'フォルダ一覧へ戻る' : 'かばん一覧へ戻る'}
              onClick={() => returnFromLibraryDetail()}
              type="button"
            >
              ‹
            </button>
          )}
          <h1>
            {page === 'today' && (
              <>
                <span>ぼくらの</span>
                <span>ゆるい日々ティン帳</span>
              </>
            )}
            {page === 'history' && 'スタンプ帳'}
            {page === 'todos' && 'やること'}
            {page === 'schedule' && 'スケジュール'}
            {page === 'library' && menuView === 'list' && 'かばん'}
            {page === 'library' && menuView !== 'list' && activeMenuViewOption
              ? `${activeMenuViewOption.icon} ${activeMenuViewOption.label}`
              : ''}
          </h1>
          {isLibraryRecordView && <p className="record-header-kicker">かばん</p>}
          {page === 'today' && <p className="daily-message">{dailyMessage}</p>}
        </header>

        {page === 'library' && menuView === 'list' && (
          <section className="menu-page library-page" aria-label="かばん">
            {libraryCategories.map((category) => (
              <section
                className="library-category"
                data-category={category.key}
                key={category.title}
              >
                <h2>
                  <span aria-hidden="true">{category.icon}</span>
                  {category.title}
                </h2>
                <div className="menu-list">
                  {category.items.map((itemKey) => {
                    const option = menuViewOptionMap.get(itemKey);

                    if (!option) {
                      return null;
                    }

                    return (
                      <button
                        className="menu-list-card"
                        key={option.key}
                        onClick={() => openMenuView(option.key)}
                        type="button"
                      >
                        <span className="menu-list-icon" aria-hidden="true">
                          {option.icon}
                        </span>
                        <span className="menu-list-copy">
                          <strong>{option.label}</strong>
                          <small>{option.description}</small>
                        </span>
                        <span className="menu-list-arrow" aria-hidden="true">
                          ›
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </section>
        )}

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

        {isMenuTimerView && (
          <section className="common-timer-page" aria-label="タイマー">
            <div className="common-timer-header">
              <p>TOOL</p>
              <h2>⏱ タイマー</h2>
              <span>時間を決めて、少しだけ集中する道具です。</span>
            </div>
            <div className="common-timer-display" data-finished={activeTimer?.isComplete ? 'true' : 'false'}>
              <span>{activeTimer?.isComplete ? '終了しました' : activeTimer ? '残り時間' : '待機中'}</span>
              <strong>
                {activeTimer
                  ? formatTimerSeconds(activeTimer.remainingSeconds)
                  : formatTimerSeconds(getSecondsFromTimerParts(timerDraftParts))}
              </strong>
              {activeTimer && (
                <small>
                  設定 {formatTimerDuration(activeTimer.durationSeconds)}
                </small>
              )}
            </div>
            {!activeTimer && (
              <div className="common-timer-settings">
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
                      aria-label="タイマーの時間"
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
                      aria-label="タイマーの分"
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
                      aria-label="タイマーの秒"
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
              </div>
            )}
            <div className="common-timer-actions">
              {!activeTimer ? (
                <button
                  disabled={getSecondsFromTimerParts(timerDraftParts) <= 0}
                  onClick={() => startCommonTimer(getSecondsFromTimerParts(timerDraftParts))}
                  type="button"
                >
                  開始
                </button>
              ) : activeTimer.isComplete ? (
                <>
                  <button onClick={extendFinishedTimerByFiveMinutes} type="button">
                    ＋5分
                  </button>
                  <button onClick={closeActiveTimerPanel} type="button">
                    閉じる
                  </button>
                </>
              ) : (
                <>
                  {activeTimer.isRunning ? (
                    <button onClick={pauseActiveTimer} type="button">
                      一時停止
                    </button>
                  ) : (
                    <button onClick={resumeActiveTimer} type="button">
                      再開
                    </button>
                  )}
                  <button onClick={resetActiveTimer} type="button">
                    リセット
                  </button>
                  <button onClick={closeActiveTimerPanel} type="button">
                    閉じる
                  </button>
                </>
              )}
            </div>
            {notificationPermission === 'default' && (
              <button
                className="timer-permission-button common-timer-permission"
                onClick={requestNotificationPermission}
                type="button"
              >
                ブラウザ通知を許可
              </button>
            )}
          </section>
        )}

        {isTodayStatusView && (
          <section className="player-status-page" aria-label="ステータス">
            <div className="player-status-page-header">
              <p>STATUS</p>
              <h2>🏅 ステータス</h2>
            </div>
            <div className="player-status-block">
              <div className="player-status-block-header">
                <h3>プレイヤー基本情報</h3>
                {isStatusProfileEditing ? (
                  <div className="player-status-actions">
                    <button
                      disabled={!statusProfileDraft.displayName.trim()}
                      onClick={saveStatusProfileEditing}
                      type="button"
                    >
                      保存
                    </button>
                    <button onClick={cancelStatusProfileEditing} type="button">
                      キャンセル
                    </button>
                  </div>
                ) : (
                  <button onClick={startStatusProfileEditing} type="button">
                    編集
                  </button>
                )}
              </div>
              <PlayerStatusCard
                freeQuestCount={freeQuestCount}
                isDetailOpen={isRankPanelOpen}
                onCloseDetail={() => setIsRankPanelOpen(false)}
                onToggleDetail={() => {
                  setNoteEditorTarget(null);
                  setIsRankPanelOpen((current) => !current);
                }}
                playerDisplayName={playerDisplayName}
                playerEconomy={playerEconomy}
                playerIconEmoji={playerIcon.emoji}
                playerRankProgress={playerRankProgress}
                selectedDateEarnedPoints={selectedDateEarnedPoints}
                selectedDateEarnedPointsLabel={selectedDateEarnedPointsLabel}
              />
              {isStatusProfileEditing && (
                <div className="player-status-edit-panel">
                  <label>
                    <span>プレイヤー名</span>
                    <input
                      maxLength={20}
                      onChange={(event) =>
                        setStatusProfileDraft((currentDraft) => ({
                          ...currentDraft,
                          displayName: event.target.value.slice(0, 20),
                        }))
                      }
                      placeholder="名前を入力"
                      type="text"
                      value={statusProfileDraft.displayName}
                    />
                  </label>
                  <div className="player-status-icon-edit">
                    <button
                      className="player-status-icon-button"
                      onClick={() => setIsIconPickerOpen((current) => !current)}
                      type="button"
                    >
                      <span aria-hidden="true">{getPlayerIconOption(statusProfileDraft.iconId).emoji}</span>
                      アイコンを選ぶ
                    </button>
                    {isIconPickerOpen && (
                      <div className="player-status-icon-grid" role="radiogroup" aria-label="ステータス用アイコン">
                        {playerIconOptions.map((option) => (
                          <button
                            aria-checked={statusProfileDraft.iconId === option.id}
                            aria-label={option.label}
                            data-active={statusProfileDraft.iconId === option.id ? 'true' : 'false'}
                            key={option.id}
                            onClick={() =>
                              setStatusProfileDraft((currentDraft) => ({
                                ...currentDraft,
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
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="player-status-block player-status-favorite-badges">
              <h3>お気に入りバッジ</h3>
              <div className="favorite-badge-list">
                {playerBadges.favoriteBadgeIds.length > 0 ? (
                  playerBadges.favoriteBadgeIds.map((badgeId) => {
                    const badge = basicBadgeDefinitions.find((definition) => definition.id === badgeId);

                    if (!badge) {
                      return null;
                    }

                    return (
                      <button
                        className="favorite-badge-chip"
                        key={badge.id}
                        onClick={() => setSelectedBadgeId(badge.id)}
                        type="button"
                      >
                        <span aria-hidden="true">{badge.icon}</span>
                        {badge.name}
                      </button>
                    );
                  })
                ) : (
                  <p>取得済みバッジから最大3個まで選べます。</p>
                )}
              </div>
            </div>
            <div className="player-status-block player-status-growth-block">
              <h3>成長情報</h3>
              <div className="player-status-summary-grid">
                <div>
                  <span>Rank</span>
                  <strong>{playerRankProgress.rank}</strong>
                </div>
                <div>
                  <span>累計獲得スター</span>
                  <strong>{playerEconomy.lifetimeStarsEarned}★</strong>
                </div>
                <div>
                  <span>✨ PTボーナス倍率</span>
                  <strong>×{playerRankProgress.multiplier.toFixed(2)}</strong>
                </div>
              </div>
            </div>
            <div className="player-status-block player-status-holdings-block">
              <h3>所持情報</h3>
              <div className="player-status-summary-grid">
                <div>
                  <span>所持PT</span>
                  <strong>{playerEconomy.currentPoints}PT</strong>
                </div>
                <div>
                  <span>フリークエスト数</span>
                  <strong>{freeQuestCount}個</strong>
                </div>
                <div>
                  <span>獲得バッジ</span>
                  <strong>{Object.keys(playerBadges.earned).length}個</strong>
                </div>
              </div>
            </div>
            <div className="player-status-block player-status-profile-block">
              <div className="player-status-block-header">
                <h3>プロフィール</h3>
                {!isStatusProfileEditing && (
                  <button onClick={startStatusProfileEditing} type="button">
                    編集
                  </button>
                )}
              </div>
              {isStatusProfileEditing ? (
                <div className="player-status-profile-edit">
                  {([
                    ['oneLineProfile', 'ひとことプロフィール', '今日も、ゆるく一歩。', 120],
                    ['favoriteThings', '好きなこと', 'ランニング、ゲーム、まちづくり', 200],
                    ['currentGoal', '今の目標', '毎日少しずつ前へ進む', 200],
                  ] as const).map(([field, label, placeholder, maxLength]) => (
                    <label key={field}>
                      <span>{label}</span>
                      <textarea
                        maxLength={maxLength}
                        onChange={(event) => {
                          adjustTextareaHeight(event.currentTarget);
                          setStatusProfileDraft((currentDraft) => ({
                            ...currentDraft,
                            [field]: event.target.value.slice(0, maxLength),
                          }));
                        }}
                        placeholder={placeholder}
                        ref={adjustTextareaHeight}
                        rows={1}
                        value={statusProfileDraft[field]}
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <dl className="player-status-profile-read">
                  <div>
                    <dt>ひとことプロフィール</dt>
                    <dd>{playerProfile.oneLineProfile || '未入力'}</dd>
                  </div>
                  <div>
                    <dt>好きなこと</dt>
                    <dd>{playerProfile.favoriteThings || '未入力'}</dd>
                  </div>
                  <div>
                    <dt>今の目標</dt>
                    <dd>{playerProfile.currentGoal || '未入力'}</dd>
                  </div>
                </dl>
              )}
            </div>
            <div className="player-status-block player-status-badge-block">
              <h3>バッジ一覧</h3>
              <div className="badge-grid">
                {basicBadgeDefinitions.map((badge) => {
                  const earnedAt = playerBadges.earned[badge.id];
                  const isEarned = Boolean(earnedAt);
                  const isFavorite = playerBadges.favoriteBadgeIds.includes(badge.id);

                  return (
                    <article
                      className="badge-card"
                      data-earned={isEarned ? 'true' : 'false'}
                      key={badge.id}
                    >
                      <button
                        className="badge-card-main"
                        onClick={() => setSelectedBadgeId(badge.id)}
                        type="button"
                      >
                        <span className="badge-card-icon" aria-hidden="true">{badge.icon}</span>
                        <span>
                          <strong>{badge.name}</strong>
                          <small>
                            {isEarned && earnedAt
                              ? `${getDateFromKey(getDateKey(new Date(earnedAt))).getMonth() + 1}月${getDateFromKey(getDateKey(new Date(earnedAt))).getDate()}日 獲得`
                              : '未獲得'}
                          </small>
                        </span>
                      </button>
                      <button
                        className="badge-favorite-button"
                        disabled={!isEarned || (!isFavorite && playerBadges.favoriteBadgeIds.length >= 3)}
                        onClick={() => toggleFavoriteBadge(badge.id)}
                        type="button"
                      >
                        {isFavorite ? '★' : '☆'}
                      </button>
                    </article>
                  );
                })}
              </div>
              {selectedBadgeId && (() => {
                const badge = basicBadgeDefinitions.find((definition) => definition.id === selectedBadgeId);

                if (!badge) {
                  return null;
                }

                const earnedAt = playerBadges.earned[badge.id];

                return (
                  <div className="badge-detail-panel" role="status">
                    <span aria-hidden="true">{badge.icon}</span>
                    <div>
                      <strong>{badge.name}</strong>
                      <p>{badge.description}</p>
                      <small>{earnedAt ? `${backupDateTimeFormatter.format(new Date(earnedAt))} 獲得` : 'まだ獲得していません'}</small>
                    </div>
                    <button onClick={() => setSelectedBadgeId(null)} type="button">
                      ×
                    </button>
                  </div>
                );
              })()}
            </div>
          </section>
        )}

        {isSettingsView && (
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
                    '現在のhibitinと同じく、制限なしでクエストを作れるモードです。',
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

        {isSettingsView && (
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

        {isSettingsView && (
          <section className="account-settings" aria-label="アカウント">
            <div className="settings-header">
              <div>
                <h2>アカウント</h2>
                <p>ログインするとアカウント状態を保持できます。クラウド同期はまだ行いません。</p>
              </div>
            </div>
            <div
              className="supabase-connection-status"
              data-status={supabaseConnectionStatus}
            >
              <span>Supabase接続状態</span>
              <strong>{supabaseConnectionLabels[supabaseConnectionStatus]}</strong>
            </div>
            {!isSupabaseConfigured && (
              <p className="account-notice">
                クラウド機能はまだ設定されていません。今までどおり端末内データで使えます。
              </p>
            )}
            {authUser ? (
              <div className="account-status-card">
                <dl>
                  <div>
                    <dt>ログイン中</dt>
                    <dd>{authUser.email ?? 'メールアドレス未取得'}</dd>
                  </div>
                  <div>
                    <dt>状態</dt>
                    <dd>アカウント接続中</dd>
                  </div>
                  <div>
                    <dt>管理者</dt>
                    <dd>{isAdminChecking ? '確認中…' : isAdminUser ? '有効' : '通常ユーザー'}</dd>
                  </div>
                </dl>
                <button
                  disabled={isAuthBusy}
                  onClick={() => void signOutAccount()}
                  type="button"
                >
                  ログアウト
                </button>
              </div>
            ) : (
              <div className="account-auth-form">
                <label>
                  <span>メールアドレス</span>
                  <input
                    autoComplete="email"
                    disabled={isAuthBusy}
                    inputMode="email"
                    onChange={(event) => setAuthEmail(event.target.value)}
                    placeholder="mail@example.com"
                    type="email"
                    value={authEmail}
                  />
                </label>
                <label>
                  <span>パスワード</span>
                  <input
                    autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                    disabled={isAuthBusy}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    placeholder="6文字以上"
                    type="password"
                    value={authPassword}
                  />
                </label>
                <div className="account-auth-actions">
                  <button
                    disabled={isAuthBusy}
                    onClick={() => void handleAuthAction('login')}
                    type="button"
                  >
                    ログイン
                  </button>
                  <button
                    disabled={isAuthBusy}
                    onClick={() => void handleAuthAction('signup')}
                    type="button"
                  >
                    新規登録
                  </button>
                </div>
                <button
                  className="account-reset-button"
                  disabled={isAuthBusy}
                  onClick={() => void sendPasswordResetEmail()}
                  type="button"
                >
                  パスワードを忘れた場合
                </button>
              </div>
            )}
            {authMessage && <p className="account-message">{authMessage}</p>}
          </section>
        )}

        {isSettingsView && isAdminUser && (
          <section className="daily-nudge-admin-settings" aria-label="管理">
            <div className="settings-header">
              <div>
                <h2>管理</h2>
                <p>全プレイヤー共通のhibitin設定を管理します。</p>
              </div>
              <button
                disabled={isDailyQuestMasterBusy}
                onClick={() => void refreshDailyQuestMaster({ includeInactive: true })}
                type="button"
              >
                再取得
              </button>
            </div>
            <div className="supabase-connection-status" data-status={dailyQuestMasterStatus}>
              <span>ログインクエスト共通マスター</span>
              <strong>{dailyQuestMasterStatusLabels[dailyQuestMasterStatus]}</strong>
            </div>
            <div className="settings-header compact-settings-header">
              <div>
                <h3>ログインクエスト管理</h3>
                <p>
                  ここで保存した候補は全プレイヤー共通で使われます。今日すでに割り当て済みの記録は変更されません。
                </p>
              </div>
            </div>
            <div className="daily-nudge-admin-list">
              {[...dailyQuestAdminCandidates]
                .sort((first, second) => first.order - second.order)
                .map((candidate, index, orderedCandidates) => (
                  <article className="daily-nudge-admin-card" key={candidate.id}>
                    <div className="daily-nudge-admin-card-header">
                      <label>
                        <input
                          checked={candidate.enabled}
                          disabled={isDailyQuestMasterBusy}
                          onChange={(event) => {
                            updateDailyQuestAdminCandidate(
                              candidate.id,
                              'enabled',
                              event.target.checked,
                            );
                          }}
                          type="checkbox"
                        />
                        <span>{candidate.enabled ? '有効' : '無効'}</span>
                      </label>
                      <div className="daily-nudge-admin-card-actions">
                        <button
                          disabled={isDailyQuestMasterBusy || index === 0}
                          onClick={() => void moveDailyQuestAdminCandidate(candidate.id, -1)}
                          type="button"
                        >
                          上へ
                        </button>
                        <button
                          disabled={isDailyQuestMasterBusy || index === orderedCandidates.length - 1}
                          onClick={() => void moveDailyQuestAdminCandidate(candidate.id, 1)}
                          type="button"
                        >
                          下へ
                        </button>
                        <button
                          disabled={isDailyQuestMasterBusy}
                          onClick={() => void deleteDailyQuestAdminCandidate(candidate.id)}
                          type="button"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                    <label>
                      <span>提案文</span>
                      <textarea
                        disabled={isDailyQuestMasterBusy}
                        onChange={(event) =>
                          updateDailyQuestAdminCandidate(candidate.id, 'text', event.target.value)
                        }
                        rows={2}
                        value={candidate.text}
                      />
                    </label>
                    <label>
                      <span>完了メッセージ</span>
                      <input
                        disabled={isDailyQuestMasterBusy}
                        onChange={(event) =>
                          updateDailyQuestAdminCandidate(
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
                        disabled={isDailyQuestMasterBusy}
                        onChange={(event) =>
                          updateDailyQuestAdminCandidate(candidate.id, 'category', event.target.value)
                        }
                        type="text"
                        value={candidate.category}
                      />
                    </label>
                    <p className="daily-nudge-admin-id">
                      slug: {candidate.id}
                      {candidate.masterId ? ` / id: ${candidate.masterId}` : ' / 未保存'}
                    </p>
                    <div className="daily-nudge-admin-card-actions">
                      <button
                        disabled={isDailyQuestMasterBusy}
                        onClick={() => void saveDailyQuestMasterCandidate(candidate)}
                        type="button"
                      >
                        保存
                      </button>
                    </div>
                  </article>
                ))}
            </div>
            <button
              className="daily-nudge-add-button"
              disabled={isDailyQuestMasterBusy}
              onClick={addDailyQuestAdminCandidate}
              type="button"
            >
              候補追加
            </button>
            {dailyQuestMasterMessage && (
              <p className="account-message">{dailyQuestMasterMessage}</p>
            )}
          </section>
        )}

        {isSettingsView && gameMode === 'developer' && (
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
                    ['dailyNudge', '今日のログインクエスト'],
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
                      <span>PTボーナス倍率</span>
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
                      <li>ランクによるPTボーナス倍率</li>
                      <li>PTおよびランクの表示</li>
                      <li>今日のログインクエスト完了によるPT獲得</li>
                      <li>今日のログインクエスト連続記録</li>
                      <li>記憶系固定クエスト完了によるPT獲得</li>
                      <li>記憶系固定クエスト本文削除によるPT取消</li>
                      <li>かばん内のショップ</li>
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

        {isSettingsView && (
          <section className="template-settings">
            <div className="settings-header">
              <div>
                <h2>テンプレート設定</h2>
                <p>ノーマルと休日のクエスト、曜日ごとの割り当てを管理します。</p>
              </div>
            </div>

            <div className="weekday-assignment" aria-label="曜日割り当て">
              {(['normal', 'holiday'] as TemplateKind[]).map((template) => (
                <div className="template-assignment-column" key={template}>
                  <button
                    className="template-tab-button"
                    data-active={editTargetKey === template ? 'true' : 'false'}
                    onClick={() => {
                      setEditTargetKey(template);
                      setRoutineDrafts({});
                      routineDraftComposingSectionsRef.current.clear();
                    }}
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

        {isTodayQuestView && isToday && todayScheduleItems.length > 0 && (() => {
          const currentMinutes = today.getHours() * 60 + today.getMinutes();
          const nextScheduleItem = todayScheduleItems.find((scheduleItem) => {
            const scheduleMinutes = getScheduleTimeMinutes(scheduleItem.time);

            return scheduleMinutes !== null && scheduleMinutes >= currentMinutes;
          });
          const visibleScheduleItems = todayScheduleItems.slice(0, 3);
          const remainingScheduleCount = Math.max(0, todayScheduleItems.length - visibleScheduleItems.length);

          return (
          <section className="today-schedule-summary-card" aria-label="今日のスケジュール">
            <button
              className="today-schedule-summary-button"
              onClick={openTodayScheduleView}
              type="button"
            >
              <div className="today-schedule-summary-header">
                <h2>🕒 今日のスケジュール</h2>
                <span>{todayScheduleItems.length}件</span>
                <i aria-hidden="true">›</i>
              </div>
              <div className="today-schedule-summary-list">
                {visibleScheduleItems.map((scheduleItem) => {
                  const scheduleMinutes = getScheduleTimeMinutes(scheduleItem.time);
                  const isPastSchedule =
                    scheduleMinutes !== null && scheduleMinutes < currentMinutes;
                  const isNextSchedule = nextScheduleItem?.id === scheduleItem.id;

                  return (
                    <p
                      data-next={isNextSchedule ? 'true' : 'false'}
                      data-past={isPastSchedule ? 'true' : 'false'}
                      key={scheduleItem.id}
                    >
                      <time>{formatScheduleTimeLabel(scheduleItem.time)}</time>
                      <span>{scheduleItem.text.trim() || '（内容未入力）'}</span>
                    </p>
                  );
                })}
              </div>
              {remainingScheduleCount > 0 && (
                <p className="today-schedule-summary-more">ほか{remainingScheduleCount}件</p>
              )}
            </button>
          </section>
          );
        })()}

        {isTodayQuestView && isToday && (() => {
          const todayTodoItems = managedTodos
            .filter((todo) =>
              hasManagedTodoText(todo) &&
              !todo.pendingReview &&
              shouldShowManagedTodoInWorkingList(todo) &&
              todo.dueDate === todayKey,
            );
          const visibleTodoItems = todayTodoItems.slice(0, 3);
          const remainingTodoCount = Math.max(0, todayTodoItems.length - visibleTodoItems.length);

          if (todayTodoItems.length === 0) {
            return null;
          }

          return (
            <section className="today-todo-summary-card" aria-label="今日のやること">
              <div className="today-todo-summary-header">
                <button
                  className="today-todo-summary-title"
                  onClick={openTodayTodoDateView}
                  type="button"
                >
                  <h2>✅ 今日のやること</h2>
                  <span>{todayTodoItems.length}件</span>
                  <i aria-hidden="true">›</i>
                </button>
              </div>
              <div className="today-todo-summary-list">
                {visibleTodoItems.map((todo) => (
                  <label data-completed={todo.completed ? 'true' : 'false'} key={todo.id}>
                    <input
                      checked={todo.completed}
                      onChange={(event) => toggleManagedTodo(todo.id, event.target.checked)}
                      type="checkbox"
                    />
                    <span>{todo.text}</span>
                  </label>
                ))}
              </div>
              {remainingTodoCount > 0 && (
                <button
                  className="today-todo-summary-more"
                  onClick={openTodayTodoDateView}
                  type="button"
                >
                  ほか{remainingTodoCount}件
                </button>
              )}
            </section>
          );
        })()}

        {(isTodayQuestView || isSettingsView) && (
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
                  <p className="result-rank">クエスト未設定</p>
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
          {(isSettingsView || isEditMode) && (
            <div className="routine-context" data-quiet={page === 'today' ? 'true' : 'false'}>
              <p>
                {page === 'today' && isEditMode
                  ? '編集モード中'
                  : page === 'today'
                  ? `${selectedDateKey}だけの変更があります`
                  : `${getTargetLabel(editTarget)}を編集中`}
              </p>
              {isSettingsView && (
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
            const canEditSection =
              canEditRoutines || (page === 'today' && isBonusSection);
            return (
            <section
              className="routine-section"
              data-bonus={isBonusSection ? 'true' : 'false'}
              data-drop-target={dropRoutineSectionId === section.id ? 'true' : 'false'}
              data-section-id={section.id}
              key={section.id}
              onDragEnter={(event) => {
                if (
                  draggedItemId &&
                  canEditRoutines &&
                  dailySectionIds.includes(section.id as StartSection)
                ) {
                  event.preventDefault();
                  setDropRoutineSectionId(section.id);
                }
              }}
              onDragOver={(event) => {
                if (
                  draggedItemId &&
                  canEditRoutines &&
                  dailySectionIds.includes(section.id as StartSection)
                ) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                }
              }}
              onDrop={(event) => {
                if (
                  draggedItemId &&
                  canEditRoutines &&
                  dailySectionIds.includes(section.id as StartSection)
                ) {
                  event.preventDefault();
                  moveQuestEntry(draggedItemId, section.id, null);
                }

                setDraggedItemId(null);
                setDropRoutineSectionId(null);
              }}
            >
              <div className="section-header">
                <div>
                  <h2>
                    <span aria-hidden="true">
                      {sectionIconLabels[section.id]}
                    </span>
                    {section.title}
                  </h2>
                  {isBonusSection && (
                    <p className="section-note">追加でやったこと</p>
                  )}
                </div>
              </div>
              {page === 'today' && section.id === 'morning' && (
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
                    <p className="daily-nudge-empty">ログインクエストは準備中です</p>
                  )}
                </section>
              )}
              {page === 'today' && section.id === 'morning' && (
                <section
                  className="choice-quest-card"
                  data-completed={selectedChoiceQuestRecord?.completed ? 'true' : 'false'}
                  aria-label="選択クエスト"
                >
                  <div className="choice-quest-heading">
                    <div>
                      <h3>選択クエスト</h3>
                      <p>
                        {selectedChoiceQuestRecord?.completed && selectedChoiceQuestOption
                          ? `${selectedChoiceQuestOption.label}を選びました`
                          : '今日の気分でひとつ選ぼう'}
                      </p>
                    </div>
                    {selectedChoiceQuestRecord?.completed && (
                      <span className="choice-quest-complete-badge">達成</span>
                    )}
                  </div>
                  <div className="choice-quest-options" aria-label="選択クエスト候補">
                    {choiceQuestOptions.map((option) => {
                      const isSelected = selectedChoiceQuestRecord?.selectedOptionId === option.id;

                      return (
                        <button
                          aria-pressed={isSelected}
                          data-selected={isSelected ? 'true' : 'false'}
                          disabled={Boolean(selectedChoiceQuestRecord?.completed)}
                          key={option.id}
                          onClick={() => selectChoiceQuestOption(selectedDateKey, option.id)}
                          type="button"
                        >
                          <span aria-hidden="true">{option.icon}</span>
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="choice-quest-actions">
                    {selectedChoiceQuestRecord?.completed ? (
                      <p>
                        ✅ 今日の選択：{selectedChoiceQuestOption?.label ?? '選択済み'}
                      </p>
                    ) : (
                      <button
                        disabled={!selectedChoiceQuestRecord?.selectedOptionId}
                        onClick={() => completeChoiceQuest(selectedDateKey)}
                        type="button"
                      >
                        OK
                      </button>
                    )}
                  </div>
                </section>
              )}
              {page === 'today' && section.id === 'night' && (
                <section
                  className="daily-nudge-card daily-nudge-inline"
                  data-celebrating={
                    nightlyNudgePointFlash && selectedNightlyNudgeAward?.active ? 'true' : 'false'
                  }
                  data-completed={selectedNightlyNudgeRecord?.completed ? 'true' : 'false'}
                  aria-label={nightlyNudgeDisplayLabel}
                >
                  <div className="daily-nudge-heading">
                    <span aria-hidden="true">🌙</span>
                    <div>
                      <h2>{nightlyNudgeDisplayLabel}</h2>
                      {selectedNightlyNudgeRecord && (
                        <p>{selectedNightlyNudgeRecord.category}</p>
                      )}
                    </div>
                    <p className="daily-nudge-streak">一日をやさしく締める</p>
                  </div>
                  {selectedNightlyNudgeRecord ? (
                    <>
                      <p className="daily-nudge-text">{selectedNightlyNudgeRecord.text}</p>
                      <div className="daily-nudge-actions">
                        {selectedNightlyNudgeRecord.completed ? (
                          <span className="daily-nudge-win-label">今日もお疲れさま</span>
                        ) : (
                          <button
                            onClick={() => toggleNightlyNudgeCompletion(selectedDateKey)}
                            type="button"
                          >
                            OK
                          </button>
                        )}
                        {nightlyNudgePointFlash && selectedNightlyNudgeAward?.active && (
                          <span className="daily-nudge-point-pop" key={nightlyNudgePointFlash.id}>
                            +{nightlyNudgePointFlash.points}PT
                          </span>
                        )}
                        {selectedNightlyNudgeRecord.completed && (
                          <p className="daily-nudge-celebration">
                            {selectedNightlyNudgeRecord.celebrationMessage ??
                              selectedNightlyNudgeRecord.completionMessage}
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="daily-nudge-empty">おやすみクエストは準備中です</p>
                  )}
                </section>
              )}
              <div className="routine-items">
                {getMixedRoutineEntries(section, {
                  includeCoreRoutines: page === 'today' && !isBonusSection,
                }).map((entry) => {
                  if (entry.kind === 'core') {
                    const coreRoutine = entry.coreRoutine;
                    const inputId = `core-routine-${coreRoutine.id}`;
                    const isCompleted =
                      selectedCoreRoutineCanComplete &&
                      selectedCoreRoutineCompletion[coreRoutine.id];
                    const canEditCoreRoutine = false;
                    const coreRoutineLabel = coreRoutine.label
                      .replace('今日', coreRoutineDateLabel)
                      .replace('を残す', '');

                    return (
                      <div
                        className="routine-item core-routine-row"
                        data-checked={isCompleted ? 'true' : 'false'}
                        data-core-routine="true"
                        data-dragging={draggedItemId === entry.key ? 'true' : 'false'}
                        data-routine-kind={canEditCoreRoutine ? 'quest' : undefined}
                        data-routine-id={entry.key}
                        data-section-id={section.id}
                        key={entry.key}
                        onClick={(event) => {
                          if ((event.target as HTMLElement).closest('.drag-handle')) {
                            return;
                          }

                          focusDailyRecordField(coreRoutine.kind);
                        }}
                        onDragEnd={() => setDraggedItemId(null)}
                        onDragOver={(event) => {
                          if (canEditCoreRoutine) {
                            event.preventDefault();
                          }
                        }}
                        onDragStart={(event) => {
                          if (!canEditCoreRoutine) {
                            return;
                          }

                          setDraggedItemId(entry.key);
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', entry.key);
                        }}
                        onDrop={(event) => {
                          if (!canEditCoreRoutine) {
                            return;
                          }

                          event.preventDefault();
                          const draggedId =
                            draggedItemId || event.dataTransfer.getData('text/plain');

                          if (draggedId) {
                            moveQuestEntry(draggedId, section.id, entry.key);
                          }

                          setDraggedItemId(null);
                          setDropRoutineSectionId(null);
                        }}
                      >
                        {canEditCoreRoutine && (
                          <span
                            className="drag-handle"
                            aria-label={`${coreRoutineLabel}を移動`}
                            role="button"
                            tabIndex={0}
                            onPointerDown={(event) => {
                              event.preventDefault();
                              setDraggedItemId(entry.key);
                              event.currentTarget.setPointerCapture(event.pointerId);
                            }}
                            onPointerMove={(event) => {
                              if (event.clientY < 90) {
                                window.scrollBy({ top: -12, behavior: 'auto' });
                              } else if (window.innerHeight - event.clientY < 120) {
                                window.scrollBy({ top: 12, behavior: 'auto' });
                              }

                              moveQuestEntryAtPoint(entry.key, event.clientX, event.clientY);
                            }}
                            onPointerCancel={(event) => {
                              setDraggedItemId(null);
                              setDropRoutineSectionId(null);

                              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                                event.currentTarget.releasePointerCapture(event.pointerId);
                              }
                            }}
                            onPointerUp={(event) => {
                              moveQuestEntryAtPoint(entry.key, event.clientX, event.clientY, true);
                              setDraggedItemId(null);
                              setDropRoutineSectionId(null);

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
                          {renderQuestInfoButton({
                            id: `today-core-${coreRoutine.id}`,
                            kind: 'fixed',
                            onSupportClick: () => focusDailyRecordField(coreRoutine.kind),
                            supportLabel: 'ひとことへ',
                          })}
                          <button
                            className="inline-record-open-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              focusDailyRecordField(coreRoutine.kind);
                            }}
                            type="button"
                          >
                            開く
                          </button>
                        </div>
                      </div>
                    );
                  }

                  const item = entry.item;
                  const inputId = `routine-${item.id}`;
                  const isEditing = editingItemId === item.id;
                  const isFixedItem = fixedRoutineIds.has(item.id);
                  const isTimedFixedItem = item.fixedKind === 'wake' || item.fixedKind === 'sleep';
                  const canDragQuest =
                    canEditRoutines &&
                    isCoreRoutineSectionId(section.id) &&
                    !isFixedItem;
                  const itemMasteryStats = masteryStatsByItemId.get(item.id);
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
                      data-routine-kind={canDragQuest ? 'quest' : undefined}
                      data-routine-id={item.id}
                      data-section-id={section.id}
                      onDragEnd={() => setDraggedItemId(null)}
                      onDragOver={(event) => {
                        if (canDragQuest && draggedItemId) {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'move';
                        }
                      }}
                      onDrop={(event) => {
                        if (!canDragQuest) {
                          return;
                        }

                        event.preventDefault();
                        event.stopPropagation();
                        const draggedId =
                          draggedItemId || event.dataTransfer.getData('text/plain');

                        if (draggedId) {
                          moveQuestEntry(draggedId, section.id, item.id);
                        }

                        setDraggedItemId(null);
                        setDropRoutineSectionId(null);
                      }}
                      key={item.id}
                    >
                      {canDragQuest && (
                        <span
                          className="drag-handle"
                          aria-label={`${item.label}を移動`}
                          role="button"
                          tabIndex={0}
                          onPointerDown={(event) => {
                            event.preventDefault();
                            setDraggedItemId(item.id);
                            event.currentTarget.setPointerCapture(event.pointerId);
                          }}
                          onPointerMove={(event) => {
                            if (event.clientY < 90) {
                              window.scrollBy({ top: -12, behavior: 'auto' });
                            } else if (window.innerHeight - event.clientY < 120) {
                              window.scrollBy({ top: 12, behavior: 'auto' });
                            }

                            moveQuestEntryAtPoint(item.id, event.clientX, event.clientY);
                          }}
                          onPointerCancel={(event) => {
                            setDraggedItemId(null);
                            setDropRoutineSectionId(null);

                            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                              event.currentTarget.releasePointerCapture(event.pointerId);
                            }
                          }}
                          onPointerUp={(event) => {
                            moveQuestEntryAtPoint(item.id, event.clientX, event.clientY, true);
                            setDraggedItemId(null);
                            setDropRoutineSectionId(null);

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
                          onChange={() => {
                            if (openFixedQuestDestination(item.fixedKind)) {
                              return;
                            }

                            toggleItem(item.id);
                          }}
                          type="checkbox"
                        />
                      </label>
                      <div className="routine-name">
                        {isEditing && !isFixedItem && (canEditSection || canEditRoutineDetails) ? (
                          <input
                            autoFocus
                            onBlur={() => finishEditingItem(item, section.id)}
                            onChange={(event) => setEditingLabel(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
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
                            {renderQuestInfoButton({
                              id: `today-routine-${item.id}`,
                              kind: 'fixed',
                              supportLabel: getFixedQuestSupportLabel(item.fixedKind),
                            })}
                            {isTimedFixedItem && canEditRoutines ? (
                              <input
                                aria-label={`${item.label}の時刻`}
                                className="fixed-time-input"
                                onChange={(event) => updateFixedItemTime(item, event.target.value)}
                                type="time"
                                value={item.time ?? ''}
                              />
                            ) : isTimedFixedItem ? (
                              <span className="fixed-time-display">{item.time}</span>
                            ) : null}
                          </span>
                        ) : (
                          <button
                            className="routine-name-button"
                            disabled={!canEditRoutineDetails}
                            onClick={() => {
                              if (!canEditRoutineDetails) {
                                return;
                              }

                              setEditingItemId(item.id);
                              setEditingLabel(item.label);
                            }}
                            type="button"
                          >
                            {getCoreRoutineDisplayLabel(item, {
                              showRoutineNumber: page !== 'today',
                            })}
                          </button>
                        )}
                        {!isFixedItem && renderQuestInfoButton({
                          id: `today-routine-${item.id}`,
                          kind: 'core',
                          onSupportClick:
                            canEditRoutineDetails
                              ? () => {
                                setEditingItemId(item.id);
                                setEditingLabel(item.label);
                              }
                              : undefined,
                          supportLabel: '変更可能',
                        })}
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
                {canEditSection && Object.prototype.hasOwnProperty.call(routineDrafts, section.id) && (
                  <div
                    className="routine-item routine-draft-item"
                    data-section-id={section.id}
                    data-routine-draft="true"
                  >
                    <span className="routine-check routine-draft-check" aria-hidden="true" />
                    <div className="routine-name">
                      <input
                        aria-label={`${section.title}へ追加するフリークエスト`}
                        autoFocus
                        onBlur={(event) => commitRoutineDraft(section.id, event.currentTarget.value)}
                        onChange={(event) => updateRoutineDraft(section.id, event.target.value)}
                        onCompositionEnd={(event) => {
                          routineDraftComposingSectionsRef.current.delete(section.id);
                          updateRoutineDraft(section.id, event.currentTarget.value);
                        }}
                        onCompositionStart={() =>
                          routineDraftComposingSectionsRef.current.add(section.id)
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                            event.currentTarget.blur();
                          }

                          if (event.key === 'Escape') {
                            discardRoutineDraft(section.id);
                          }
                        }}
                        placeholder={isBonusSection ? '追加でやったこと' : 'クエスト名を入力'}
                        type="text"
                        value={routineDrafts[section.id] ?? ''}
                      />
                    </div>
                  </div>
                )}
              </div>
              {canEditSection && !Object.prototype.hasOwnProperty.call(routineDrafts, section.id) && (
                <button
                  className="add-button section-add-button"
                  onClick={() => addRoutine(section.id)}
                  type="button"
                >
                  ＋追加
                </button>
              )}
            </section>
            );
          })}
          {isTodayQuestView && !isEditMode && (
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

        {isTodayQuestView && !isEditMode && (
          <div className="today-record-write-cards">
            {renderTodayDailyRecordCard('memo')}
            {renderTodayDailyRecordCard('events')}
          </div>
        )}

        {isTodayNotesView && !isEditMode && (
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

        {isTodayNotesView && !isEditMode && (
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

        {isTodayScheduleView && (
          <section
            className="schedule-page records-page record-view-content"
            aria-label="スケジュール"
            key="schedule"
          >
            <div className="schedule-view-tabs" aria-label="スケジュール表示切り替え">
              {([
                ['list', 'カレンダー'],
                ['agenda', '一覧'],
                ['today', '今日'],
                ['year', '年間'],
              ] as const).map(([view, label]) => (
                <button
                  aria-current={scheduleView === view ? 'page' : undefined}
                  data-active={scheduleView === view ? 'true' : 'false'}
                  key={view}
                  onClick={() => setScheduleView(view)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            {scheduleView === 'today' && (() => {
              const todayScheduleItems = loadDailySchedule(today);
              const todayHolidayName = getHolidayName(today);
              const todayScheduleTitle = `${today.getMonth() + 1}月${today.getDate()}日（${
                weekdayShortLabels[today.getDay()]
              }${todayHolidayName ? `・${todayHolidayName}` : ''}）`;

              return (
                <section className="schedule-today-panel" aria-label="今日のスケジュール">
                  <div className="schedule-today-header">
                    <div>
                      <p>今日のスケジュール</p>
                      <h2>🗓️ {todayScheduleTitle}</h2>
                    </div>
                  </div>
                  {todayScheduleItems.length > 0 ? (
                    <div className="schedule-read-list schedule-today-list">
                      {todayScheduleItems.map((scheduleItem) => (
                        <button
                          className="schedule-today-item"
                          key={scheduleItem.id}
                          onClick={() => openScheduleEditor(today)}
                          type="button"
                        >
                          <time>{formatScheduleTimeLabel(scheduleItem.time)}</time>
                          <span>{scheduleItem.text.trim() || '（内容未入力）'}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="schedule-today-empty">今日の予定はありません</p>
                  )}
                </section>
              );
            })()}
            {scheduleView === 'agenda' && (
              <section className="schedule-agenda-panel" aria-label={`${scheduleYear}年のスケジュール一覧`}>
                <div className="schedule-year-header">
                  <button
                    aria-label="前年のスケジュール一覧へ"
                    onClick={() => moveScheduleYear(-1)}
                    type="button"
                  >
                    ‹
                  </button>
                  <h2>{scheduleYear}年</h2>
                  <button
                    aria-label="翌年のスケジュール一覧へ"
                    onClick={() => moveScheduleYear(1)}
                    type="button"
                  >
                    ›
                  </button>
                </div>
                {yearlyScheduleGroups.length > 0 ? (
                  <div className="schedule-agenda-list">
                    {yearlyScheduleGroups.map((monthGroup) => (
                      <section className="schedule-agenda-month" key={monthGroup.monthIndex}>
                        <h3>{monthGroup.monthIndex + 1}月</h3>
                        <div className="schedule-agenda-days">
                          {monthGroup.days.map((day) => {
                            const holidayName = getHolidayName(day.date);
                            const dateTitle = `${day.date.getMonth() + 1}月${day.date.getDate()}日（${
                              weekdayShortLabels[day.date.getDay()]
                            }${holidayName ? `・${holidayName}` : ''}）`;

                            return (
                              <article
                                className="schedule-agenda-day"
                                data-past={day.dateKey < todayKey ? 'true' : 'false'}
                                data-schedule-agenda-date={day.dateKey}
                                data-today={day.dateKey === todayKey ? 'true' : 'false'}
                                key={day.dateKey}
                              >
                                <button
                                  className="schedule-agenda-date-button"
                                  onClick={() => openScheduleEditor(day.date)}
                                  type="button"
                                >
                                  <span>{dateTitle}</span>
                                  {day.dateKey === todayKey && <strong>今日</strong>}
                                </button>
                                <div className="schedule-agenda-items">
                                  {day.items.map((scheduleItem) => (
                                    <button
                                      className="schedule-agenda-item"
                                      key={scheduleItem.id}
                                      onClick={() => openScheduleEditor(day.date)}
                                      type="button"
                                    >
                                      <time>{formatScheduleTimeLabel(scheduleItem.time)}</time>
                                      <span>{scheduleItem.text.trim() || '（内容未入力）'}</span>
                                    </button>
                                  ))}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <p className="schedule-year-empty">この年の予定はまだありません</p>
                )}
              </section>
            )}
            {scheduleView === 'list' && (
              <section className="schedule-year-panel" aria-label={`${scheduleYear}年のスケジュールカレンダー`}>
                <div className="schedule-year-header">
                  <button
                    aria-label="前年のスケジュール一覧へ"
                    onClick={() => moveScheduleYear(-1)}
                    type="button"
                  >
                    ‹
                  </button>
                  <h2>{scheduleYear}年</h2>
                  <button
                    aria-label="翌年のスケジュール一覧へ"
                    onClick={() => moveScheduleYear(1)}
                    type="button"
                  >
                    ›
                  </button>
                </div>
                <div className="schedule-year-list">
                  {Array.from({ length: 12 }, (_, monthIndex) => {
                    const monthGroup = yearlyScheduleGroups.find(
                      (group) => group.monthIndex === monthIndex,
                    );
                    const monthCells = getMonthDateCells(new Date(scheduleYear, monthIndex, 1));
                    const scheduleCount =
                      monthGroup?.days.reduce((total, day) => total + day.items.length, 0) ?? 0;

                    return (
                      <section
                        className="schedule-year-month schedule-list-month"
                        data-schedule-list-month={monthIndex}
                        key={monthIndex}
                      >
                        <div className="schedule-list-month-header">
                          <h3>{monthIndex + 1}月</h3>
                          {scheduleCount > 0 && <span>{scheduleCount}件</span>}
                        </div>
                        <div className="schedule-list-calendar" aria-label={`${monthIndex + 1}月のカレンダー`}>
                          {weekdayShortLabels.map((weekdayLabel) => (
                            <span className="schedule-list-weekday" key={weekdayLabel}>
                              {weekdayLabel}
                            </span>
                          ))}
                          {monthCells.map((date, cellIndex) => {
                            if (!date) {
                              return (
                                <span
                                  aria-hidden="true"
                                  className="schedule-list-day-empty"
                                  key={`empty-${monthIndex}-${cellIndex}`}
                                />
                              );
                            }

                            const dateKey = getDateKey(date);
                            const scheduleItems = loadDailySchedule(date);
                            const firstSchedule = scheduleItems[0];
                            const holidayName = getHolidayName(date);
                            const dayKind = getDateDisplayKind(date);

                            return (
                              <button
                                aria-label={`${date.getMonth() + 1}月${date.getDate()}日${
                                  holidayName ? ` ${holidayName}` : ''
                                }のスケジュール`}
                                className="schedule-list-day-button"
                                data-day-kind={dayKind}
                                data-has-schedule={scheduleItems.length > 0 ? 'true' : 'false'}
                                data-today={dateKey === todayKey ? 'true' : 'false'}
                                key={dateKey}
                                onClick={() => openScheduleEditor(date)}
                                type="button"
                              >
                                <span className="schedule-list-day-header">
                                  <span className="schedule-list-day-number">{date.getDate()}</span>
                                  {dateKey === todayKey && (
                                    <span className="schedule-list-today-badge">今日</span>
                                  )}
                                </span>
                                {holidayName && (
                                  <span className="schedule-list-day-holiday" title={holidayName}>
                                    {holidayName}
                                  </span>
                                )}
                                {scheduleItems.length > 0 && (
                                  <span className="schedule-list-day-count">{scheduleItems.length}件</span>
                                )}
                                {firstSchedule && (
                                  <span className="schedule-list-day-preview">
                                    <span>{firstSchedule.text.trim() || '（内容未入力）'}</span>
                                    {firstSchedule.time.trim() && <time>{firstSchedule.time}</time>}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </section>
            )}
            {scheduleView === 'year' && (
              <section className="schedule-year-panel" aria-label={`${scheduleYear}年の年間スケジュール`}>
                <div className="schedule-year-header">
                  <button
                    aria-label="前年の年間スケジュールへ"
                    onClick={() => moveScheduleYear(-1)}
                    type="button"
                  >
                    ‹
                  </button>
                  <h2>{scheduleYear}年</h2>
                  <button
                    aria-label="翌年の年間スケジュールへ"
                    onClick={() => moveScheduleYear(1)}
                    type="button"
                  >
                    ›
                  </button>
                </div>
                <div className="schedule-year-month-grid" aria-label="月を選択">
                  {Array.from({ length: 12 }, (_, monthIndex) => {
                    const monthGroup = yearlyScheduleGroups.find(
                      (group) => group.monthIndex === monthIndex,
                    );
                    const scheduleCount =
                      monthGroup?.days.reduce((total, day) => total + day.items.length, 0) ?? 0;
                    const firstSchedule = monthGroup?.days[0]?.items[0];

                    return (
                      <button
                        className="schedule-year-month-button"
                        data-active={selectedScheduleYearMonth === monthIndex ? 'true' : 'false'}
                        key={monthIndex}
                        onClick={() => {
                          setSelectedScheduleYearMonth(monthIndex);
                          setScheduleMonth(new Date(scheduleYear, monthIndex, 1));
                          setSelectedScheduleDate(null);
                        }}
                        type="button"
                      >
                        <span className="schedule-year-month-name">{monthIndex + 1}月</span>
                        {scheduleCount > 0 && (
                          <span className="schedule-year-month-count">{scheduleCount}件</span>
                        )}
                        {firstSchedule && (
                          <span className="schedule-year-month-preview">
                            {`${formatScheduleTimeLabel(firstSchedule.time)} `}
                            {firstSchedule.text.trim() || '（内容未入力）'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {selectedScheduleYearMonth !== null && (
                  <section
                    className="schedule-year-month-detail"
                    aria-label={`${scheduleYear}年${selectedScheduleYearMonth + 1}月の日付一覧`}
                  >
                    <h3>{selectedScheduleYearMonth + 1}月</h3>
                    <div className="records-day-list schedule-day-list">
                      {scheduleMonthDates.map((scheduleDate) => {
                        const dateKey = getDateKey(scheduleDate);
                        const holidayName = getHolidayName(scheduleDate);
                        const dayKind = getDateDisplayKind(scheduleDate);
                        const scheduleItems = loadDailySchedule(scheduleDate);
                        const hasSchedule = scheduleItems.length > 0;
                        const dateTitle = `${scheduleDate.getMonth() + 1}月${scheduleDate.getDate()}日（${
                          weekdayShortLabels[scheduleDate.getDay()]
                        }${holidayName ? `・${holidayName}` : ''}）`;

                        return (
                          <article
                            className="record-day-card schedule-day-card"
                            data-date-key={dateKey}
                            data-day-kind={dayKind}
                            data-empty={!hasSchedule ? 'true' : 'false'}
                            data-today={dateKey === todayKey ? 'true' : 'false'}
                            key={dateKey}
                          >
                            <button
                              className="record-day-toggle"
                              onClick={() => openScheduleEditor(scheduleDate)}
                              type="button"
                            >
                              <span className="record-day-date">🗓️ {dateTitle}</span>
                              {(dateKey === todayKey || hasSchedule) && (
                                <span className="record-day-meta">
                                  {dateKey === todayKey && <strong>今日</strong>}
                                  {hasSchedule && `${scheduleItems.length}件`}
                                </span>
                              )}
                            </button>

                            {hasSchedule && (
                              <div className="record-day-body schedule-day-body">
                                <div className="schedule-read-list">
                                  {scheduleItems.map((scheduleItem) => (
                                    <p key={scheduleItem.id}>
                                      <time>{formatScheduleTimeLabel(scheduleItem.time)}</time>
                                      <span>{scheduleItem.text.trim() || '（内容未入力）'}</span>
                                    </p>
                                  ))}
                                </div>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}
              </section>
            )}
            {selectedScheduleDate && (() => {
              const scheduleDate = selectedScheduleDate;
              const dateKey = getDateKey(scheduleDate);
              const holidayName = getHolidayName(scheduleDate);
              const dateTitle = `${scheduleDate.getMonth() + 1}月${scheduleDate.getDate()}日（${
                weekdayShortLabels[scheduleDate.getDay()]
              }${holidayName ? `・${holidayName}` : ''}）`;
              const scheduleItems = loadDailySchedule(scheduleDate);
              const scheduleDetailDraft = getScheduleDetailDraft(dateKey);

              return (
                <div
                  className="record-editor-backdrop schedule-editor-backdrop"
                  role="presentation"
                  onClick={() => {
                    setSelectedScheduleDate(null);
                    setActiveScheduleMenuId(null);
                  }}
                >
                  <section
                    aria-label={`${dateTitle}のスケジュール編集`}
                    className="record-editor-panel schedule-editor-panel"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="record-editor-header">
                      <div>
                        <p>🗓️ 1日のスケジュール</p>
                        <h2>{dateTitle}</h2>
                      </div>
                      <button
                        aria-label="スケジュール編集を閉じる"
                        onClick={() => {
                          setSelectedScheduleDate(null);
                          setActiveScheduleMenuId(null);
                        }}
                        type="button"
                      >
                        閉じる
                      </button>
                    </div>
                    {scheduleItems.length > 0 && (
                      <div className="record-field schedule-field">
                        <label>
                          スケジュール
                        </label>
                        <div className="schedule-editor-list">
                          {scheduleItems.map((scheduleItem, index) => (
                            <div className="schedule-editor-row" key={scheduleItem.id}>
                              <select
                                aria-label={`${dateTitle}のスケジュール ${index + 1}の時間`}
                                onChange={(event) =>
                                  updateScheduleItem(
                                    scheduleDate,
                                    scheduleItem,
                                    'time',
                                    event.target.value,
                                  )
                                }
                                value={scheduleItem.time}
                              >
                                <option value="">--:--</option>
                                {scheduleTimeOptions.map((timeOption) => (
                                  <option key={timeOption} value={timeOption}>
                                    {timeOption}
                                  </option>
                                ))}
                              </select>
                              <input
                                aria-label={`${dateTitle}のスケジュール ${index + 1}の内容`}
                                id={`schedule-item-text-${scheduleItem.id}`}
                                onCompositionEnd={(event) =>
                                  endScheduleComposition(scheduleDate, scheduleItem, event.currentTarget.value)
                                }
                                onCompositionStart={() => startScheduleComposition(scheduleItem.id)}
                                onChange={(event) =>
                                  updateScheduleItem(
                                    scheduleDate,
                                    scheduleItem,
                                    'text',
                                    event.target.value,
                                  )
                                }
                                placeholder="スケジュール内容"
                                type="text"
                                value={scheduleItem.text}
                              />
                              <div
                                className="todo-actions-menu schedule-actions-menu"
                                data-open={activeScheduleMenuId === scheduleItem.id ? 'true' : 'false'}
                              >
                                <button
                                  aria-expanded={activeScheduleMenuId === scheduleItem.id}
                                  aria-label={`${dateTitle}のスケジュール ${index + 1}の操作`}
                                  onClick={() =>
                                    setActiveScheduleMenuId((currentId) =>
                                      currentId === scheduleItem.id ? null : scheduleItem.id,
                                    )
                                  }
                                  type="button"
                                >
                                  …
                                </button>
                                {activeScheduleMenuId === scheduleItem.id && (
                                  <div className="todo-actions-panel">
                                    <button
                                      onClick={() => {
                                        document
                                          .getElementById(`schedule-item-text-${scheduleItem.id}`)
                                          ?.focus();
                                        setActiveScheduleMenuId(null);
                                      }}
                                      type="button"
                                    >
                                      編集
                                    </button>
                                    <button
                                      onClick={() => {
                                        removeScheduleItem(scheduleDate, scheduleItem.id);
                                        setActiveScheduleMenuId(null);
                                      }}
                                      type="button"
                                    >
                                      削除
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      )}
                    <div className="record-field schedule-field">
                      <label>
                        予定を追加
                      </label>
                      <div className="schedule-detail-add-row schedule-editor-row" data-new="true">
                        <select
                          aria-label={`${dateTitle}へ追加する予定の時刻`}
                          onChange={(event) => {
                            const [hour = '', minute = ''] = event.target.value.split(':');

                            updateScheduleDetailDraft(scheduleDate, { hour, minute });
                            window.setTimeout(() => {
                              document
                                .querySelector<HTMLInputElement>(`[data-schedule-detail-text="${dateKey}"]`)
                                ?.focus({ preventScroll: true });
                            }, 0);
                          }}
                          value={getScheduleDetailDraftTime(scheduleDetailDraft)}
                        >
                          <option value="">--:--</option>
                          {scheduleTimeOptions.map((timeOption) => (
                            <option key={timeOption} value={timeOption}>
                              {timeOption}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label={`${dateTitle}へ追加する予定名`}
                          data-schedule-detail-text={dateKey}
                          enterKeyHint="done"
                          onBlur={() => commitScheduleDetailDraft(scheduleDate)}
                          onChange={(event) =>
                            updateScheduleDetailDraft(scheduleDate, { text: event.target.value })
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                              event.preventDefault();
                              commitScheduleDetailDraft(scheduleDate);
                            }
                          }}
                          placeholder="予定を入力する"
                          type="text"
                          value={scheduleDetailDraft.text}
                        />
                      </div>
                      {(scheduleDetailDraft.error || scheduleDetailDraft.message) && (
                        <p
                          className="schedule-detail-status"
                          data-error={scheduleDetailDraft.error ? 'true' : 'false'}
                        >
                          {scheduleDetailDraft.error || scheduleDetailDraft.message}
                        </p>
                      )}
                    </div>
                  </section>
                </div>
              );
            })()}
          </section>
        )}

        {isTodayTodoView && (() => {
          const completedTodos = managedTodos
            .filter((todo) =>
              hasManagedTodoText(todo) &&
              !todo.pendingReview &&
              shouldShowManagedTodoInCompletedHistory(todo),
            )
            .sort((first, second) => (second.completedAt ?? '').localeCompare(first.completedAt ?? ''));
          const activeTodos = managedTodos
            .filter((todo) =>
              hasManagedTodoText(todo) &&
              !todo.pendingReview &&
              shouldShowManagedTodoInWorkingList(todo),
            )
            .sort((first, second) => (second.createdAt ?? '').localeCompare(first.createdAt ?? ''));
          const todayTodos = activeTodos.filter((todo) => todo.dueDate === todayKey);
          const formatTodoDueDate = (dateKey: string) => {
            const date = getDateFromKey(dateKey);

            return `${date.getMonth() + 1}/${date.getDate()}`;
          };
          const formatTodoCompletedAt = (completedAt?: string) =>
            completedAt && !Number.isNaN(Date.parse(completedAt))
              ? backupDateTimeFormatter.format(new Date(completedAt))
              : '';
          const selectedTodoCount = getSelectedTodoIdList().length;
          const renderTodoActions = (todo: ManagedTodoItem, options: { completed?: boolean } = {}) => {
            const isOpen = activeTodoMenuId === todo.id;
            const menuPosition =
              todoFloatingMenuPosition?.id === todo.id ? todoFloatingMenuPosition : null;
            const menuPanel = (
              <div
                className="todo-actions-menu todo-actions-menu-portal"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div
                  className="todo-actions-panel"
                  data-floating="true"
                  ref={(element) => {
                    todoMenuPanelRef.current = element;
                    if (element) {
                      positionTodoFloatingMenu(todo.id, element);
                    }
                  }}
                  style={{
                    left: menuPosition ? `${menuPosition.left}px` : '8px',
                    maxHeight: menuPosition ? `${menuPosition.maxHeight}px` : 'calc(100vh - 120px)',
                    top: menuPosition ? `${menuPosition.top}px` : '8px',
                    visibility: menuPosition ? 'visible' : 'hidden',
                  }}
                >
	                  {!options.completed && (
	                    <>
	                      <button
                          onClick={() => {
                            focusManagedTodo(todo.id);
                            setActiveTodoMenuId(null);
                          }}
                          type="button"
                        >
	                        編集
	                      </button>
	                      <button
	                        onClick={() => {
	                          if (todo.dueDate !== todayKey) {
	                            updateManagedTodoDueDate(todo.id, todayKey);
	                          }
	                          setActiveTodoMenuId(null);
	                        }}
	                        type="button"
	                      >
	                        {todo.dueDate === todayKey ? '⭐ 今日やる ✓' : '⭐ 今日やる'}
	                      </button>
	                      {(() => {
	                        const dueDraft = getTodoDueDateDraft(todo);
	                        const todayMonthPlaceholder = String(today.getMonth() + 1);
	                        const todayDayPlaceholder = String(today.getDate());

	                        return (
	                          <label className="todo-due-date-editor">
	                            <span>日付を設定／変更</span>
	                            <small>
	                              <input
	                                aria-label={`${todo.text}の日付の年`}
	                                inputMode="numeric"
	                                maxLength={4}
	                                onChange={(event) =>
	                                  updateTodoDueDateDraft(todo.id, {
	                                    year: event.target.value.replace(/\D/g, '').slice(0, 4),
	                                  })
	                                }
	                                placeholder={String(today.getFullYear())}
	                                value={dueDraft.year ?? ''}
	                              />
	                              年
	                            </small>
	                            <div className="todo-due-date-fields">
	                              <input
	                                aria-label={`${todo.text}の日付の月`}
	                                inputMode="numeric"
	                                maxLength={2}
	                                onChange={(event) =>
	                                  updateTodoDueDateDraft(todo.id, {
	                                    year: dueDraft.year || String(today.getFullYear()),
	                                    month: event.target.value.replace(/\D/g, '').slice(0, 2),
	                                  })
	                                }
	                                onKeyDown={(event) => {
	                                  if (event.key === 'Enter') {
	                                    event.preventDefault();
	                                    document.getElementById(`todo-due-day-${todo.id}`)?.focus();
	                                  }
	                                }}
	                                placeholder={todayMonthPlaceholder}
	                                value={dueDraft.month}
	                              />
	                              <span>月</span>
	                              <input
	                                aria-label={`${todo.text}の日付の日`}
	                                id={`todo-due-day-${todo.id}`}
	                                inputMode="numeric"
	                                maxLength={2}
	                                onChange={(event) =>
	                                  updateTodoDueDateDraft(todo.id, {
	                                    year: dueDraft.year || String(today.getFullYear()),
	                                    day: event.target.value.replace(/\D/g, '').slice(0, 2),
	                                  })
	                                }
	                                onKeyDown={(event) => {
	                                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
	                                    event.preventDefault();
	                                    commitTodoDueDateDraft(todo, { allowTodayFallback: true });
                                      setActiveTodoMenuId(null);
	                                  }
	                                }}
	                                placeholder={todayDayPlaceholder}
	                                value={dueDraft.day}
	                              />
	                              <span>日</span>
	                            </div>
	                            {dueDraft.error && <strong>{dueDraft.error}</strong>}
	                          </label>
	                        );
	                      })()}
	                      {todo.dueDate && (
	                        <button
	                          onClick={() => {
	                            updateManagedTodoDueDate(todo.id, undefined);
	                            setActiveTodoMenuId(null);
	                          }}
	                          type="button"
	                        >
	                          日付を外す
	                        </button>
	                      )}
                      <label>
                        フォルダへ移動
                        <select
                          onChange={(event) => {
                            if (event.target.value === '__new__') {
                              promptCreateTodoFolderForTodo(todo.id);
                              setActiveTodoMenuId(null);
                              return;
                            }

                            updateManagedTodoFolder(todo.id, event.target.value || undefined);
                            setActiveTodoMenuId(null);
                          }}
                          value={todo.folderId ?? ''}
                        >
                          <option value="">フォルダなし</option>
                          {todoFolders.map((folder) => (
                            <option key={folder.id} value={folder.id}>
                              {folder.name}
                            </option>
                          ))}
                          <option value="__new__">＋ 新しいフォルダ</option>
                        </select>
                      </label>
	                      {todo.folderId && (
	                        <button
	                          onClick={() => {
	                            updateManagedTodoFolder(todo.id, undefined);
	                            setActiveTodoMenuId(null);
	                          }}
	                          type="button"
	                        >
	                          フォルダから外す
	                        </button>
	                      )}
                      <button
                        onClick={() => {
                          copyManagedTodoText(todo);
                          setActiveTodoMenuId(null);
                        }}
                        type="button"
                      >
                        コピー
                      </button>
                    </>
                  )}
                  {options.completed && (
                    <button
                      onClick={() => {
                        const nextStatus = todo.originalStatus && isActiveTodoStatus(todo.originalStatus)
                          ? todo.originalStatus
                          : getTodoStatusForDueDate(todo.dueDate);

                        restoreManagedTodo(todo.id, nextStatus);
                        setActiveTodoMenuId(null);
                      }}
                      type="button"
                    >
                      未完了に戻す
                    </button>
	                  )}
	                  <button
                      onClick={() => {
                        confirmDeleteManagedTodo(todo);
                        setActiveTodoMenuId(null);
                      }}
                      type="button"
                    >
	                    削除
	                  </button>
	                </div>
              </div>
            );

            return (
              <div
                className="todo-actions-menu"
                data-open={isOpen ? 'true' : 'false'}
                ref={(element) => {
                  todoMenuAnchorRefs.current[todo.id] = element;
                }}
              >
                <button
                  aria-expanded={isOpen}
                  aria-label={`${todo.text}の操作`}
                  onClick={() => {
                    setActiveTodoFolderMenuId(null);
                    setTodoFloatingMenuPosition(null);
                    setActiveTodoMenuId((currentId) => (currentId === todo.id ? null : todo.id));
                  }}
                  type="button"
                >
                  …
                </button>
                {isOpen && createPortal(menuPanel, document.body)}
              </div>
            );
          };
	          const renderTodoRow = (todo: ManagedTodoItem, index: number) => {
	            const isSelected = Boolean(selectedTodoIds[todo.id]);
              const folderName = todo.folderId
                ? todoFolders.find((folder) => folder.id === todo.folderId)?.name
                : undefined;

	            return (
	            <article
	              className="todo-capture-row"
	              data-completed={todo.completed ? 'true' : 'false'}
	              data-selecting={isTodoSelectionMode ? 'true' : 'false'}
	              data-selected={isSelected ? 'true' : 'false'}
	              key={todo.id}
	              onClick={(event) => {
	                if (!isTodoSelectionMode) {
	                  return;
	                }

	                const target = event.target as HTMLElement;
	                if (target.closest('button, input, textarea, select, label')) {
	                  return;
	                }

	                toggleTodoSelection(todo.id);
	              }}
	            >
	              <input
	                aria-label={
	                  isTodoSelectionMode
	                    ? `やること ${index + 1}を選択`
	                    : `やること ${index + 1}を完了`
	                }
	                checked={isTodoSelectionMode ? isSelected : todo.completed}
	                onChange={(event) => {
	                  if (isTodoSelectionMode) {
	                    toggleTodoSelection(todo.id);
	                  } else {
	                    toggleManagedTodo(todo.id, event.target.checked);
	                  }
	                }}
	                type="checkbox"
	              />
	              <div className="todo-capture-main">
	                <textarea
                  aria-label={`やること ${index + 1}`}
                  id={`managed-todo-text-${todo.id}`}
                  onBlur={cleanupManagedTodos}
                  onChange={(event) => {
                    adjustTextareaHeight(event.currentTarget);
                    updateManagedTodoText(
                      todo.id,
                      isActiveTodoStatus(todo.status) ? todo.status : 'soon',
                      event.target.value,
                    );
	                  }}
	                  placeholder="やること"
	                  readOnly={isTodoSelectionMode}
	                  ref={adjustTextareaHeight}
	                  rows={1}
	                  value={todo.text}
                />
                {todo.dueDate && todoView !== 'today' && <time>{formatTodoDueDate(todo.dueDate)}</time>}
                {folderName && <small>📁 {folderName}</small>}
                {todo.completed && formatTodoCompletedAt(todo.completedAt) && (
	                  <time>完了：{formatTodoCompletedAt(todo.completedAt)}</time>
	                )}
	              </div>
	              {!isTodoSelectionMode && todo.completed && todo.status !== 'completed' && (
	                <button
	                  className="todo-finalize-button"
	                  onClick={() => finalizeManagedTodo(todo.id)}
                  type="button"
                >
	                  完了
	                </button>
	              )}
	              {!isTodoSelectionMode && renderTodoActions(todo)}
	            </article>
	            );
	          };
          const renderTodoCaptureListHeader = (todos: ManagedTodoItem[]) => (
            <div className="todo-capture-list-header">
              <h2>
                未完了
                {isTodoSelectionMode && <span>{selectedTodoCount}件選択中</span>}
              </h2>
              {todos.length > 0 && (
                <div className="todo-capture-list-actions">
                  {isTodoSelectionMode && (
                    <button
                      className="todo-subtle-action"
                      onClick={() => selectVisibleTodos(todos)}
                      type="button"
                    >
                      すべて選択
                    </button>
                  )}
                  <button
                    className="todo-subtle-action"
                    onClick={() => {
                      if (isTodoSelectionMode) {
                        clearTodoSelection();
                      } else {
                        enterTodoSelectionMode();
                      }
                    }}
                    type="button"
                  >
                    {isTodoSelectionMode ? 'キャンセル' : '選択'}
                  </button>
                </div>
              )}
            </div>
          );
          const renderManagedTodoRows = (
            status: ActiveTodoStatus,
            rows: ManagedTodoItem[],
            options: { compactEmpty?: boolean; placeholder?: string } = {},
          ) => (
            <div
              className="daily-todo-list"
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  return;
                }

                setTodoDropTarget(null);
              }}
            >
              {rows.map((todo, index) => {
                const isDraftTodo = todo.id.startsWith('new-');
                const todoText = isDraftTodo ? managedTodoDrafts[status] ?? '' : todo.text;
                const hasRowText = todoText.trim().length > 0;
                const isFilledTodo = !isDraftTodo && hasManagedTodoText(todo);
                const isMovableTodo = isFilledTodo && !todo.completed && todo.status !== 'completed';
                const isDropTarget =
                  todoDropTarget?.status === status && todoDropTarget.beforeId === todo.id;

                return (
                  <div
                    className="daily-todo-row todo-manager-row"
                    data-compact={options.compactEmpty ? 'true' : 'false'}
                    data-completed={todo.completed ? 'true' : 'false'}
                    data-dragging={draggedTodoId === todo.id ? 'true' : 'false'}
                    data-drop-target={isDropTarget ? 'true' : 'false'}
                    data-empty={!hasRowText ? 'true' : 'false'}
                    key={todo.id}
                    onDragOver={isMovableTodo
                      ? (event) => updateManagedTodoDropTarget(event, status, todo.id)
                      : undefined}
                    onDrop={isMovableTodo
                      ? (event) => dropManagedTodo(event, status, todo.id)
                      : undefined}
                  >
                    {isMovableTodo ? (
                      <button
                        aria-label={`${todo.text}をドラッグして移動`}
                        className="todo-drag-handle"
                        draggable
                        onDragEnd={endManagedTodoDrag}
                        onDragStart={(event) => startManagedTodoDrag(event, todo)}
                        type="button"
                      >
                        ≡
                      </button>
                    ) : (
                      <span className="todo-drag-spacer" aria-hidden="true" />
                    )}
                    <input
                      aria-label={`${todoStatusHeadings[status]} ${index + 1}を完了`}
                      checked={todo.completed}
                      disabled={!isFilledTodo}
                      onChange={(event) => toggleManagedTodo(todo.id, event.target.checked)}
                      type="checkbox"
                    />
                    <textarea
                      aria-label={`${todoStatusHeadings[status]} ${index + 1}`}
                      onBlur={(event) => {
                        if (isDraftTodo) {
                          commitManagedTodoDraft(status, event.currentTarget.value);
                        } else {
                          cleanupManagedTodos();
                        }
                      }}
                      onCompositionStart={() => {
                        if (isDraftTodo) {
                          startManagedTodoDraftComposition(status);
                        }
                      }}
                      onChange={(event) => {
                        adjustTextareaHeight(event.currentTarget);
                        if (isDraftTodo) {
                          updateManagedTodoDraft(status, event.target.value);
                        } else {
                          updateManagedTodoText(todo.id, status, event.target.value);
                        }
                      }}
                      onCompositionEnd={(event) => {
                        adjustTextareaHeight(event.currentTarget);
                        if (isDraftTodo) {
                          endManagedTodoDraftComposition(status, event.currentTarget.value);
                        } else {
                          updateManagedTodoText(todo.id, status, event.currentTarget.value);
                        }
                      }}
                      placeholder={options.placeholder ?? 'やることをメモ'}
                      ref={adjustTextareaHeight}
                      rows={1}
                      value={todoText}
                    />
                    {isFilledTodo && (
                      <>
                        {!todo.completed && (
                          <select
                            aria-label={`${todo.text}の区分を変更`}
                            onChange={(event) =>
                              moveManagedTodo(todo.id, event.target.value as ActiveTodoStatus)
                            }
                            value={todo.status}
                          >
                            {activeTodoStatusOptions.map((option) => (
                              <option key={option.key} value={option.key}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          aria-label={`${todoStatusHeadings[status]} ${index + 1}を削除`}
                          className="daily-todo-delete-button"
                          onClick={() => deleteManagedTodo(todo.id)}
                          type="button"
                        >
                          ×
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
              {!options.compactEmpty && (
                <div
                  className="todo-drop-zone"
                  data-active={
                    todoDropTarget?.status === status && todoDropTarget.beforeId === null
                      ? 'true'
                      : 'false'
                  }
                  onDragOver={(event) => updateManagedTodoDropTarget(event, status, null)}
                  onDrop={(event) => dropManagedTodo(event, status, null)}
                >
                  ここへ移動
                </div>
              )}
            </div>
          );
          void renderManagedTodoRows;

	          return (
	            <section className="todo-manager-page record-view-content" aria-label="やること">
	              {todoBulkStatusMessage && <p className="todo-bulk-status">{todoBulkStatusMessage}</p>}
	              <div className="todo-status-tabs todo-primary-tabs" aria-label="やること表示切り替え">
	                {([
	                  ['todo', '一覧'],
                  ['today', '今日'],
                  ['date', '日付'],
                  ['folders', 'フォルダ'],
                  ['completed', '完了済み'],
                ] as const).map(([view, label]) => (
                  <button
                    aria-current={todoView === view ? 'page' : undefined}
	                    data-active={todoView === view ? 'true' : 'false'}
	                    key={view}
	                    onClick={() => {
                        commitAndResetTodoDraftInputs();
	                      clearTodoSelection();
	                      setTodoView(view);
	                    }}
	                    type="button"
	                  >
	                    {label}
                  </button>
                ))}
              </div>

              {todoView === 'completed' && (
                <section className="daily-todo-card todo-manager-card" aria-label="やり終えたこと">
                  <div className="daily-todo-header">
                    <h2>✅ 完了済み</h2>
                  </div>
                  <div className="todo-completed-list">
                    {completedTodos.length > 0 ? (
                      completedTodos.map((todo) => {
                        const folderName = todo.folderId
                          ? todoFolders.find((folder) => folder.id === todo.folderId)?.name
                          : undefined;

                        return (
                          <article className="todo-completed-item" key={todo.id}>
                            <div>
                              <p>✓ {todo.text}</p>
                              <span>{formatTodoCompletedAt(todo.completedAt) ? `完了：${formatTodoCompletedAt(todo.completedAt)}` : '完了日時不明'}</span>
                              {todo.dueDate && <span>日付：{formatTodoDueDate(todo.dueDate)}</span>}
                              {folderName && <span>フォルダ：{folderName}</span>}
                            </div>
                            {renderTodoActions(todo, { completed: true })}
                          </article>
                        );
                      })
                    ) : (
                      <p className="todo-completed-empty">完了済みのやることはまだありません。</p>
                    )}
                  </div>
                </section>
              )}

              {todoView === 'todo' && (
                <>
                  <section className="todo-capture-card" aria-label="やることを追加">
                    <textarea
                      aria-label="新しいやること"
                      onBlur={() => submitNewTodo()}
                      onChange={(event) => {
                        adjustTextareaHeight(event.currentTarget);
                        updateTodoDraftText('todo:list', event.target.value, setNewTodoText);
                      }}
                      onKeyDown={(event) => handleTodoCaptureKeyDown(event, submitNewTodo)}
                      enterKeyHint="done"
                      placeholder="やることを入力する"
                      ref={(element) => {
                        newTodoInputRef.current = element;
                        if (element) {
                          adjustTextareaHeight(element);
                        }
                      }}
                      rows={1}
                      value={newTodoText}
                    />
	                  </section>
	                  <section className="todo-capture-list" aria-label="未完了のやること">
	                    {renderTodoCaptureListHeader(activeTodos)}
                    {activeTodos.length > 0 ? (
                      activeTodos.map(renderTodoRow)
                    ) : (
                      <p className="todo-completed-empty">思いついたことを上に追加できます。</p>
                    )}
                  </section>
                </>
              )}

              {todoView === 'today' && (
                <>
                  <section className="todo-capture-card" aria-label="今日やることを追加">
                    <textarea
                      aria-label="今日のやること"
                      onBlur={() => submitNewTodoForToday()}
                      onChange={(event) => {
                        adjustTextareaHeight(event.currentTarget);
                        updateTodoDraftText('todo:today', event.target.value, setNewTodoTodayText);
                      }}
                      onKeyDown={(event) => handleTodoCaptureKeyDown(event, submitNewTodoForToday)}
                      enterKeyHint="done"
                      placeholder="今日やることを入力する"
                      ref={(element) => {
                        newTodoTodayInputRef.current = element;
                        if (element) {
                          adjustTextareaHeight(element);
                        }
                      }}
                      rows={1}
                      value={newTodoTodayText}
                    />
                  </section>
                  <section className="todo-capture-list" aria-label="今日の未完了のやること">
                    {renderTodoCaptureListHeader(todayTodos)}
                    {todayTodos.length > 0 ? (
                      todayTodos.map(renderTodoRow)
                    ) : (
                      <p className="todo-completed-empty">今日のやることはまだありません</p>
                    )}
                  </section>
                </>
              )}

              {todoView === 'date' && (
                <section className="todo-date-page" aria-label="日付ごとのやること">
                  <div className="records-month-header">
                    <button
                      aria-label="前の月のやることへ"
                      onClick={() => moveTodoMonth(-1)}
                      type="button"
                    >
                      ‹
                    </button>
                    <h2>{todoMonthLabel}</h2>
                    <button
                      aria-label="次の月のやることへ"
                      onClick={() => moveTodoMonth(1)}
                      type="button"
                    >
                      ›
                    </button>
                  </div>
                  <button className="todo-today-button" onClick={showTodoToday} type="button">
                    今日へ
                  </button>
                  <div className="records-day-list todo-date-list">
                    {todoMonthDates.map((todoDate) => {
                      const dateKey = getDateKey(todoDate);
                      const dateTodos = activeTodos.filter((todo) => todo.dueDate === dateKey);
                      const holidayName = getHolidayName(todoDate);
                      const dayKind = getDateDisplayKind(todoDate);
                      const dateTitle = `${todoDate.getMonth() + 1}月${todoDate.getDate()}日（${
                        weekdayShortLabels[todoDate.getDay()]
                      }${holidayName ? `・${holidayName}` : ''}）`;

                      return (
                        <article
                          className="record-day-card todo-date-card"
                          data-day-kind={dayKind}
                          data-empty={dateTodos.length === 0 ? 'true' : 'false'}
                          data-today={dateKey === todayKey ? 'true' : 'false'}
                          key={dateKey}
                        >
                          <button
                            className="record-day-toggle"
                            onClick={() => {
                              commitAndResetTodoDraftInputs();
                              setSelectedTodoDate(todoDate);
                            }}
                            type="button"
                          >
                            <span className="record-day-date">📋 {dateTitle}</span>
                            {(dateKey === todayKey || dateTodos.length > 0) && (
                              <span className="record-day-meta">
                                {dateKey === todayKey && <strong>今日</strong>}
                                {dateTodos.length > 0 && `${dateTodos.length}件`}
                              </span>
                            )}
                          </button>
                          {dateTodos.length > 0 && (
                            <div className="record-day-body todo-date-body">
                              {dateTodos.slice(0, 3).map((todo) => (
                                <p key={todo.id}>・{todo.text}</p>
                              ))}
                              {dateTodos.length > 3 && <small>ほか{dateTodos.length - 3}件</small>}
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}

              {todoView === 'folders' && (() => {
                const selectedFolder = selectedTodoFolderId
                  ? todoFolders.find((folder) => folder.id === selectedTodoFolderId) ?? null
                  : null;
                const sortedFolders = [...todoFolders].sort((first, second) =>
                  (second.updatedAt ?? '').localeCompare(first.updatedAt ?? ''),
                );
                const folderTodos = selectedFolder
                  ? activeTodos.filter((todo) => todo.folderId === selectedFolder.id)
                  : [];

                if (selectedFolder) {
                  return (
                    <section className="todo-folder-page" aria-label={`${selectedFolder.name}のやること`}>
                      <div className="todo-folder-detail-header">
                        <button
                          aria-label="フォルダ一覧へ戻る"
                          onClick={() => {
                            commitAndResetTodoDraftInputs();
                            clearTodoSelection();
                            setSelectedTodoFolderId(null);
                          }}
                          type="button"
                        >
                          ‹
                        </button>
                        <h2>📁 {selectedFolder.name}</h2>
                        <span>{folderTodos.length}件</span>
                      </div>
                      <section className="todo-capture-card" aria-label={`${selectedFolder.name}へ追加`}>
                        <textarea
                          aria-label={`${selectedFolder.name}へ追加するやること`}
                          onBlur={() => submitNewTodoForFolder(selectedFolder.id)}
                          onChange={(event) => {
                            adjustTextareaHeight(event.currentTarget);
                            updateTodoDraftText(
                              `todo:folder:${selectedFolder.id}`,
                              event.target.value,
                              setNewTodoFolderText,
                            );
                          }}
                          onKeyDown={(event) =>
                            handleTodoCaptureKeyDown(event, () => submitNewTodoForFolder(selectedFolder.id))
                          }
                          enterKeyHint="done"
                          placeholder="このフォルダにやることを入力する"
                          ref={(element) => {
                            newTodoFolderInputRef.current = element;
                            if (element) {
                              adjustTextareaHeight(element);
                            }
                          }}
                          rows={1}
                          value={newTodoFolderText}
                        />
                      </section>
                      <section className="todo-capture-list" aria-label={`${selectedFolder.name}の未完了`}>
	                        {renderTodoCaptureListHeader(folderTodos)}
                        {folderTodos.length > 0 ? (
                          folderTodos.map(renderTodoRow)
                        ) : (
                          <p className="todo-completed-empty">このフォルダのやることはまだありません。</p>
                        )}
                      </section>
                    </section>
                  );
                }

                return (
                  <section className="todo-folder-page" aria-label="やることフォルダ">
                    <section className="todo-folder-create-card" aria-label="フォルダを作る">
                      <input
                        aria-label="新しいフォルダ名"
                        onChange={(event) => setNewTodoFolderName(event.target.value)}
                        placeholder="フォルダ名"
                        type="text"
                        value={newTodoFolderName}
                      />
                      <button
                        disabled={!newTodoFolderName.trim()}
                        onClick={submitNewTodoFolder}
                        type="button"
                      >
                        ＋ フォルダを作る
                      </button>
                    </section>
                    <div className="todo-folder-list">
                      {sortedFolders.length > 0 ? (
                        sortedFolders.map((folder) => {
                          const incompleteCount = activeTodos.filter((todo) => todo.folderId === folder.id).length;

                          return (
                            <article className="todo-folder-card" key={folder.id}>
                              <button
                                className="todo-folder-open"
                                onClick={() => {
                                  commitAndResetTodoDraftInputs();
                                  setSelectedTodoFolderId(folder.id);
                                }}
                                type="button"
                              >
                                <span aria-hidden="true">📁</span>
                                <strong>{folder.name}</strong>
                                <small>{incompleteCount}件</small>
                                <i aria-hidden="true">›</i>
                              </button>
                              <div className="todo-actions-menu" data-open={activeTodoFolderMenuId === folder.id ? 'true' : 'false'}>
	                                <button
	                                  aria-expanded={activeTodoFolderMenuId === folder.id}
	                                  aria-label={`${folder.name}の操作`}
	                                  onClick={() => {
	                                    setActiveTodoMenuId(null);
	                                    setActiveTodoFolderMenuId((currentId) => currentId === folder.id ? null : folder.id);
	                                  }}
	                                  type="button"
	                                >
                                  …
                                </button>
                                {activeTodoFolderMenuId === folder.id && (
                                  <div className="todo-actions-panel">
                                    <button onClick={() => renameTodoFolder(folder)} type="button">
                                      名前を変更
                                    </button>
                                    <button onClick={() => deleteTodoFolder(folder)} type="button">
                                      削除
                                    </button>
                                  </div>
                                )}
                              </div>
                            </article>
                          );
                        })
                      ) : (
                        <p className="todo-completed-empty">テーマごとにフォルダを作れます。</p>
                      )}
                    </div>
                  </section>
                );
              })()}

              {selectedTodoDate && (() => {
                const dateKey = getDateKey(selectedTodoDate);
                const selectedDateTodos = activeTodos.filter((todo) => todo.dueDate === dateKey);
                const holidayName = getHolidayName(selectedTodoDate);
                const dateTitle = `${selectedTodoDate.getMonth() + 1}月${selectedTodoDate.getDate()}日（${
                  weekdayShortLabels[selectedTodoDate.getDay()]
                }${holidayName ? `・${holidayName}` : ''}）`;

                return (
	                  <div
	                    className="record-editor-backdrop"
	                    role="presentation"
	                    onClick={() => {
	                      commitAndResetTodoDraftInputs();
	                      clearTodoSelection();
	                      setSelectedTodoDate(null);
	                    }}
	                  >
                    <section
                      aria-label={`${dateTitle}のやること`}
                      className="record-editor-panel todo-date-editor-panel"
                      onClick={(event) => event.stopPropagation()}
                    >
	                      <div className="record-editor-header">
	                        <div>
	                          <p>📋 日付のやること</p>
	                          <h2>{dateTitle}</h2>
	                        </div>
	                        <div className="todo-date-editor-actions">
	                          <button
	                            aria-label="日付のやることを閉じる"
	                            onClick={() => {
	                              commitAndResetTodoDraftInputs();
	                              clearTodoSelection();
	                              setSelectedTodoDate(null);
	                            }}
	                            type="button"
	                          >
	                            閉じる
	                          </button>
	                        </div>
	                      </div>
                      <section className="todo-capture-card" aria-label={`${dateTitle}へ追加`}>
                        <textarea
                          aria-label={`${dateTitle}へ追加するやること`}
                          onBlur={() => submitNewTodoForDate(selectedTodoDate)}
                          onChange={(event) => {
                            adjustTextareaHeight(event.currentTarget);
                            updateTodoDraftText(`todo:date:${dateKey}`, event.target.value, setNewTodoDateText);
                          }}
                          onKeyDown={(event) =>
                            handleTodoCaptureKeyDown(event, () => submitNewTodoForDate(selectedTodoDate))
                          }
                          enterKeyHint="done"
                          placeholder="この日にやることを入力する"
                          ref={(element) => {
                            newTodoDateInputRef.current = element;
                            if (element) {
                              adjustTextareaHeight(element);
                            }
                          }}
                          rows={1}
                          value={newTodoDateText}
                        />
                      </section>
	                      <div className="todo-capture-list">
	                        {renderTodoCaptureListHeader(selectedDateTodos)}
	                        {selectedDateTodos.length > 0 ? (
	                          selectedDateTodos.map(renderTodoRow)
                        ) : (
                          <p className="todo-completed-empty">この日のやることはまだありません。</p>
                        )}
                      </div>
                    </section>
                  </div>
                );
	              })()}
	              {isTodoSelectionMode && selectedTodoCount > 0 && (
	                <div className="todo-bulk-action-bar" aria-label="選択したやることの一括操作">
	                  <span>{selectedTodoCount}件</span>
	                  <button onClick={() => bulkUpdateSelectedTodoDueDate(todayKey)} type="button">
	                    今日やる
	                  </button>
	                  <button
	                    onClick={() => bulkUpdateSelectedTodoDueDate(getDateKey(addDays(today, 1)))}
	                    type="button"
	                  >
	                    明日
	                  </button>
	                  <label>
	                    日付
	                    <input
	                      aria-label="選択したやることの日付を設定"
	                      onChange={(event) => {
	                        if (event.target.value) {
	                          bulkUpdateSelectedTodoDueDate(event.target.value);
	                        }
	                      }}
	                      type="date"
	                    />
	                  </label>
	                  <select
	                    aria-label="選択したやることのフォルダを設定"
	                    defaultValue=""
	                    onChange={(event) => {
	                      if (event.target.value === '__new__') {
	                        bulkCreateTodoFolderAndMove();
	                        event.currentTarget.value = '';
	                        return;
	                      }

	                      if (event.target.value === '__none__') {
	                        bulkUpdateSelectedTodoFolder(undefined);
	                        return;
	                      }

	                      if (event.target.value) {
	                        bulkUpdateSelectedTodoFolder(event.target.value);
	                      }
	                    }}
	                  >
	                    <option value="" disabled>
	                      フォルダ
	                    </option>
	                    <option value="__none__">フォルダなし</option>
	                    {todoFolders.map((folder) => (
	                      <option key={folder.id} value={folder.id}>
	                        {folder.name}
	                      </option>
	                    ))}
	                    <option value="__new__">＋ 新しいフォルダ</option>
	                  </select>
	                </div>
	              )}
	            </section>
	          );
	        })()}

        {isLibraryAnyMemoView && (
          <section
            className="quick-memo-page record-view-content"
            aria-label="メモ"
          >
            <div className="quick-memo-tabs" aria-label="メモ表示切り替え">
              {([
                ['memo', 'メモ'],
                ['folders', 'フォルダ'],
              ] as const).map(([tabName, label]) => (
                <button
                  aria-current={anyMemoTab === tabName ? 'page' : undefined}
                  data-active={anyMemoTab === tabName ? 'true' : 'false'}
                  key={tabName}
                  onClick={() => {
                    setAnyMemoTab(tabName);
                    setSelectedAnyMemoFolderId(null);
                    setMovingAnyMemoId(null);
                    setNewMoveFolderName('');
                  }}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>

            {anyMemoTab === 'memo' && (
            <>
            <section className="quick-memo-composer" aria-label="新しいメモ">
              <div className="quick-memo-composer-header">
                <div>
                  <h2>📝 メモ</h2>
                  <p>思いついたことを、そのまま置いておく。</p>
                </div>
                {anyMemoStatusMessage && (
                  <span className="quick-memo-status">{anyMemoStatusMessage}</span>
                )}
              </div>
              <textarea
                aria-label="新しいメモ"
                onChange={(event) => {
                  setNewAnyMemoText(event.target.value);
                  adjustTextareaHeight(event.currentTarget);
                }}
                onInput={(event) => adjustTextareaHeight(event.currentTarget)}
                placeholder="思いついたことを書く"
                ref={(element) => {
                  anyMemoInputRef.current = element;
                  adjustTextareaHeight(element);
                }}
                rows={3}
                value={newAnyMemoText}
              />
              <div className="quick-memo-composer-actions">
                <button
                  disabled={!hasMeaningfulText(newAnyMemoText)}
                  onClick={addAnyMemoItem}
                  type="button"
                >
                  追加
                </button>
              </div>
            </section>

            <section className="quick-memo-list-section" aria-label="保存済みメモ">
              <div className="quick-memo-list-heading">
                <h3>メモ一覧</h3>
                <span>{anyMemoListItems.length}件</span>
              </div>
              {anyMemoListItems.length === 0 ? (
                <p className="quick-memo-empty">まだメモはありません。</p>
              ) : (
                <div className="quick-memo-list">
                  {anyMemoListItems.map((item) => {
                    const isEditing = editingAnyMemoId === item.id;
                    const isExpanded = Boolean(expandedAnyMemoIds[item.id]);
                    const lineCount = item.text.split(/\r?\n/).length;
                    const isLongMemo = item.text.length > 120 || lineCount > 5;

                    return (
                      <article
                        className="quick-memo-item"
                        data-expanded={isExpanded ? 'true' : 'false'}
                        key={item.id}
                      >
                        <div className="quick-memo-item-meta">
                          <time dateTime={item.createdAt}>
                            {formatAnyMemoTimestamp(item, today)}
                          </time>
                          <details className="quick-memo-menu">
                            <summary aria-label="メモ操作">…</summary>
                            <div className="quick-memo-menu-panel">
                              <button onClick={() => startEditingAnyMemo(item)} type="button">
                                編集
                              </button>
                              <button
                                onClick={() => {
                                  setMovingAnyMemoId((currentId) =>
                                    currentId === item.id ? null : item.id,
                                  );
                                  setNewMoveFolderName('');
                                }}
                                type="button"
                              >
                                フォルダへ移動
                              </button>
                              {movingAnyMemoId === item.id && (
                                <section
                                  aria-label="移動先フォルダ"
                                  className="quick-memo-move-panel"
                                >
                                  <p>移動先を選ぶ</p>
                                  {sortedAnyMemoFolders.length > 0 && (
                                    <div className="quick-memo-move-folder-list">
                                      {sortedAnyMemoFolders.map((folder) => (
                                        <button
                                          key={folder.id}
                                          onClick={() => moveAnyMemoItemToFolder(item, folder.id)}
                                          type="button"
                                        >
                                          📁 {getAnyMemoFolderDisplayName(folder)}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  <div className="quick-memo-new-folder-move">
                                    <input
                                      aria-label="新しい移動先フォルダ名"
                                      onChange={(event) => setNewMoveFolderName(event.target.value)}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                          createFolderAndMoveAnyMemoItem(item);
                                        }
                                      }}
                                      placeholder="新しいフォルダ"
                                      type="text"
                                      value={newMoveFolderName}
                                    />
                                    <button
                                      disabled={!newMoveFolderName.trim()}
                                      onClick={() => createFolderAndMoveAnyMemoItem(item)}
                                      type="button"
                                    >
                                      ＋ 新しいフォルダ
                                    </button>
                                  </div>
                                </section>
                              )}
                              <button onClick={() => deleteAnyMemoItem(item)} type="button">
                                削除
                              </button>
                            </div>
                          </details>
                        </div>

                        {isEditing ? (
                          <div className="quick-memo-edit">
                            <textarea
                              aria-label="メモ本文を編集"
                              onChange={(event) => {
                                setEditingAnyMemoText(event.target.value);
                                adjustTextareaHeight(event.currentTarget);
                              }}
                              onInput={(event) => adjustTextareaHeight(event.currentTarget)}
                              ref={adjustTextareaHeight}
                              rows={3}
                              value={editingAnyMemoText}
                            />
                            <div className="quick-memo-edit-actions">
                              <button onClick={cancelEditingAnyMemo} type="button">
                                キャンセル
                              </button>
                              <button
                                disabled={!hasMeaningfulText(editingAnyMemoText)}
                                onClick={() => saveEditingAnyMemo(item)}
                                type="button"
                              >
                                保存
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button
                              className="quick-memo-text"
                              onClick={() => startEditingAnyMemo(item)}
                              type="button"
                            >
                              {item.text.trim()}
                            </button>
                            {isLongMemo && (
                              <button
                                className="quick-memo-expand-button"
                                onClick={() => toggleAnyMemoExpansion(item.id)}
                                type="button"
                              >
                                {isExpanded ? '閉じる' : '続きを読む'}
                              </button>
                            )}
                          </>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
            </>
            )}

            {anyMemoTab === 'folders' && !selectedAnyMemoFolder && (
              <section className="memo-folder-page" aria-label="メモフォルダ">
                <section className="memo-folder-create" aria-label="フォルダ作成">
                  <div>
                    <h2>📁 フォルダ</h2>
                    <p>テーマごとにメモを置いておく。</p>
                  </div>
                  <div className="memo-folder-create-row">
                    <input
                      aria-label="新しいフォルダ名"
                      onChange={(event) => setNewAnyMemoFolderName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          createAnyMemoFolder(null);
                        }
                      }}
                      placeholder="フォルダ名"
                      type="text"
                      value={newAnyMemoFolderName}
                    />
                    <button
                      disabled={!newAnyMemoFolderName.trim()}
                      onClick={() => createAnyMemoFolder(null)}
                      type="button"
                    >
                      ＋ フォルダを作る
                    </button>
                  </div>
                </section>

                {visibleAnyMemoFolders.length === 0 ? (
                  <p className="quick-memo-empty">まだフォルダはありません。</p>
                ) : (
                  <div className="memo-folder-list">
                    {visibleAnyMemoFolders.map((folder) => {
                      const folderMemoCount = anyMemoFolderItems.filter(
                        (item) => item.folderId === folder.id,
                      ).length;
                      const childFolderCount = anyMemoFolders.filter(
                        (childFolder) => childFolder.parentFolderId === folder.id,
                      ).length;
                      const isEditingFolder = editingAnyMemoFolderId === folder.id;

                      return (
                        <article className="memo-folder-card" key={folder.id}>
                          {isEditingFolder ? (
                            <div className="memo-folder-edit">
                              <input
                                aria-label={`${folder.name}のフォルダ名`}
                                autoFocus
                                onChange={(event) => setEditingAnyMemoFolderName(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    saveEditingAnyMemoFolder(folder.id);
                                  }

                                  if (event.key === 'Escape') {
                                    cancelEditingAnyMemoFolder();
                                  }
                                }}
                                type="text"
                                value={editingAnyMemoFolderName}
                              />
                              <button onClick={cancelEditingAnyMemoFolder} type="button">
                                キャンセル
                              </button>
                              <button
                                disabled={!editingAnyMemoFolderName.trim()}
                                onClick={() => saveEditingAnyMemoFolder(folder.id)}
                                type="button"
                              >
                                保存
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                className="memo-folder-open-button"
                                onClick={() => setSelectedAnyMemoFolderId(folder.id)}
                                type="button"
                              >
                                <span aria-hidden="true">📁</span>
                                <span>
                                  <strong>{folder.name}</strong>
                                  <small>
                                    {childFolderCount > 0 && `${childFolderCount}フォルダ / `}
                                    {folderMemoCount}件
                                  </small>
                                </span>
                                <i aria-hidden="true">›</i>
                              </button>
                              <details className="quick-memo-menu memo-folder-menu">
                                <summary aria-label={`${folder.name}のフォルダ操作`}>…</summary>
                                <div className="quick-memo-menu-panel">
                                  <button onClick={() => startEditingAnyMemoFolder(folder)} type="button">
                                    名前を変更
                                  </button>
                                  <label>
                                    フォルダを移動
                                    <select
                                      onChange={(event) =>
                                        moveAnyMemoFolder(folder, event.target.value || null)
                                      }
                                      value={folder.parentFolderId ?? ''}
                                    >
                                      <option value="">最上位</option>
                                      {getAnyMemoMoveCandidateFolders(folder.id).map((candidateFolder) => (
                                        <option key={candidateFolder.id} value={candidateFolder.id}>
                                          {getAnyMemoFolderDisplayName(candidateFolder)}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <button onClick={() => deleteAnyMemoFolder(folder)} type="button">
                                    削除
                                  </button>
                                </div>
                              </details>
                            </>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {anyMemoTab === 'folders' && selectedAnyMemoFolder && (
              <section className="memo-folder-detail-page" aria-label={`${selectedAnyMemoFolder.name}のメモ`}>
                <div className="memo-folder-detail-header">
                  <button
                    aria-label="フォルダ一覧へ戻る"
                    onClick={() => setSelectedAnyMemoFolderId(selectedAnyMemoFolder.parentFolderId)}
                    type="button"
                  >
                    ‹
                  </button>
                  <div>
                    <p className="memo-folder-breadcrumb">
                      メモ ＞ {selectedAnyMemoFolderPath.map((folder) => folder.name).join(' ＞ ')}
                    </p>
                    <h2>📁 {selectedAnyMemoFolder.name}</h2>
                  </div>
                </div>

                {visibleAnyMemoFolders.length > 0 && (
                  <section className="quick-memo-list-section" aria-label="子フォルダ">
                    <div className="quick-memo-list-heading">
                      <h3>フォルダ</h3>
                      <span>{visibleAnyMemoFolders.length}件</span>
                    </div>
                    <div className="memo-folder-list">
                      {visibleAnyMemoFolders.map((folder) => {
                        const folderMemoCount = anyMemoFolderItems.filter(
                          (item) => item.folderId === folder.id,
                        ).length;
                        const childFolderCount = anyMemoFolders.filter(
                          (childFolder) => childFolder.parentFolderId === folder.id,
                        ).length;
                        const isEditingFolder = editingAnyMemoFolderId === folder.id;

                        return (
                          <article className="memo-folder-card" key={folder.id}>
                            {isEditingFolder ? (
                              <div className="memo-folder-edit">
                                <input
                                  aria-label={`${folder.name}のフォルダ名`}
                                  autoFocus
                                  onChange={(event) => setEditingAnyMemoFolderName(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      saveEditingAnyMemoFolder(folder.id);
                                    }

                                    if (event.key === 'Escape') {
                                      cancelEditingAnyMemoFolder();
                                    }
                                  }}
                                  type="text"
                                  value={editingAnyMemoFolderName}
                                />
                                <button onClick={cancelEditingAnyMemoFolder} type="button">
                                  キャンセル
                                </button>
                                <button
                                  disabled={!editingAnyMemoFolderName.trim()}
                                  onClick={() => saveEditingAnyMemoFolder(folder.id)}
                                  type="button"
                                >
                                  保存
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  className="memo-folder-open-button"
                                  onClick={() => setSelectedAnyMemoFolderId(folder.id)}
                                  type="button"
                                >
                                  <span aria-hidden="true">📁</span>
                                  <span>
                                    <strong>{folder.name}</strong>
                                    <small>
                                      {childFolderCount > 0 && `${childFolderCount}フォルダ / `}
                                      {folderMemoCount}件
                                    </small>
                                  </span>
                                  <i aria-hidden="true">›</i>
                                </button>
                                <details className="quick-memo-menu memo-folder-menu">
                                  <summary aria-label={`${folder.name}のフォルダ操作`}>…</summary>
                                  <div className="quick-memo-menu-panel">
                                    <button onClick={() => startEditingAnyMemoFolder(folder)} type="button">
                                      名前を変更
                                    </button>
                                    <label>
                                      フォルダを移動
                                      <select
                                        onChange={(event) =>
                                          moveAnyMemoFolder(folder, event.target.value || null)
                                        }
                                        value={folder.parentFolderId ?? ''}
                                      >
                                        <option value="">最上位</option>
                                        {getAnyMemoMoveCandidateFolders(folder.id).map((candidateFolder) => (
                                          <option key={candidateFolder.id} value={candidateFolder.id}>
                                            {getAnyMemoFolderDisplayName(candidateFolder)}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <button onClick={() => deleteAnyMemoFolder(folder)} type="button">
                                      削除
                                    </button>
                                  </div>
                                </details>
                              </>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}

                <section className="memo-folder-create" aria-label="子フォルダ作成">
                  <div>
                    <h2>📁 フォルダを作る</h2>
                    <p>このフォルダの中に置きます。</p>
                  </div>
                  <div className="memo-folder-create-row">
                    <input
                      aria-label="新しい子フォルダ名"
                      onChange={(event) => setNewAnyMemoFolderName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          createAnyMemoFolder(selectedAnyMemoFolder.id);
                        }
                      }}
                      placeholder="フォルダ名"
                      type="text"
                      value={newAnyMemoFolderName}
                    />
                    <button
                      disabled={!newAnyMemoFolderName.trim()}
                      onClick={() => createAnyMemoFolder(selectedAnyMemoFolder.id)}
                      type="button"
                    >
                      ＋ フォルダ
                    </button>
                  </div>
                </section>

                <section className="quick-memo-composer" aria-label="フォルダ内の新しいメモ">
                  <div className="quick-memo-composer-header">
                    <div>
                      <h2>メモを追加</h2>
                      <p>このフォルダにだけ保存します。</p>
                    </div>
                    {anyMemoStatusMessage && (
                      <span className="quick-memo-status">{anyMemoStatusMessage}</span>
                    )}
                  </div>
                  <textarea
                    aria-label={`${selectedAnyMemoFolder.name}へ追加するメモ`}
                    onChange={(event) => {
                      setNewFolderMemoText(event.target.value);
                      adjustTextareaHeight(event.currentTarget);
                    }}
                    onInput={(event) => adjustTextareaHeight(event.currentTarget)}
                    placeholder="思いついたことを書く"
                    ref={adjustTextareaHeight}
                    rows={3}
                    value={newFolderMemoText}
                  />
                  <div className="quick-memo-composer-actions">
                    <button
                      disabled={!hasMeaningfulText(newFolderMemoText)}
                      onClick={() => addFolderMemoItem(selectedAnyMemoFolder.id)}
                      type="button"
                    >
                      追加
                    </button>
                  </div>
                </section>

                <section className="quick-memo-list-section" aria-label="フォルダ内メモ一覧">
                  <div className="quick-memo-list-heading">
                    <h3>保存済みメモ</h3>
                    <span>{selectedAnyMemoFolderItems.length}件</span>
                  </div>
                  {selectedAnyMemoFolderItems.length === 0 ? (
                    <p className="quick-memo-empty">このフォルダのメモはまだありません。</p>
                  ) : (
                    <div className="quick-memo-list">
                      {selectedAnyMemoFolderItems.map((item) => {
                        const displayItem: AnyMemoListItem = {
                          ...item,
                          source: 'item',
                          hasTime: true,
                        };
                        const isEditing = editingAnyMemoId === item.id;
                        const isExpanded = Boolean(expandedAnyMemoIds[item.id]);
                        const lineCount = item.text.split(/\r?\n/).length;
                        const isLongMemo = item.text.length > 120 || lineCount > 5;

                        return (
                          <article
                            className="quick-memo-item"
                            data-expanded={isExpanded ? 'true' : 'false'}
                            key={item.id}
                          >
                            <div className="quick-memo-item-meta">
                              <time dateTime={item.createdAt}>
                                {formatAnyMemoTimestamp(displayItem, today)}
                              </time>
                              <details className="quick-memo-menu">
                                <summary aria-label="メモ操作">…</summary>
                                <div className="quick-memo-menu-panel">
                                  <button onClick={() => startEditingFolderMemo(item)} type="button">
                                    編集
                                  </button>
                                  <button
                                    onClick={() => {
                                      setMovingAnyMemoId((currentId) =>
                                        currentId === item.id ? null : item.id,
                                      );
                                      setNewMoveFolderName('');
                                    }}
                                    type="button"
                                  >
                                    フォルダへ移動
                                  </button>
                                  {movingAnyMemoId === item.id && (
                                    <section
                                      aria-label="移動先フォルダ"
                                      className="quick-memo-move-panel"
                                    >
                                      <p>移動先を選ぶ</p>
                                      <div className="quick-memo-move-folder-list">
                                        {sortedAnyMemoFolders
                                          .filter((folder) => folder.id !== item.folderId)
                                          .map((folder) => (
                                            <button
                                              key={folder.id}
                                              onClick={() => moveFolderMemoItemToFolder(item, folder.id)}
                                              type="button"
                                            >
                                              📁 {getAnyMemoFolderDisplayName(folder)}
                                            </button>
                                          ))}
                                      </div>
                                    </section>
                                  )}
                                  <button onClick={() => deleteFolderMemoItem(item)} type="button">
                                    削除
                                  </button>
                                </div>
                              </details>
                            </div>

                            {isEditing ? (
                              <div className="quick-memo-edit">
                                <textarea
                                  aria-label="メモ本文を編集"
                                  onChange={(event) => {
                                    setEditingAnyMemoText(event.target.value);
                                    adjustTextareaHeight(event.currentTarget);
                                  }}
                                  onInput={(event) => adjustTextareaHeight(event.currentTarget)}
                                  ref={adjustTextareaHeight}
                                  rows={3}
                                  value={editingAnyMemoText}
                                />
                                <div className="quick-memo-edit-actions">
                                  <button onClick={cancelEditingAnyMemo} type="button">
                                    キャンセル
                                  </button>
                                  <button
                                    disabled={!hasMeaningfulText(editingAnyMemoText)}
                                    onClick={() => saveEditingFolderMemo(item)}
                                    type="button"
                                  >
                                    保存
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <button
                                  className="quick-memo-text"
                                  onClick={() => startEditingFolderMemo(item)}
                                  type="button"
                                >
                                  {item.text.trim()}
                                </button>
                                {isLongMemo && (
                                  <button
                                    className="quick-memo-expand-button"
                                    onClick={() => toggleAnyMemoExpansion(item.id)}
                                    type="button"
                                  >
                                    {isExpanded ? '閉じる' : '続きを読む'}
                                  </button>
                                )}
                              </>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              </section>
            )}
          </section>
        )}

        {isLibraryRecordView && !isLibraryAchievementsView && !isLibraryAnyMemoView && (
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
              <div className="records-display-toggle" aria-label="記録一覧の表示モード">
                {([
                  ['all', '一覧'],
                  ['withRecords', '記録あり'],
                ] as const).map(([mode, label]) => (
                  <button
                    aria-pressed={recordDisplayMode === mode}
                    data-active={recordDisplayMode === mode ? 'true' : 'false'}
                    key={mode}
                    onClick={() => setRecordDisplayMode(mode)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="records-day-list">
              {visibleRecordDaySummaries.length === 0 && (
                <p className="records-empty-filter">この月の記録はまだありません</p>
              )}
              {visibleRecordDaySummaries.map(({
                advancedEntries,
                anyMemoText,
                dateKey,
                dateTitle,
                dayKind,
                hasRecordContent,
                recordContentCount,
                recordDate,
                savedEventEntries,
                savedMemoEntries,
              }) => {
                return (
                  <article
                    className="record-day-card"
                    data-date-key={dateKey}
                    data-day-kind={dayKind}
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
                        {recordView === 'advanced' && advancedEntries.length > 0 && (
                          <div className="record-read-section">
                            <h3>⚙️ アドバンスト</h3>
                            <div className="record-read-list">
                              {advancedEntries.map((entry) => (
                                <p key={`record-read-advanced-${dateKey}-${entry.id}`}>
                                  {entry.label.trim()}
                                </p>
                              ))}
                            </div>
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
              const advancedEntries = getAdvancedEntriesFromSections(
                removeFixedRoutineItems(getSectionsForTarget(
                  templateSettings,
                  dateOverrides,
                  dateSnapshots,
                  resolveDateTarget(
                    templateSettings,
                    dateOverrides,
                    dateSnapshots,
                    recordDate,
                    todayKey,
                  ),
                  todayKey,
                )),
              );
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
                            placeholder="今日の気付きや思ったことを書き残しておこう"
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
                            placeholder="今日あったことややったこと書き残してみよう"
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
                    {recordView === 'advanced' && (
                    <div className="record-field">
                      <label>⚙️ アドバンスト</label>
                      {advancedEntries.length > 0 ? (
                        <div className="record-entry-list">
                          {advancedEntries.map((entry) => (
                            <textarea
                              aria-label={`${dateTitle}のアドバンスト ${entry.label}`}
                              key={`record-editor-advanced-${dateKey}-${entry.id}`}
                              onChange={(event) => {
                                adjustTextareaHeight(event.currentTarget);
                                updateRecordAdvancedEntry(recordDate, entry.id, event.target.value);
                              }}
                              placeholder="追加でやったこと"
                              ref={adjustTextareaHeight}
                              rows={1}
                              value={entry.label}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="record-editor-empty">この日のアドバンスト記録はありません。</p>
                      )}
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
            <section className="monthly-stamp-summary" aria-label="今月のスタンプ集計">
              <div className="monthly-stamp-summary-heading">
                <h3>今月のスタンプ</h3>
                <span>合計{monthlyStampSummary.total}こ</span>
              </div>
              <div className="monthly-stamp-summary-grid">
                {monthlyStampSummary.items.map((stamp) => (
                  <article
                    className="monthly-stamp-card"
                    data-stamp-level={stamp.level}
                    data-empty={stamp.count === 0 ? 'true' : 'false'}
                    key={stamp.level}
                  >
                    <span className="monthly-stamp-icon" aria-hidden="true">
                      {stamp.icon}
                    </span>
                    <span className="monthly-stamp-name">{stamp.label}</span>
                    <strong>{stamp.count}こ</strong>
                  </article>
                ))}
              </div>
            </section>
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
                    data-day-kind={day.dayKind}
                    data-routine-kind={day.routineKind}
                    data-selected={day.isSelected ? 'true' : 'false'}
                    data-today={day.isToday ? 'true' : 'false'}
                    key={day.dateKey}
                    onClick={() => {
                      setHistorySelectedDate((currentDate) =>
                        currentDate && getDateKey(currentDate) === day.dateKey ? null : day.date,
                      );
                      setIsHistoryEditMode(false);
                      setDraggedItemId(null);
                      setEditingItemId(null);
                      setEditingLabel('');
                      setRoutineDrafts({});
                      routineDraftComposingSectionsRef.current.clear();
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
                        setDraggedItemId(null);
                        setEditingItemId(null);
                        setEditingLabel('');
                        setRoutineDrafts({});
                        routineDraftComposingSectionsRef.current.clear();
                      }}
                      type="button"
                    >
                      閉じる
                    </button>
                    <button
                      className="edit-mode-button history-edit-button"
                      onClick={() => {
                        setIsHistoryEditMode((current) => !current);
                        setDraggedItemId(null);
                        setEditingItemId(null);
                        setEditingLabel('');
                        setRoutineDrafts({});
                        routineDraftComposingSectionsRef.current.clear();
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
                      <p className="result-rank">クエスト未設定</p>
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
                <section className="history-choice-quest-card" aria-label="選択クエストの記録">
                  {(() => {
                    const choiceRecord = choiceQuestRecords[historySelectedDateKey];
                    const choiceOption = choiceQuestOptions.find(
                      (option) => option.id === choiceRecord?.selectedOptionId,
                    );

                    return (
                      <>
                        <h3>選択クエスト</h3>
                        <p>
                          {choiceOption
                            ? `${choiceOption.icon} ${choiceOption.label}`
                            : '未選択'}
                        </p>
                        <span data-completed={choiceRecord?.completed ? 'true' : 'false'}>
                          {choiceRecord?.completed ? '達成' : '未達成'}
                        </span>
                      </>
                    );
                  })()}
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
                              placeholder="今日の気付きや思ったことを書き残しておこう"
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
                              placeholder="今日あったことややったこと書き残してみよう"
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
                                {renderQuestInfoButton({
                                  id: `history-core-${coreRoutine.id}`,
                                  kind: 'fixed',
                                  onSupportClick: () => focusDailyRecordField(coreRoutine.kind, 'history'),
                                  supportLabel: 'ひとことへ',
                                })}
                              </span>
                            </div>
                          );
                        }

                        const item = entry.item;
                        const isEditing = editingItemId === item.id;
                        const isFixedItem = fixedRoutineIds.has(item.id);
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
                          key={item.id}
                        >
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
                                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
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
                                disabled
                                type="button"
                              >
                                {getCoreRoutineDisplayLabel(item)}
                              </button>
                            )}
                            {item.time && (
                              <span className="fixed-time-display">{item.time}</span>
                            )}
                            {renderQuestInfoButton({
                              id: `history-routine-${item.id}`,
                              kind: isFixedItem ? 'fixed' : 'core',
                              onSupportClick:
                                !isFixedItem && isHistoryEditMode
                                  ? () => {
                                    setEditingItemId(item.id);
                                    setEditingLabel(item.label);
                                  }
                                  : undefined,
                              supportLabel: isFixedItem
                                ? getFixedQuestSupportLabel(item.fixedKind)
                                : '変更可能',
                            })}
                          </span>
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
                      {isHistoryEditMode &&
                        Object.prototype.hasOwnProperty.call(routineDrafts, section.id) && (
                        <div
                          className="history-routine-item history-routine-draft-item"
                          data-section-id={section.id}
                          data-routine-draft="true"
                        >
                          <span className="history-routine-draft-check" aria-hidden="true" />
                          <span className="history-routine-name">
                            <input
                              aria-label={`${section.title}へ追加するフリークエスト`}
                              autoFocus
                              onBlur={(event) => commitRoutineDraft(section.id, event.currentTarget.value)}
                              onChange={(event) => updateRoutineDraft(section.id, event.target.value)}
                              onCompositionEnd={(event) => {
                                routineDraftComposingSectionsRef.current.delete(section.id);
                                updateRoutineDraft(section.id, event.currentTarget.value);
                              }}
                              onCompositionStart={() =>
                                routineDraftComposingSectionsRef.current.add(section.id)
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                                  event.currentTarget.blur();
                                }

                                if (event.key === 'Escape') {
                                  discardRoutineDraft(section.id);
                                }
                              }}
                              placeholder={section.id === bonusSectionId ? '追加でやったこと' : 'クエスト名を入力'}
                              type="text"
                              value={routineDrafts[section.id] ?? ''}
                            />
                          </span>
                        </div>
                      )}
                    </div>
                    {isHistoryEditMode &&
                      !Object.prototype.hasOwnProperty.call(routineDrafts, section.id) && (
                      <button
                        className="add-button section-add-button"
                        onClick={() => addRoutine(section.id)}
                        type="button"
                      >
                        ＋追加
                      </button>
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

        {isLibraryAchievementsView && (
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
                  <dt>PTボーナス倍率</dt>
                  <dd>×{playerRankProgress.multiplier.toFixed(2)}</dd>
                </div>
              </dl>
            </section>
            {masteryStats.length === 0 ? (
              <p className="empty-achievements">
                まずは今日のクエストをチェックすると、ここに実績が育っていきます。
              </p>
            ) : (
              <>
                <section className="mastery-section-group" aria-label="固定クエスト実績">
                  <h3>固定クエスト実績</h3>
                  <div className="mastery-list">
                    {fixedQuestMasteryStats.map((itemStats) => (
                      <article
                        className="mastery-card"
                        data-current={itemStats.isCurrentItem ? 'true' : 'false'}
                        data-hall-of-fame={itemStats.isHallOfFame ? 'true' : 'false'}
                        key={itemStats.itemId}
                      >
                        <div className="mastery-card-title">
                          <div>
                            <p className="mastery-section-name">
                              <span className="quest-kind-mini-badge" data-kind="fixed">
                                固定クエスト
                              </span>
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
                </section>
                <section className="mastery-section-group" aria-label="フリークエスト実績">
                  <h3>フリークエスト実績</h3>
                  <div className="mastery-list">
                    {coreRoutineMasteryStats.map((itemStats) => (
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
                            <h3>
                              {formatRoutineNumber(itemStats.routineNumber)}
                              {formatRoutineNumber(itemStats.routineNumber) ? ' ' : ''}
                              {itemStats.label}
                            </h3>
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
                </section>
              </>
            )}
          </section>
        )}

        {isShopView && (
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
                  <section
                    className="shop-category-card"
                    id={isQuestSlotCategory ? 'quest-slot-shop-section' : undefined}
                    key={category}
                  >
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

        {(isSettingsView || (page === 'today' && isEditMode)) && (
          <div
            className="main-actions"
            data-editing={isSettingsView || (page === 'today' && isEditMode) ? 'true' : 'false'}
          >
            <button
              className="default-template-button"
              onClick={() => saveDisplayedRoutineAsTemplate('normal')}
              type="button"
            >
              編集内容を通常ルーティンに反映
            </button>
            <button
              className="default-template-button"
              onClick={() => saveDisplayedRoutineAsTemplate('holiday')}
              type="button"
            >
              編集内容を休日ルーティンに反映
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

        {isSettingsView && (
          <section className="data-management" aria-label="データ管理">
            <div className="data-management-heading">
              <h2>データ管理</h2>
            </div>
            <div className="data-management-content">
              <p>hibitinの保存データをJSONファイルで書き出し・読み込みできます。</p>
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
                読み込み時は、復元前に現在データの自動バックアップを書き出してから上書きします。
              </p>
              <div className="cloud-backup-panel">
                <div className="cloud-backup-header">
                  <div>
                    <h3>クラウドバックアップ</h3>
                    <p>ログイン中は、端末内データを数秒後にクラウドへ自動保存します。</p>
                  </div>
                  <span data-status={cloudBackupStatus}>
                    {cloudBackupStatusLabels[cloudBackupStatus]}
                  </span>
                </div>
                <dl className="cloud-backup-summary">
                  <div>
                    <dt>最終クラウド保存</dt>
                    <dd>
                      {(cloudBackupInfo?.updatedAt ?? lastCloudBackupAt)
                        ? backupDateTimeFormatter.format(new Date(cloudBackupInfo?.updatedAt ?? lastCloudBackupAt ?? ''))
                        : 'まだありません'}
                    </dd>
                  </div>
                  <div>
                    <dt>保存状態</dt>
                    <dd>{cloudBackupStatusLabels[cloudBackupStatus]}</dd>
                  </div>
                  <div>
                    <dt>クラウドバックアップ日時</dt>
                    <dd>
                      {isCloudBackupChecking
                        ? '確認中…'
                        : cloudBackupInfo
                          ? backupDateTimeFormatter.format(new Date(cloudBackupInfo.updatedAt))
                          : 'まだありません'}
                    </dd>
                  </div>
                  <div>
                    <dt>データ件数</dt>
                    <dd>{cloudBackupInfo ? `${cloudBackupInfo.dataCount}件` : '-'}</dd>
                  </div>
                  <div>
                    <dt>バックアップバージョン</dt>
                    <dd>{cloudBackupInfo ? `v${cloudBackupInfo.backupVersion}` : '-'}</dd>
                  </div>
                </dl>
                {!authUser && (
                  <p className="cloud-backup-login-note">
                    クラウド保存にはログインが必要です。
                  </p>
                )}
                {authUser && isCloudBackupChecking && (
                  <p className="cloud-backup-login-note">
                    クラウドバックアップを確認中…
                  </p>
                )}
                <button
                  className="cloud-backup-button"
                  disabled={!authUser || cloudBackupStatus === 'saving'}
                  onClick={() => void saveCloudBackup()}
                  type="button"
                >
                  クラウドへバックアップ
                </button>
                <button
                  className="cloud-backup-button"
                  disabled={!authUser || isCloudBackupChecking || isCloudRestoreBusy || !cloudBackupInfo}
                  onClick={() => void openCloudRestoreConfirm()}
                  type="button"
                >
                  クラウドから復元
                </button>
                {cloudBackupMessage && (
                  <p className="backup-message">{cloudBackupMessage}</p>
                )}
              </div>
              <div className="auto-backup-panel">
                <div className="auto-backup-header">
                  <div>
                    <h3>自動バックアップ</h3>
                    <p>同じ端末内に、直近のセーブデータを自動で残します。</p>
                  </div>
                  <span>{autoBackups.length}世代</span>
                </div>
                <dl className="auto-backup-summary">
                  <div>
                    <dt>最終バックアップ</dt>
                    <dd>
                      {autoBackups[0]
                        ? backupDateTimeFormatter.format(new Date(autoBackups[0].createdAt))
                        : 'まだありません'}
                    </dd>
                  </div>
                  <div>
                    <dt>保存世代数</dt>
                    <dd>{autoBackups.length} / {AUTO_BACKUP_MAX_GENERATIONS}</dd>
                  </div>
                </dl>
                <div className="auto-backup-actions">
                  <button onClick={() => void createAutoBackupNow()} type="button">
                    今すぐ自動バックアップを作成
                  </button>
                  <button
                    aria-expanded={isAutoBackupListOpen}
                    onClick={() => setIsAutoBackupListOpen((isOpen) => !isOpen)}
                    type="button"
                  >
                    自動バックアップ一覧
                  </button>
                </div>
                {autoBackupMessage && <p className="backup-message">{autoBackupMessage}</p>}
                {isAutoBackupListOpen && (
                  <div className="auto-backup-list">
                    {autoBackups.length > 0 ? (
                      autoBackups.map((record) => (
                        <article className="auto-backup-item" key={record.id}>
                          <div>
                            <strong>{backupDateTimeFormatter.format(new Date(record.createdAt))}</strong>
                            <span>{record.dataCount}件 / v{record.backupVersion}</span>
                          </div>
                          <div className="auto-backup-item-actions">
                            <button onClick={() => void restoreAutoBackup(record)} type="button">
                              復元
                            </button>
                            <button onClick={() => void removeAutoBackup(record)} type="button">
                              削除
                            </button>
                          </div>
                        </article>
                      ))
                    ) : (
                      <p className="auto-backup-empty">自動バックアップはまだありません。</p>
                    )}
                  </div>
                )}
              </div>
              <div className="reset-actions">
                <button
                  className="reset-initial-button"
                  onClick={resetToInitialState}
                  type="button"
                >
                  初回状態にリセット
                </button>
                <p>
                  開発中に初期クエストを確認するための操作です。hibitin以外の保存データは削除しません。
                </p>
              </div>
            </div>
          </section>
        )}

      </div>

      {isTodoReviewOpen && pendingTodoReviews.length > 0 && (
        <div
          className="todo-review-backdrop"
          role="presentation"
          onClick={deferTodoReview}
        >
          <section
            aria-labelledby="todo-review-title"
            aria-modal="true"
            className="todo-review-panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="todo-review-header">
              <div>
                <p>☑️ やること整理</p>
                <h2 id="todo-review-title">昨日のやることが残っています</h2>
              </div>
              <button
                aria-label="あとで確認する"
                onClick={deferTodoReview}
                type="button"
              >
                ×
              </button>
            </div>
            <p className="todo-review-lead">今日どうするか決めておこう。</p>
            <div className="todo-review-bulk-actions" aria-label="一括操作">
              <button onClick={() => applyTodoReviewBulkAction('today')} type="button">
                全部今日へ移す
              </button>
              <button onClick={() => applyTodoReviewBulkAction('soon')} type="button">
                全部早めに移す
              </button>
              <button onClick={deferTodoReview} type="button">
                あとで確認する
              </button>
            </div>
            <div className="todo-review-list">
              {pendingTodoReviews.map((todo) => {
                const originDate = todo.pendingReview?.originDate
                  ? getDateFromKey(todo.pendingReview.originDate)
                  : today;
                const originLabel = `${originDate.getMonth() + 1}月${originDate.getDate()}日`;

                return (
                  <article className="todo-review-item" key={todo.id}>
                    <div>
                      <p>{todo.text}</p>
                      <span>
                        {originLabel} / 元の区分: {getTodoStatusLabel(todo.pendingReview?.fromStatus ?? 'today')}
                      </span>
                    </div>
                    <select
                      aria-label={`${todo.text}をどうするか`}
                      onChange={(event) =>
                        setTodoReviewActions((currentActions) => ({
                          ...currentActions,
                          [todo.id]: event.target.value as TodoReviewAction,
                        }))
                      }
                      value={todoReviewActions[todo.id] ?? 'today'}
                    >
                      <option value="today">今日へ移す</option>
                      <option value="tomorrow">明日へ移す</option>
                      <option value="soon">早めにやるへ移す</option>
                      <option value="someday">いずれやるへ移す</option>
                      <option value="completed">完了にする</option>
                      <option value="delete">削除</option>
                    </select>
                  </article>
                );
              })}
            </div>
            <div className="todo-review-actions">
              <button onClick={deferTodoReview} type="button">
                あとで確認する
              </button>
              <button onClick={() => applyTodoReviewActions(todoReviewActions)} type="button">
                決定
              </button>
            </div>
          </section>
        </div>
      )}

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
            <h2 id="timer-finished-title">時間になりました</h2>
            <p className="timer-finished-routine">
              {activeTimer.label} {formatTimerDuration(activeTimer.durationSeconds)}
            </p>
            <p className="timer-finished-message">ここまでで一区切り。</p>
            <div className="timer-finished-actions">
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
            <h2 id="delete-dialog-title">削除しますか？</h2>
            <p>「{pendingDelete.label}」を今日のクエスト一覧から削除します。</p>
            <div className="dialog-actions">
              <button onClick={deleteRoutine} type="button">
                削除する
              </button>
              <button onClick={() => setPendingDelete(null)} type="button">
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {isQuestSlotGuideOpen && (
        <div className="dialog-backdrop" role="presentation">
          <div
            aria-labelledby="quest-slot-guide-title"
            aria-modal="true"
            className="delete-dialog quest-slot-guide-dialog"
            role="dialog"
          >
            <h2 id="quest-slot-guide-title">枠がいっぱいです</h2>
            <p>フリークエスト枠を使い切っています。ショップで枠を増やしてください。</p>
            <div className="dialog-actions">
              <button onClick={goToQuestSlotShop} type="button">
                ショップへ
              </button>
              <button onClick={() => setIsQuestSlotGuideOpen(false)} type="button">
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {isCloudRestoreConfirmOpen && cloudBackupInfo && (
        <div className="dialog-backdrop" role="presentation">
          <div
            aria-labelledby="cloud-restore-dialog-title"
            aria-modal="true"
            className="delete-dialog cloud-restore-dialog"
            role="dialog"
          >
            <h2 id="cloud-restore-dialog-title">クラウドから復元しますか？</h2>
            <p>
              クラウドバックアップから復元しますか？ 現在の端末データは先にJSONファイルとして書き出され、その後クラウドデータで置き換えられます。
            </p>
            <dl className="cloud-restore-summary">
              <div>
                <dt>クラウド保存日時</dt>
                <dd>{backupDateTimeFormatter.format(new Date(cloudBackupInfo.updatedAt))}</dd>
              </div>
              <div>
                <dt>データ件数</dt>
                <dd>{cloudBackupInfo.dataCount}件</dd>
              </div>
            </dl>
            <p className="cloud-restore-warning">
              現在の端末データは置き換わります。復元前に現在データを書き出します。
            </p>
            <div className="dialog-actions">
              <button
                disabled={isCloudRestoreBusy}
                onClick={() => setIsCloudRestoreConfirmOpen(false)}
                type="button"
              >
                キャンセル
              </button>
              <button
                disabled={isCloudRestoreBusy}
                onClick={() => void restoreCloudBackup()}
                type="button"
              >
                復元する
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;

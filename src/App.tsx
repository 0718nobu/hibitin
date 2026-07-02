import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';

type RoutineSource = 'default' | 'user' | 'ai';
type TemplateKind = 'normal' | 'holiday';
type PageName = 'today' | 'history' | 'achievements' | 'settings';
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

type RoutineItem = {
  id: string;
  label: string;
  order: number;
  source: RoutineSource;
  createdAt: string;
  fixedKind?: 'wake' | 'sleep';
  time?: string;
  timerMinutes?: number;
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
  isHallOfFame: boolean;
  isCurrentItem: boolean;
  lastSeenDateKey: string;
};

const BACKUP_VERSION = 1;
const LEGACY_ROUTINES_STORAGE_KEY = 'hibitin-routines:v1';
const TEMPLATES_STORAGE_KEY = 'hibitin:templates:v1';
const DATE_SNAPSHOTS_STORAGE_KEY = 'hibitin:dateSnapshots:v1';
const DATE_OVERRIDES_STORAGE_KEY = 'hibitin:dateOverrides:v1';
const ARCHIVED_ITEMS_STORAGE_KEY = 'hibitin:archivedItems:v1';
const TIMER_STATE_STORAGE_KEY = 'hibitin:timerState:v1';
const LEGACY_RHYTHM_SETTINGS_STORAGE_KEY = 'hibitin:lifestyleSettings:v1';
const RHYTHM_SETTINGS_STORAGE_KEY = 'hibitin:rhythmSettings:v1';

const isHibitinStorageKey = (key: string) =>
  key.startsWith('hibitin:') || key.startsWith('hibitin-');

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
  wakeTime: '06:10',
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

const timerPresetMinutes = [5, 10, 15, 20, 30];

const dailyMessages = [
  '🌅 今日もゲームスタート。',
  '🎲 さて、今日はどんな一日になる？',
  '🌱 昨日より1%前へ。',
  '☀️ 今日のクエストを始めよう。',
  '🎯 完璧じゃなくて、前進。',
  '🧭 迷ったら、今できる一個から。',
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
        id: 'morning-wake-up',
        label: '起床',
        order: 10,
        source: 'default',
        createdAt: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 'morning-pack',
        label: 'パック',
        order: 20,
        source: 'default',
        createdAt: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 'morning-english',
        label: '英語',
        order: 30,
        source: 'default',
        createdAt: '2026-06-01T00:00:00.000Z',
      },
    ],
  },
  {
    id: 'noon',
    title: '昼',
    order: 20,
    items: [
      {
        id: 'noon-reading',
        label: '読書',
        order: 10,
        source: 'default',
        createdAt: '2026-06-01T00:00:00.000Z',
      },
    ],
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
    items: [
      {
        id: 'night-sleep',
        label: '就寝',
        order: 10,
        source: 'default',
        createdAt: '2026-06-01T00:00:00.000Z',
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

const normalizeItemOrders = (items: RoutineItem[]) =>
  items.map((item, index) => ({
    ...item,
    order: (index + 1) * 10,
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

const getChecksStorageKey = (date: Date) => `hibitin:checks:${getDateKey(date)}`;
const getDailyMemoStorageKey = (date: Date) => `hibitin:memo:${getDateKey(date)}`;

const loadDailyMemo = (date: Date) =>
  localStorage.getItem(getDailyMemoStorageKey(date)) ?? '';

const getDateFromKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number);

  return new Date(year, month - 1, day);
};

const addDays = (date: Date, days: number) => {
  const nextDate = new Date(date);

  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
};

const getDailyMessage = (dateKey: string) => {
  const messageIndex = [...dateKey].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  ) % dailyMessages.length;

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
const MASTERY_RULES = [
  { stars: 1, streakDays: 5 },
  { stars: 2, streakDays: 10 },
  { stars: 3, streakDays: 20 },
  { stars: 4, streakDays: 40 },
  { stars: 5, streakDays: 80 },
];
const HALL_OF_FAME_STARS = 5;

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

  if (rate >= 80) {
    return { icon: '🌟', label: 'EXCELLENT!', level: 'excellent' };
  }

  if (rate >= 60) {
    return { icon: '🎉', label: 'GREAT!', level: 'great' };
  }

  if (rate >= 30) {
    return { icon: '👍', label: 'GOOD!', level: 'good' };
  }

  if (rate >= 1) {
    return { icon: '👟', label: 'START!', level: 'start' };
  }

  return { icon: '☕', label: 'READY?', level: 'ready' };
};

const formatTimerMinutes = (minutes: number) => {
  if (Number.isInteger(minutes)) {
    return `${minutes}分`;
  }

  return `${minutes.toFixed(1).replace(/\.0$/, '')}分`;
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

const getTimerSelectValue = (minutes?: number) => {
  if (!minutes) {
    return 'none';
  }

  return timerPresetMinutes.includes(minutes) ? String(minutes) : 'custom';
};

const getMasteryStarCount = (bestStreak: number) =>
  MASTERY_RULES.filter((rule) => bestStreak >= rule.streakDays).length;

const formatMasteryStars = (starCount: number) =>
  starCount > 0
    ? `${'⭐'.repeat(starCount)}${starCount >= HALL_OF_FAME_STARS ? ' 👑' : ''}`
    : '';

const getMasteryRuleText = () =>
  MASTERY_RULES.map((rule) => `${'⭐'.repeat(rule.stars)}：${rule.streakDays}日連続`);

const getStoredCheckDateKeys = () => {
  const prefix = 'hibitin:checks:';

  return Object.keys(localStorage)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length))
    .filter((dateKey) => /^\d{4}-\d{2}-\d{2}$/.test(dateKey))
    .sort();
};

const calculateItemCheckHistoryStats = (
  itemId: string,
  todayKey: string,
  checkOverrides: Record<string, Record<string, boolean>>,
) => {
  const storedDateKeys = getStoredCheckDateKeys().filter((dateKey) => dateKey <= todayKey);
  const firstDateKey = storedDateKeys[0] ?? todayKey;
  let totalCompletions = 0;
  let bestStreak = 0;
  let currentStreak = 0;
  let runningStreak = 0;

  for (
    let date = getDateFromKey(firstDateKey);
    getDateKey(date) <= todayKey;
    date = addDays(date, 1)
  ) {
    const dateKey = getDateKey(date);
    const checks = checkOverrides[dateKey] ?? loadCheckedItems(date);

    if (checks[itemId]) {
      totalCompletions += 1;
      runningStreak += 1;
      bestStreak = Math.max(bestStreak, runningStreak);
      currentStreak = runningStreak;
      continue;
    }

    runningStreak = 0;
    currentStreak = 0;
  }

  const starCount = getMasteryStarCount(bestStreak);

  return {
    totalCompletions,
    currentStreak,
    bestStreak,
    starCount,
    isHallOfFame: starCount >= HALL_OF_FAME_STARS,
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
      .filter((section) => section.id !== bonusSectionId)
      .flatMap((section) => section.items.map((item) => item.id)),
  );
  const currentItemOrder = new Map<string, number>();

  currentDisplaySections
    .filter((section) => section.id !== bonusSectionId)
    .forEach((section, sectionIndex) => {
      section.items.forEach((item, itemIndex) => {
        currentItemOrder.set(item.id, sectionIndex * 1000 + itemIndex);
      });
    });

  const stats = new Map<string, MasteryStats>();
  const runningStreaks = new Map<string, number>();
  const seenItemIds = new Set<string>();

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
    ).filter((section) => section.id !== bonusSectionId);
    const checks = checkOverrides[dateKey] ?? loadCheckedItems(date);
    const presentItemIds = new Set<string>();

    sections.forEach((section, sectionIndex) => {
      section.items.forEach((item, itemIndex) => {
        presentItemIds.add(item.id);

        const existingStats = stats.get(item.id);
        const order = currentItemOrder.get(item.id) ?? sectionIndex * 1000 + itemIndex;

        stats.set(item.id, {
          itemId: item.id,
          label: item.label,
          sectionId: section.id,
          sectionTitle: section.title,
          order,
          totalCompletions: existingStats?.totalCompletions ?? 0,
          currentStreak: existingStats?.currentStreak ?? 0,
          bestStreak: existingStats?.bestStreak ?? 0,
          starCount: existingStats?.starCount ?? 0,
          isHallOfFame: existingStats?.isHallOfFame ?? false,
          isCurrentItem: currentItemIds.has(item.id),
          lastSeenDateKey: dateKey,
        });
        seenItemIds.add(item.id);

        if (!checks[item.id]) {
          runningStreaks.set(item.id, 0);
          return;
        }

        const nextStreak = (runningStreaks.get(item.id) ?? 0) + 1;
        const nextStats = stats.get(item.id);

        if (!nextStats) {
          return;
        }

        const bestStreak = Math.max(nextStats.bestStreak, nextStreak);
        const starCount = getMasteryStarCount(bestStreak);

        runningStreaks.set(item.id, nextStreak);
        stats.set(item.id, {
          ...nextStats,
          totalCompletions: nextStats.totalCompletions + 1,
          currentStreak: nextStreak,
          bestStreak,
          starCount,
          isHallOfFame: starCount >= 5,
        });
      });
    });

    seenItemIds.forEach((itemId) => {
      if (!presentItemIds.has(itemId)) {
        runningStreaks.set(itemId, 0);
      }
    });
  }

  return Array.from(stats.values())
    .map((itemStats) => {
      const checkHistoryStats = currentItemIds.has(itemStats.itemId)
        ? calculateItemCheckHistoryStats(itemStats.itemId, todayKey, checkOverrides)
        : null;
      const bestStreak = Math.max(
        itemStats.bestStreak,
        checkHistoryStats?.bestStreak ?? 0,
      );
      const starCount = getMasteryStarCount(bestStreak);

      return {
        ...itemStats,
        totalCompletions: Math.max(
          itemStats.totalCompletions,
          checkHistoryStats?.totalCompletions ?? 0,
        ),
        currentStreak: Math.max(
          runningStreaks.get(itemStats.itemId) ?? 0,
          checkHistoryStats?.currentStreak ?? 0,
        ),
        bestStreak,
        starCount,
        isHallOfFame: starCount >= HALL_OF_FAME_STARS,
      };
    })
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
  const initialTimerStateRef = useRef<StoredTimerState | null>(null);
  const alertedFinishedTimerIdRef = useRef<string | null>(null);
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
  const [historySelectedDate, setHistorySelectedDate] = useState(() => today);
  const [calendarMonth, setCalendarMonth] = useState(() => getMonthStart(today));
  const selectedDateKey = getDateKey(selectedDate);
  const questDateLabel = questDateFormatter.format(selectedDate);
  const historySelectedDateKey = getDateKey(historySelectedDate);
  const historyDateLabel = questDateFormatter.format(historySelectedDate);
  const dailyMessage = getDailyMessage(selectedDateKey);
  const checksStorageKey = getChecksStorageKey(selectedDate);
  const memoStorageKey = getDailyMemoStorageKey(selectedDate);
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
  const [historyCheckedItems, setHistoryCheckedItems] = useState<Record<string, boolean>>(() =>
    loadCheckedItems(today),
  );
  const [backupMessage, setBackupMessage] = useState('');
  const [backupDownload, setBackupDownload] = useState<BackupDownload | null>(null);
  const [dailyMemo, setDailyMemo] = useState(() => loadDailyMemo(today));
  const [dailyMemoDateKey, setDailyMemoDateKey] = useState(() => todayKey);
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
  const selectedDateStats = calculateCompletionStats(displaySections, checkedItems);
  const selectedDateRank = getCompletionRank(selectedDateStats.rate);
  const historyDateTemplate = getBaseTemplateForDate(templateSettings, historySelectedDate);
  const historyRoutineKind: RoutineKind = dateOverrides[historySelectedDateKey]
    ? 'custom'
    : historyDateTemplate;
  const historyRoutineKindLabel = getRoutineKindLabel(historyRoutineKind);
  const historyDateTarget = resolveDateTarget(
    templateSettings,
    dateOverrides,
    dateSnapshots,
    historySelectedDate,
    todayKey,
  );
  const historyDateEditTarget: ResolvedEditTarget = {
    kind: 'date',
    dateKey: historySelectedDateKey,
    baseTemplate: historyDateTemplate,
  };
  const historySections = removeFixedRoutineItems(getSectionsForTarget(
    templateSettings,
    dateOverrides,
    dateSnapshots,
    historyDateTarget,
    todayKey,
  ));
  const historyDisplaySections = buildDisplaySections(
    historySections,
    rhythmSettings[historyDateTemplate],
  );
  const historyDateStats = calculateCompletionStats(
    historyDisplaySections,
    historyCheckedItems,
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
      [historySelectedDateKey]: historyCheckedItems,
    },
  ), [
    checkedItems,
    dateOverrides,
    dateSnapshots,
    historyCheckedItems,
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
  const archivedItemEntries = useMemo(() => (
    Object.values(archivedItems)
      .map((archivedItem) => ({
        archivedItem,
        stats: calculateItemCheckHistoryStats(
          archivedItem.item.id,
          todayKey,
          {
            [selectedDateKey]: checkedItems,
            [historySelectedDateKey]: historyCheckedItems,
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
    historySelectedDateKey,
    selectedDateKey,
    todayKey,
  ]);
  const calendarMonthLabel = monthFormatter.format(calendarMonth);
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

      return {
        date,
        dateKey,
        day: date.getDate(),
        rate: stats.rate,
        rankIcon: rank.icon,
        rankLevel: rank.level,
        totalCount: stats.totalCount,
        isToday: dateKey === todayKey,
        isSelected: dateKey === historySelectedDateKey,
        routineKind,
      };
    })
  ), [
    calendarMonth,
    dateOverrides,
    dateSnapshots,
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
    setDailyMemo(loadDailyMemo(selectedDate));
    setDailyMemoDateKey(selectedDateKey);
  }, [selectedDate, selectedDateKey]);

  useEffect(() => {
    setHistoryCheckedItems(loadCheckedItems(historySelectedDate));
  }, [historySelectedDate]);

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
    if (dailyMemoDateKey !== selectedDateKey) {
      return;
    }

    localStorage.setItem(memoStorageKey, dailyMemo);
  }, [dailyMemo, dailyMemoDateKey, memoStorageKey, selectedDateKey]);

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

      vibrate?.([180, 80, 180]);
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
    }, 4000);

    return () => window.clearInterval(alertId);
  }, [activeTimer?.isComplete, timerAlertSilenced]);

  useEffect(() => () => {
    if (backupDownloadUrlRef.current) {
      URL.revokeObjectURL(backupDownloadUrlRef.current);
    }
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
      return historyDateEditTarget;
    }

    if (page === 'today' && sectionId === bonusSectionId) {
      return selectedDateEditTarget;
    }

    return displayedTarget;
  };

  const toggleItem = (id: string) => {
    setCheckedItems((current) => {
      const nextChecks = {
        ...current,
        [id]: !current[id],
      };

      if (historySelectedDateKey === selectedDateKey) {
        setHistoryCheckedItems(nextChecks);
      }

      return nextChecks;
    });
  };

  const toggleHistoryItem = (id: string) => {
    setHistoryCheckedItems((current) => {
      const nextChecks = {
        ...current,
        [id]: !current[id],
      };

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
      const nextChecks = {
        ...current,
        [activeTimer.itemId]: true,
      };

      if (historySelectedDateKey === selectedDateKey) {
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

  const updateItemTimerMinutes = (
    sectionId: string,
    itemId: string,
    timerMinutes?: number,
  ) => {
    updateSectionsForTarget(getUpdateTargetForSection(sectionId), (currentSections) =>
      currentSections.map((section) => ({
        ...section,
        items: section.items.map((item) => {
          if (item.id !== itemId) {
            return item;
          }

          if (!timerMinutes) {
            const itemWithoutTimer = { ...item };

            delete itemWithoutTimer.timerMinutes;

            return itemWithoutTimer;
          }

          return {
            ...item,
            timerMinutes,
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

  const startItemTimer = (item: RoutineItem) => {
    if (!item.timerMinutes) {
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
    const totalSeconds = Math.round(item.timerMinutes * 60);

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

  const reorderRoutineItem = (
    sectionId: string,
    draggedId: string,
    targetId: string,
  ) => {
    if (draggedId === targetId) {
      return;
    }

    updateSectionsForTarget(getUpdateTargetForSection(sectionId), (currentSections) =>
      currentSections.map((section) => {
        if (section.id !== sectionId) {
          return section;
        }

        const orderedItems = [...section.items].sort(
          (first, second) => first.order - second.order,
        );
        const draggedIndex = orderedItems.findIndex((item) => item.id === draggedId);
        const targetIndex = orderedItems.findIndex((item) => item.id === targetId);

        if (draggedIndex === -1 || targetIndex === -1) {
          return section;
        }

        const nextItems = [...orderedItems];
        const [draggedItem] = nextItems.splice(draggedIndex, 1);

        nextItems.splice(targetIndex, 0, draggedItem);

        return {
          ...section,
          items: normalizeItemOrders(nextItems),
        };
      }),
    );
  };

  const toggleSortingSection = (sectionId: string) => {
    setSortingSectionId((currentSectionId) =>
      currentSectionId === sectionId ? null : sectionId,
    );
    setDraggedItemId(null);
    setEditingItemId(null);
    setEditingLabel('');
    setTimerSettingItemId(null);
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
          storage[key] = JSON.parse(savedValue) as unknown;
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
        window.localStorage.setItem(key, JSON.stringify(value));
      });

      window.location.reload();
    } catch {
      setBackupMessage('');
      window.alert('JSONファイルを読み取れなかったため、復元しませんでした。');
    } finally {
      event.target.value = '';
    }
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

  const changePage = (nextPage: PageName) => {
    resetEditUiState();
    setPage(nextPage);
  };

  return (
    <main className="app">
      <div className="app-content">
        <header className="app-header">
          <div className="top-bar">
            <p className="project-name">hibitin</p>
          </div>
          <h1>
            {page === 'today' && '日々のルーティンチェック帳'}
            {page === 'history' && 'スタンプ帳'}
            {page === 'achievements' && '実績'}
            {page === 'settings' && '設定'}
          </h1>
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
        <div className="routine-list">
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
              data-rank-level={selectedDateRank.level}
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
                    <span aria-hidden="true">{selectedDateRank.icon}</span>
                    {selectedDateRank.label}
                  </p>
                  <p className="result-rate">{selectedDateStats.rate}%</p>
                  <p className="result-count">
                    {selectedDateStats.completedCount} / {selectedDateStats.totalCount} 完了
                  </p>
                </>
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
                  <p className="timer-finished">🎉 時間です！</p>
                  <p className="timer-title">{activeTimer.label} お疲れさま！</p>
                  <p className="timer-alert-note">
                    このルーティンを完了にしますか？通知は閉じるまで残ります。
                  </p>
                  <div className="timer-actions">
                    <button onClick={() => setTimerAlertSilenced(true)} type="button">
                      通知を停止
                    </button>
                    {notificationPermission === 'default' && (
                      <button onClick={requestNotificationPermission} type="button">
                        通知を許可
                      </button>
                    )}
                    <button onClick={completeActiveTimerItem} type="button">
                      このルーティンを完了にする
                    </button>
                    <button
                      onClick={() => {
                        setTimerAlertSilenced(true);
                        alertedFinishedTimerIdRef.current = null;
                        setActiveTimer(null);
                      }}
                      type="button"
                    >
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
          {displaySections.map((section) => {
            const isBonusSection = section.id === bonusSectionId;
            const canEditSection =
              canEditRoutines || (page === 'today' && isBonusSection);

            return (
            <section
              className="routine-section"
              data-bonus={isBonusSection ? 'true' : 'false'}
              key={section.id}
            >
              <div className="section-header">
                <div>
                  <h2>
                    <span aria-hidden="true">{sectionIconLabels[section.id]}</span>
                    {section.title}
                  </h2>
                  {isBonusSection && (
                    <p className="section-note">追加でやったこと</p>
                  )}
                </div>
                {canEditRoutines && (
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
                {section.items.map((item) => {
                  const inputId = `routine-${item.id}`;
                  const isEditing = editingItemId === item.id;
                  const isFixedItem = fixedRoutineIds.has(item.id);
                  const canConfigureTimer =
                    page === 'settings' || (page === 'today' && isToday && isEditMode);
                  const itemMasteryStats = masteryStatsByItemId.get(item.id);
                  const pausedTimer = pausedTimers[item.id];
                  const activeItemTimer =
                    activeTimer?.itemId === item.id ? activeTimer : null;
                  const showTimerStart =
                    page === 'today' &&
                    isToday &&
                    !isEditMode &&
                    Boolean(item.timerMinutes);

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
                          reorderRoutineItem(section.id, draggedId, item.id);
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
                              reorderRoutineItem(section.id, item.id, targetItemId);
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
                        itemMasteryStats.starCount > 0 && (
                        <span
                          className="mastery-badge"
                          title={`現在 ${itemMasteryStats.currentStreak}日連続 / 累計 ${itemMasteryStats.totalCompletions}回`}
                        >
                          {formatMasteryStars(itemMasteryStats.starCount)}
                        </span>
                      )}
                      {showTimerStart && (
                        <div className="timer-start-control">
                          <span>
                            {activeItemTimer && !activeItemTimer.isComplete
                              ? `⏱残り ${formatTimerSeconds(activeItemTimer.remainingSeconds)}`
                              : pausedTimer
                              ? `⏱残り ${formatTimerSeconds(pausedTimer.remainingSeconds)}`
                              : `⏱${formatTimerMinutes(item.timerMinutes ?? 0)}`}
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
                            onClick={() =>
                              setTimerSettingItemId((currentId) =>
                                currentId === item.id ? null : item.id,
                              )
                            }
                            type="button"
                          >
                            ⏱
                          </button>
                          {timerSettingItemId === item.id && (
                            <div className="timer-setting-menu">
                              <select
                                aria-label={`${item.label}のタイマー時間`}
                                onChange={(event) => {
                                  const nextValue = event.target.value;

                                  if (nextValue === 'none') {
                                    updateItemTimerMinutes(section.id, item.id);
                                    return;
                                  }

                                  if (nextValue === 'custom') {
                                    updateItemTimerMinutes(
                                      section.id,
                                      item.id,
                                      item.timerMinutes && !timerPresetMinutes.includes(item.timerMinutes)
                                        ? item.timerMinutes
                                        : 1,
                                    );
                                    return;
                                  }

                                  updateItemTimerMinutes(
                                    section.id,
                                    item.id,
                                    Number(nextValue),
                                  );
                                }}
                                value={getTimerSelectValue(item.timerMinutes)}
                              >
                                <option value="none">タイマーなし</option>
                                {timerPresetMinutes.map((minutes) => (
                                  <option key={minutes} value={minutes}>
                                    {minutes}分
                                  </option>
                                ))}
                                <option value="custom">自由入力</option>
                              </select>
                              {getTimerSelectValue(item.timerMinutes) === 'custom' && (
                                <input
                                  aria-label={`${item.label}のタイマー自由入力`}
                                  min="0.01"
                                  onChange={(event) => {
                                    const nextMinutes = Number(event.target.value);

                                    updateItemTimerMinutes(
                                      section.id,
                                      item.id,
                                      Number.isFinite(nextMinutes) && nextMinutes > 0
                                        ? nextMinutes
                                        : undefined,
                                    );
                                  }}
                                  step="0.01"
                                  type="number"
                                  value={item.timerMinutes ?? ''}
                                />
                              )}
                            </div>
                          )}
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
                    </div>
                  );
                })}
              </div>
              {canEditSection && (
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
          <section className="daily-memo" aria-label={isToday ? '今日のメモ' : '昨日のメモ'}>
            <label htmlFor="daily-memo">
              📝 {isToday ? '今日のメモ' : '昨日のメモ'}
            </label>
            <textarea
              id="daily-memo"
              onChange={(event) => {
                setDailyMemoDateKey(selectedDateKey);
                setDailyMemo(event.target.value);
              }}
              placeholder="ひとことメモを書く"
              rows={3}
              value={dailyMemo}
            />
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
                      setHistorySelectedDate(day.date);
                      setIsHistoryEditMode(false);
                      setSortingSectionId(null);
                      setDraggedItemId(null);
                      setEditingItemId(null);
                      setEditingLabel('');
                    }}
                    type="button"
                  >
                    <span className="calendar-day-number">{day.day}</span>
                    {day.routineKind === 'custom' && (
                      <span className="calendar-day-kind" aria-label="個別カスタム">
                        ✨
                      </span>
                    )}
                    <span className="calendar-day-rate">
                      {day.rate === null ? '' : `${day.rate}%`}
                    </span>
                    <span className="calendar-day-rank" aria-hidden="true">
                      {day.rankIcon}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="history-detail">
              <div className="history-detail-heading">
                <div>
                  <p className="history-date-label">📅 {historyDateLabel}</p>
                  <p className="history-routine-kind" data-routine-kind={historyRoutineKind}>
                    {historyRoutineKindLabel}
                  </p>
                </div>
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
                      {section.items.map((item) => {
                        const isEditing = editingItemId === item.id;
                        const isFixedItem = fixedRoutineIds.has(item.id);

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
                              reorderRoutineItem(section.id, draggedId, item.id);
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
                          {item.timerMinutes && !isHistoryEditMode && (
                            <span className="timer-badge">
                              ⏱{formatTimerMinutes(item.timerMinutes)}
                            </span>
                          )}
                          {isHistoryEditMode && (
                            <div className="timer-setting-control">
                              <button
                                aria-label={`${item.label}のタイマーを設定`}
                                className="timer-settings-toggle"
                                onClick={() =>
                                  setTimerSettingItemId((currentId) =>
                                    currentId === item.id ? null : item.id,
                                  )
                                }
                                type="button"
                              >
                                ⏱
                              </button>
                              {timerSettingItemId === item.id && (
                                <div className="timer-setting-menu">
                                  <select
                                    aria-label={`${item.label}のタイマー時間`}
                                    onChange={(event) => {
                                      const nextValue = event.target.value;

                                      if (nextValue === 'none') {
                                        updateItemTimerMinutes(section.id, item.id);
                                        return;
                                      }

                                      if (nextValue === 'custom') {
                                        updateItemTimerMinutes(
                                          section.id,
                                          item.id,
                                          item.timerMinutes &&
                                            !timerPresetMinutes.includes(item.timerMinutes)
                                            ? item.timerMinutes
                                            : 1,
                                        );
                                        return;
                                      }

                                      updateItemTimerMinutes(
                                        section.id,
                                        item.id,
                                        Number(nextValue),
                                      );
                                    }}
                                    value={getTimerSelectValue(item.timerMinutes)}
                                  >
                                    <option value="none">タイマーなし</option>
                                    {timerPresetMinutes.map((minutes) => (
                                      <option key={minutes} value={minutes}>
                                        {minutes}分
                                      </option>
                                    ))}
                                    <option value="custom">自由入力</option>
                                  </select>
                                  {getTimerSelectValue(item.timerMinutes) === 'custom' && (
                                    <input
                                      aria-label={`${item.label}のタイマー自由入力`}
                                      min="0.01"
                                      onChange={(event) => {
                                        const nextMinutes = Number(event.target.value);

                                        updateItemTimerMinutes(
                                          section.id,
                                          item.id,
                                          Number.isFinite(nextMinutes) && nextMinutes > 0
                                            ? nextMinutes
                                            : undefined,
                                        );
                                      }}
                                      step="0.01"
                                      type="number"
                                      value={item.timerMinutes ?? ''}
                                    />
                                  )}
                                </div>
                              )}
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
                        </div>
                        );
                      })}
                    </div>
                    {isHistoryEditMode && (
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
          </section>
        )}

        {page === 'achievements' && (
          <section className="achievements-panel">
            <div className="achievements-header">
              <span aria-hidden="true">🏆</span>
              <div>
                <h2>実績</h2>
                <p>星はチェックを積み重ねることで育ちます。</p>
              </div>
            </div>
            <section className="mastery-rule" aria-label="熟練度ルール">
              <h3>熟練度ルール</h3>
              <ul>
                {getMasteryRuleText().map((ruleText) => (
                  <li key={ruleText}>{ruleText}</li>
                ))}
              </ul>
              <p>{formatMasteryStars(HALL_OF_FAME_STARS)}で殿堂入り</p>
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
                        <span className="hall-of-fame-badge">👑 殿堂入り</span>
                      )}
                    </div>
                    <p
                      className="mastery-stars"
                      data-empty={itemStats.starCount === 0 ? 'true' : 'false'}
                    >
                      {formatMasteryStars(itemStats.starCount) || '星はこれから'}
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
                        data-empty={stats.starCount === 0 ? 'true' : 'false'}
                      >
                        {formatMasteryStars(stats.starCount) || '星はこれから'}
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
            </div>
          </details>
        )}

      </div>

      <nav className="bottom-tab-nav" aria-label="メインナビゲーション">
        {([
          ['today', '🎮', '今日'],
          ['history', '📅', 'スタンプ帳'],
          ['achievements', '🏆', '実績'],
          ['settings', '⚙️', '設定'],
        ] as [PageName, string, string][]).map(([tabPage, icon, label]) => (
          <button
            aria-current={page === tabPage ? 'page' : undefined}
            data-active={page === tabPage ? 'true' : 'false'}
            key={tabPage}
            onClick={() => changePage(tabPage)}
            type="button"
          >
            <span aria-hidden="true">{icon}</span>
            {label}
          </button>
        ))}
      </nav>

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

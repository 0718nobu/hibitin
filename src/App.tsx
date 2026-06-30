import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type RoutineSource = 'default' | 'user' | 'ai';
type TemplateKind = 'normal' | 'holiday';
type PageName = 'today' | 'history' | 'achievements' | 'settings';
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
};

type ResolvedEditTarget =
  | { kind: 'template'; template: TemplateKind }
  | { kind: 'date'; dateKey: string; baseTemplate: TemplateKind };

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

const BACKUP_VERSION = 1;
const LEGACY_ROUTINES_STORAGE_KEY = 'hibitin-routines:v1';
const TEMPLATES_STORAGE_KEY = 'hibitin:templates:v1';
const DATE_SNAPSHOTS_STORAGE_KEY = 'hibitin:dateSnapshots:v1';
const DATE_OVERRIDES_STORAGE_KEY = 'hibitin:dateOverrides:v1';
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

const dailySectionIds: StartSection[] = ['morning', 'noon', 'evening', 'night'];

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
  const routineItems = sections.flatMap((section) => section.items);
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

  if (rate >= 90) {
    return { icon: '⭐', label: 'EXCELLENT!!', level: 'excellent' };
  }

  if (rate >= 80) {
    return { icon: '🎉', label: 'GREAT!!', level: 'great' };
  }

  if (rate >= 60) {
    return { icon: '👍', label: 'GOOD!', level: 'good' };
  }

  if (rate >= 30) {
    return { icon: '🌱', label: 'KEEP GOING!', level: 'keep' };
  }

  if (rate >= 1) {
    return { icon: '🚀', label: 'START!', level: 'start' };
  }

  return { icon: '☕', label: 'READY?', level: 'ready' };
};

function App() {
  const today = useMemo(() => new Date(), []);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const backupDownloadUrlRef = useRef<string | null>(null);
  const todayKey = getDateKey(today);
  const [page, setPage] = useState<PageName>('today');
  const [selectedDate] = useState(() => today);
  const [historySelectedDate, setHistorySelectedDate] = useState(() => today);
  const [calendarMonth, setCalendarMonth] = useState(() => getMonthStart(today));
  const selectedDateKey = getDateKey(selectedDate);
  const questDateLabel = questDateFormatter.format(selectedDate);
  const historySelectedDateKey = getDateKey(historySelectedDate);
  const historyDateLabel = questDateFormatter.format(historySelectedDate);
  const dailyMessage = getDailyMessage(selectedDateKey);
  const checksStorageKey = getChecksStorageKey(selectedDate);
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
  const [rhythmSettings, setRhythmSettings] = useState<RhythmSettings>(() =>
    loadRhythmSettings(),
  );
  const [editTargetKey, setEditTargetKey] = useState<EditTargetKey>('normal');
  const [draftSectionId, setDraftSectionId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [editModeStartSections, setEditModeStartSections] =
    useState<RoutineSection[] | null>(null);
  const [lastCopiedSections, setLastCopiedSections] =
    useState<RoutineSection[] | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
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
  const isCheckMode = page === 'today';
  const canEditRoutines = page === 'settings' || (page === 'today' && isEditMode);
  const selectedDateStats = calculateCompletionStats(displaySections, checkedItems);
  const selectedDateRank = getCompletionRank(selectedDateStats.rate);
  const historyDateTemplate = getBaseTemplateForDate(templateSettings, historySelectedDate);
  const historyDateTarget = resolveDateTarget(
    templateSettings,
    dateOverrides,
    dateSnapshots,
    historySelectedDate,
    todayKey,
  );
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
  const calendarMonthLabel = monthFormatter.format(calendarMonth);
  const completionCalendarDays = useMemo(() => (
    getMonthDateCells(calendarMonth).map((date) => {
      if (!date) {
        return null;
      }

      const dateKey = getDateKey(date);
      const baseTemplate = getBaseTemplateForDate(templateSettings, date);
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

      setDateOverrides((currentOverrides) => ({
        ...currentOverrides,
        [target.dateKey]: removeFixedRoutineItems(updater(currentSections)),
      }));

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

  const openAddForm = (sectionId: string) => {
    setDraftSectionId(sectionId);
    setDraftLabel('');
  };

  const startEditingItem = (item: RoutineItem) => {
    setEditingItemId(item.id);
    setEditingLabel(item.label);
  };

  const finishEditingItem = (item: RoutineItem) => {
    if (editingItemId !== item.id) {
      return;
    }

    const nextLabel = editingLabel.trim();

    if (nextLabel && nextLabel !== item.label) {
      updateSectionsForTarget(displayedTarget, (currentSections) =>
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

    updateSectionsForTarget(displayedTarget, (currentSections) =>
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
    setDraftSectionId(null);
    setSortingSectionId(null);
    setDraggedItemId(null);
    setEditingItemId(null);
    setEditingLabel('');
  };

  const addRoutine = (event: FormEvent<HTMLFormElement>, sectionId: string) => {
    event.preventDefault();

    const trimmedLabel = draftLabel.trim();

    if (!trimmedLabel) {
      return;
    }

    updateSectionsForTarget(displayedTarget, (currentSections) =>
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
              id: createRoutineId(section.id),
              label: trimmedLabel,
              order: nextOrder,
              source: 'user',
              createdAt: new Date().toISOString(),
            },
          ],
        };
      }),
    );
    setDraftLabel('');
    setDraftSectionId(null);
  };

  const deleteRoutine = () => {
    if (!pendingDelete) {
      return;
    }

    updateSectionsForTarget(displayedTarget, (currentSections) =>
      currentSections.map((section) => ({
        ...section,
        items: section.items.filter((item) => item.id !== pendingDelete.id),
      })),
    );
    setCheckedItems((currentChecks) => {
      const remainingChecks = { ...currentChecks };

      delete remainingChecks[pendingDelete.id];

      return remainingChecks;
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
    setEditModeStartSections(null);
    setLastCopiedSections(null);
    setDraftSectionId(null);
    setSortingSectionId(null);
    setDraggedItemId(null);
    setEditingItemId(null);
    setEditingLabel('');
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
                <h2>今日のクエスト</h2>
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
          {displaySections.map((section) => (
            <section className="routine-section" key={section.id}>
              <div className="section-header">
                <h2>
                  <span aria-hidden="true">{sectionIconLabels[section.id]}</span>
                  {section.title}
                </h2>
                {canEditRoutines && (
                  <div className="section-actions">
                    <button
                      className="sort-button"
                      onClick={() => toggleSortingSection(section.id)}
                      type="button"
                    >
                      {sortingSectionId === section.id ? '完了' : '並び替え'}
                    </button>
                    <button
                      className="add-button"
                      onClick={() => openAddForm(section.id)}
                      type="button"
                    >
                      ＋追加
                    </button>
                  </div>
                )}
              </div>
              {canEditRoutines && draftSectionId === section.id && (
                <form className="add-form" onSubmit={(event) => addRoutine(event, section.id)}>
                  <input
                    autoFocus
                    onChange={(event) => setDraftLabel(event.target.value)}
                    placeholder="ルーティン名"
                    type="text"
                    value={draftLabel}
                  />
                  <div className="add-form-actions">
                    <button type="submit">追加</button>
                    <button
                      onClick={() => setDraftSectionId(null)}
                      type="button"
                    >
                      キャンセル
                    </button>
                  </div>
                </form>
              )}
              <div className="routine-items">
                {section.items.map((item) => {
                  const inputId = `routine-${item.id}`;
                  const isEditing = editingItemId === item.id;
                  const isFixedItem = fixedRoutineIds.has(item.id);

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
                        {isEditing && !isFixedItem && canEditRoutines ? (
                          <input
                            autoFocus
                            onBlur={() => finishEditingItem(item)}
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
                            disabled={isFixedItem || !canEditRoutines}
                            onClick={() => {
                              if (!isFixedItem && canEditRoutines) {
                                startEditingItem(item);
                              }
                            }}
                            type="button"
                          >
                            {item.label}
                          </button>
                        )}
                      </div>
                      {!isFixedItem && canEditRoutines && (
                        <button
                          aria-label={`${item.label}を削除`}
                          className="delete-button"
                          onClick={() => setPendingDelete({ id: item.id, label: item.label })}
                          type="button"
                        >
                          削除
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
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
                    data-selected={day.isSelected ? 'true' : 'false'}
                    data-today={day.isToday ? 'true' : 'false'}
                    key={day.dateKey}
                    onClick={() => setHistorySelectedDate(day.date)}
                    type="button"
                  >
                    <span className="calendar-day-number">{day.day}</span>
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
              <p className="history-date-label">📅 {historyDateLabel}</p>
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
                {historyDisplaySections.map((section) => (
                  <section className="history-routine-section" key={section.id}>
                    <h3>
                      <span aria-hidden="true">{sectionIconLabels[section.id]}</span>
                      {section.title}
                    </h3>
                    <div className="history-routine-items">
                      {section.items.map((item) => (
                        <div
                          className="history-routine-item"
                          data-checked={historyCheckedItems[item.id] ? 'true' : 'false'}
                          key={item.id}
                        >
                          <input
                            aria-label={`${item.label}のチェック状態`}
                            checked={Boolean(historyCheckedItems[item.id])}
                            onChange={() => toggleHistoryItem(item.id)}
                            type="checkbox"
                          />
                          <span className="history-routine-name">
                            <span>{item.label}</span>
                            {item.time && (
                              <span className="fixed-time-display">{item.time}</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </section>
        )}

        {page === 'achievements' && (
          <section className="placeholder-panel">
            <span aria-hidden="true">🏆</span>
            <h2>実績は準備中</h2>
            <p>連続達成日数やバッジを、ここに追加していく予定です。</p>
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
            <h2 id="delete-dialog-title">削除しますか？</h2>
            <p>「{pendingDelete.label}」を削除します。</p>
            <div className="dialog-actions">
              <button onClick={deleteRoutine} type="button">
                削除
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

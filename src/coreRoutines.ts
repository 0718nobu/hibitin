export type CoreRoutineId = 'daily-memo' | 'daily-events';

export type CoreRoutineKind = 'memo' | 'events';

export type CoreRoutineDefinition = {
  id: CoreRoutineId;
  label: string;
  description: string;
  kind: CoreRoutineKind;
  icon: string;
};

export type CoreRoutinePlacement = {
  sectionId: 'morning' | 'noon' | 'evening' | 'night';
  order: number;
};

export type CoreRoutinePlacements = Record<CoreRoutineId, CoreRoutinePlacement>;

export const coreRoutineDefinitions: CoreRoutineDefinition[] = [
  {
    id: 'daily-memo',
    label: '今日のひとことを残す',
    description: '思ったことや今の気持ち',
    kind: 'memo',
    icon: '✍️',
  },
  {
    id: 'daily-events',
    label: '今日のできごとを残す',
    description: '今日あったこと',
    kind: 'events',
    icon: '📖',
  },
];

export const defaultCoreRoutinePlacements: CoreRoutinePlacements = {
  'daily-memo': {
    sectionId: 'noon',
    order: 9000,
  },
  'daily-events': {
    sectionId: 'night',
    order: 9000,
  },
};

type DailyRecordLikeEntry = {
  text: string;
  saved?: boolean;
};

export const hasMeaningfulText = (
  value: string | Array<string | DailyRecordLikeEntry>,
) =>
  Array.isArray(value)
    ? value.some((entry) =>
        typeof entry === 'string'
          ? entry.trim().length > 0
          : Boolean(entry.saved) && entry.text.trim().length > 0,
      )
    : value.trim().length > 0;

export const getCoreRoutineCompletion = (
  memo: string | Array<string | DailyRecordLikeEntry>,
  events: string | Array<string | DailyRecordLikeEntry>,
): Record<CoreRoutineId, boolean> => ({
  'daily-memo': hasMeaningfulText(memo),
  'daily-events': hasMeaningfulText(events),
});

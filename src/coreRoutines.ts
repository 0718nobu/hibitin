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
    label: '今日を一言で残す',
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
    sectionId: 'morning',
    order: 9000,
  },
  'daily-events': {
    sectionId: 'night',
    order: 9000,
  },
};

export const hasMeaningfulText = (value: string) => value.trim().length > 0;

export const getCoreRoutineCompletion = (
  memo: string,
  events: string,
): Record<CoreRoutineId, boolean> => ({
  'daily-memo': hasMeaningfulText(memo),
  'daily-events': hasMeaningfulText(events),
});

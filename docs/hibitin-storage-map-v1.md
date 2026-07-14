# hibitin storage map v1

作成日: 2026-07-11  
根拠: `src/App.tsx` の storage constants / `localStorage` 呼び出し / バックアップ処理

## 判定ルール

バックアップ・初期化対象は `isHibitinStorageKey()` により以下です。

- `hibitin:` で始まるキー
- `hibitin-` で始まるキー

## localStorageキー一覧

| キー名 | 用途 | データ構造 | 読み込み場所 | 書き込み場所 | バックアップ対象 | 状態 |
|---|---|---|---|---|---|---|
| `hibitin:templates:v1` | ノーマル/休日テンプレート、曜日割り当て | `RoutineTemplateSettings` | `loadTemplateSettings()` | `useEffect([templateSettings])` | 対象 | 現役 |
| `hibitin:dateSnapshots:v1` | 日付別表示時点スナップショット | `Record<dateKey, RoutineSection[]>` | `loadDateSectionMap()` | `useEffect([dateSnapshots])` | 対象 | 現役 |
| `hibitin:dateOverrides:v1` | 日付別個別ルーティン | `Record<dateKey, RoutineSection[]>` | `loadDateSectionMap()` | `useEffect([dateOverrides])` | 対象 | 現役 |
| `hibitin:archivedItems:v1` | 削除済みアイテム | `Record<itemId, ArchivedItem>` | `loadArchivedItems()` | `useEffect([archivedItems])` | 対象 | 現役 |
| `hibitin:timerState:v1` | 実行中/一時停止タイマー | `StoredTimerState` | `loadStoredTimerState()` | `useEffect([activeTimer, pausedTimers])` | 対象 | 現役 |
| `hibitin:itemNotes:v1` | 日付別・アイテム別メモ | `{ [dateKey]: { [itemId]: string } }` | `loadItemNotes()` | `useEffect([itemNotes])` | 対象 | 現役 |
| `hibitin:coreRoutinePlacements:v1` | コアルーティンの時間帯・表示順 | `CoreRoutinePlacements` | `loadCoreRoutinePlacements()` | `useEffect([coreRoutinePlacements])` | 対象 | 現役 |
| `hibitin:dailyNudgeCandidates:v1` | 日替わりクエスト候補一覧（内部名 dailyNudge） | `DailyNudgeCandidate[]` | `loadDailyNudgeCandidates()` | `useEffect([dailyNudgeCandidates])` | 対象 | 現役 |
| `hibitin:dailyNudgeRecords:v1` | 日付別の日替わりクエスト割り当て/完了状態（内部名 dailyNudge） | `{ [dateKey]: DailyNudgeRecord }` | `loadDailyNudgeRecords()` | `useEffect([dailyNudgeRecords])`, `toggleDailyNudgeCompletion()` | 対象 | 現役 |
| `hibitin:rhythmSettings:v1` | ノーマル/休日の起床・就寝時刻、開始セクション | `RhythmSettings` | `loadRhythmSettings()` | `useEffect([rhythmSettings])` | 対象 | 現役 |
| `hibitin:gameMode:v1` | プレイヤー/開発者モード | JSON文字列または旧プレーン文字列対応 | `loadGameMode()` | `useEffect([gameMode])` | 対象 | 現役 |
| `hibitin:gameBalance:v1` | PT、ランク、フリークエスト枠交換設定 | `GameBalanceSettings` schemaVersion 3 | `loadGameBalanceSettings()` | `useEffect([gameBalance])` | 対象 | 現役 |
| `hibitin:playerEconomy:v1` | PT、累計スター、ランク、台帳、付与記録 | `PlayerEconomy` | `loadPlayerEconomy()` | `useEffect([playerEconomy])` | 対象 | 現役 |
| `hibitin:playerProfile:v1` | プレイヤー名 | `PlayerProfile` | `loadPlayerProfile()` | `useEffect([playerProfile])` | 対象 | 現役 |
| `hibitin:playerUnlocks:v2` | 合計フリークエスト枠 | `PlayerUnlocks { totalQuestSlots }` | `loadPlayerUnlocks()` | `useEffect([playerUnlocks])` | 対象 | 現役 |
| `hibitin:checks:YYYY-MM-DD` | 日付別チェック | `Record<itemId, boolean>` | `loadCheckedItems()` / `getStoredCheckDateKeys()` | `useEffect([checkedItems])`, `toggleHistoryItem()` | 対象 | 現役・動的 |
| `hibitin:events:YYYY-MM-DD` | 日付別のできごと記録 | string | `loadDailyEvent()` | `useEffect([dailyEvent])`, `useEffect([historyDailyEvent])` | 対象 | 現役・動的 |
| `hibitin:memo:YYYY-MM-DD` | 日付別ひとこと（旧: 全体メモ） | string | `loadDailyMemo()` | `useEffect([dailyMemo])`, `useEffect([historyDailyMemo])` | 対象 | 現役・動的 |
| `hibitin-routines:v1` | 旧ルーティン保存 | `RoutineSection[]` | `loadLegacyRoutineSections()` | なし | 対象 | 旧仕様・読み込みのみ |
| `hibitin:lifestyleSettings:v1` | 旧生活リズム設定 | 旧 `RhythmConfig` 相当 | `loadRhythmSettings()` | なし | 対象 | 旧仕様・読み込みのみ |
| `hibitin:playerUnlocks:v1` | 旧時間帯別フリークエスト枠 | `{ questSlots: { morning,noon,evening,night } }` | `loadPlayerUnlocks()` | 起動後削除 | 対象だが通常は削除 | 旧仕様・移行のみ |
| `hibitin:sectionStars:v1` | 旧時間帯スター | 不明 | なし | 起動時削除 | 削除前なら対象 | 旧仕様・破棄 |

## バックアップJSON

```json
{
  "backupVersion": 1,
  "exportedAt": "ISO日時",
  "appName": "hibitin",
  "data": {
    "storage": {
      "hibitin:templates:v1": {},
      "hibitin:dateSnapshots:v1": {},
      "hibitin:dateOverrides:v1": {},
      "hibitin:rhythmSettings:v1": {},
      "hibitin:dailyNudgeCandidates:v1": [],
      "hibitin:dailyNudgeRecords:v1": {}
    }
  }
}
```

実際には `isHibitinStorageKey()` に一致する全キーが `data.storage` に入ります。

## 復元検証の必須キー

`isBackupFile()` は以下4キーが存在し、nullではなく、配列ではないobjectであることを要求します。

- `hibitin:templates:v1`
- `hibitin:dateSnapshots:v1`
- `hibitin:dateOverrides:v1`
- `hibitin:rhythmSettings:v1`

## 旧仕様データの扱い

- `hibitin-routines:v1`: templates未保存時だけnormal/holidayへ移行。
- `hibitin:lifestyleSettings:v1`: rhythmSettings未保存時だけnormal/holidayへ移行。
- `hibitin:playerUnlocks:v1`: v2未保存時に読み込み、購入済み分を `totalQuestSlots` に換算。その後v1は削除。
- `hibitin:sectionStars:v1`: 起動時に削除。UI/計算では参照しない。

## データ増加リスク

- `hibitin:checks:*`
- `hibitin:events:*`
- `hibitin:memo:*`
- `hibitin:dateSnapshots:v1`
- `hibitin:playerEconomy:v1.pointLedger`

上記は長期利用で増え続けます。Phase 2で容量監視や圧縮、古い履歴の扱いを検討してください。

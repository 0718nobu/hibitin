# hibitin Phase 2 risks v1

作成日: 2026-07-11  
対象: Phase 2開発開始前の技術的リスクと推奨順序

## 最優先リスク

### 1. `src/App.tsx` の肥大化

`src/App.tsx` は5684行あり、型定義、ストレージ、移行、画面、ゲーム経済、タイマー、熟練度、ショップが同居しています。Phase 2で機能追加を続けると、意図しない副作用が起きやすい状態です。

推奨:

- `storage`
- `routine`
- `timer`
- `economy`
- `mastery`
- `shop`
- `components`

へ段階的に分割する。

### 2. チェック処理の副作用が大きい

チェック操作は以下に連動します。

- localStorage保存
- 達成率
- スタンプ帳
- PT付与/取消
- pointLedger
- pointAwards
- 熟練度再計算
- プレイヤーランク

推奨:

- `toggleItem()` と `toggleHistoryItem()` の周辺を先にテストする。
- 「チェックON/OFFでPTが二重増加しない」ことを自動テスト化する。

### 3. PT台帳の不変条件が暗黙的

現行コードでは `pointAwards` が二重獲得防止の中心です。`pointLedger` は履歴、`currentPoints` は現在値、`lifetimeEarnedPoints` と `lifetimeSpentPoints` は累計です。

守るべき条件:

- 同じ `dateKey:itemId` のactive付与は1つだけ
- 取消は初回付与額と同額
- 再チェック時は初回付与額を再利用
- 再チェックで `lifetimeEarnedPoints` を再加算しない
- 支出でPTがマイナスにならない

推奨:

- Economy専用の純粋関数化。
- 台帳から現在PTを再計算する検証関数を追加。

### 4. 日付復元ロジックが複雑

日付ルーティンは以下の優先順位を持ちます。

1. `dateOverrides`
2. 過去日の `dateSnapshots`
3. テンプレート

さらに固定アイテムはテンプレートに保存されず `buildDisplaySections()` で注入されます。Phase 2でDB移行や日付編集を触る場合、ここが壊れやすいです。

推奨:

- `resolveDateTarget()`
- `getSectionsForTarget()`
- `buildDisplaySections()`
- `removeFixedRoutineItems()`

を1モジュールに集め、仕様テストを追加する。

### 5. 熟練度計算の性能

`calculateMasteryStats()` は保存済みチェック日付から今日まで日単位で走査します。長期利用で重くなる可能性があります。

推奨:

- まず現状維持。
- Phase 2後半でキャッシュ方式を検討。
- キャッシュする場合はバックアップ/復元と整合を取る。

## 中優先リスク

### 6. バックアップ復元の互換性

`isBackupFile()` は必須4キーがobjectで存在することを要求します。旧バックアップや破損データに対しては安全ですが、互換性は狭めです。

推奨:

- backupVersion 2を設計するときに、移行関数を用意する。
- 復元前プレビューを将来追加する。

### 7. localStorage容量

増え続けるデータ:

- `checks:*`
- `memo:*`
- `dateSnapshots`
- `pointLedger`
- `itemNotes`
- `dailyNudgeRecords`

推奨:

- データ管理画面に保存サイズ表示を追加する。
- エクスポート前のサイズ確認を追加する。

### 7.1 日替わりクエストの履歴保護

`hibitin:dailyNudgeRecords:v1` は日付ごとに提案文そのものを保存します。これは、管理画面で候補を編集・削除しても過去日の内容を変えないためです。画面上の名称は「本日の日替わりクエスト」ですが、既存互換のため内部名と保存キーは `dailyNudge` のままです。

推奨:

- 候補削除時に `dailyNudgeRecords` を削除しない。
- 将来DB化する場合も、候補マスタと日付別表示記録を分離する。
- 容量対策を入れる場合、削除ではなくアーカイブ/エクスポート方針を先に決める。

### 7.2 今日のひとことの例文は保存していない

「今日のひとこと」の回答は既存の `hibitin:memo:YYYY-MM-DD` に保存しますが、日替わりの例文そのものは保存していません。現状は `dailyOneLineExamples` と日付キーの安定ハッシュで決めています。

推奨:

- 候補の並び順や文言を大きく変更すると、過去日の例文表示が変わる可能性を認識しておく。
- 将来「過去の例文も完全固定」したくなった場合は、日付別に exampleId または例文を保存するキーを追加する。

### 7.3 今日のできごとの例文は保存していない

「今日のできごと」の入力内容は `hibitin:events:YYYY-MM-DD` に保存しますが、日替わりの例文そのものは保存していません。現状は `dailyEventExamples` と日付キーの安定ハッシュで決めています。

推奨:

- 候補の並び順や文言を大きく変更すると、過去日の例文表示が変わる可能性を認識しておく。
- 将来「過去のできごと例文も完全固定」したくなった場合は、日付別に exampleId または例文を保存するキーを追加する。

### 7.4 日付別記録キーは文字列保存

`hibitin:memo:YYYY-MM-DD` と `hibitin:events:YYYY-MM-DD` は、他のJSON系キーと違ってlocalStorageへ文字列をそのまま保存します。バックアップ/復元ではこの2系統を文字列キーとして扱います。

推奨:

- 将来オブジェクト形式へ拡張する場合は、旧文字列からの移行関数を用意する。
- バックアップ復元時に文字列キーを `JSON.stringify()` しないよう維持する。

### 8. 通知の限界

現状の通知はPWA単体・画面復帰型です。Push API/Web Pushは未実装です。

推奨:

- 当面はendsAt方式を維持。
- 「バックグラウンド通知は保証しない」と仕様に明記。
- 必要になったらWeb Pushまたはネイティブ化を別設計で検討。

## 低優先リスク

### 9. CSSの肥大化

`src/styles.css` は3333行です。画面ごとに分割されていません。

推奨:

- コンポーネント分割後にCSSも画面単位へ分ける。
- 先にクラス命名を整理する。

### 10. 旧仕様の残骸

現行コードで残る旧仕様:

- `hibitin-routines:v1` 読み込み
- `hibitin:lifestyleSettings:v1` 読み込み
- `hibitin:playerUnlocks:v1` 移行
- `hibitin:sectionStars:v1` 削除
- `normalizeQuestSlotExchange()` の旧時間帯別設定読み取り

推奨:

- Phase 2ではすぐ消さず、互換確認後に削除する。
- 削除する場合はバックアップ復元との関係を先に決める。

## Phase 2推奨順序

1. 現行仕様レポートをチーム/次チャットで確認する。
2. `App.tsx` 分割方針を決める。
3. storageキーとnormalize関数を `storage` 層へ移す。
4. チェック/PT/ショップのテストを追加する。
5. UIコンポーネントをタブ単位で分離する。
6. ショップ拡張は、PT経済のテストが整ってから行う。
7. 月間集計や称号などの新機能は、保存構造の安定後に実装する。

## Phase 2で最初に触るなら

最初の実装候補は「テストと分割」です。新機能ではなく、以下の土台作りが安全です。

- `getCompletionRank()`
- `calculateCompletionStats()`
- `applyPointChangeForItemCheck()` 相当の経済ロジック
- `getEffectiveQuestSlotLimit()`
- `countNormalQuestItems()`

これらを純粋関数として切り出せると、ショップ・PT・スタンプ帳の改修がかなり安全になります。

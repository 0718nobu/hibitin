# hibitin 現行アプリ仕様レポート v1

作成日: 2026-07-11  
調査対象: 現在のソースコード一式  
主な参照ファイル: `src/App.tsx`, `src/styles.css`, `src/main.tsx`, `vite.config.ts`, `package.json`, `index.html`, `public/pwa-icon.svg`

この文書は、過去の会話ではなく現行コードから確認できた事実をまとめたPhase 2引き継ぎ資料です。推測が必要な箇所は「要確認」と明記します。

## 1. アプリ概要

- アプリ名: `日々のルーティンチェック帳`
- ブラウザタイトル: `日々ティン`
- 技術名 / package name: `hibitin`
- 使用技術: React 19, TypeScript 6, Vite 8, vite-plugin-pwa 1.3
- 起動方法: `npm run dev`
- ビルド方法: `npm run build`
- Node条件: `package.json` の `engines.node` は `>=24`
- 2026-07-11時点のビルド結果: `npm run build` 成功
- 主要画面: 今日、スタンプ帳、実績、ショップ、設定

PWA構成は `vite.config.ts` の `VitePWA` で定義されています。`registerType: 'autoUpdate'`、`display: 'standalone'`、manifest名は `日々のルーティンチェック帳`、short_name は `日々ティン` です。Service Workerは vite-plugin-pwa の `generateSW` 方式でビルド時に `dist/sw.js` と Workboxファイルが生成されます。

## 2. 画面・タブ構成

画面管理は `src/App.tsx` の `PageName` です。

```ts
type PageName = 'today' | 'history' | 'achievements' | 'shop' | 'settings';
```

下部タブは5つです。

- `today`: 🎮 今日
- `history`: 📅 スタンプ帳
- `achievements`: 🏆 実績
- `shop`: 🛍️ ショップ
- `settings`: ⚙️ 設定

### 今日

表示内容:

- アプリタイトル
- 日付固定の今日の一言
- 昨日 / 今日 切り替え
- Rank / 所持PT / PT倍率 / 本日または昨日の獲得PT
- 本日または昨日のお通しクエスト
- 今日または昨日のクエスト
- 達成ランク
- タイマー状態
- アイテム別メモ
- 今日/昨日のできごと
- 今日/昨日のひとこと
- 編集モード

主なstate:

- `page`
- `selectedDate`
- `checkedItems`
- `dailyEvent`
- `dailyMemo`
- `isEditMode`
- `activeTimer`
- `pausedTimers`
- `playerEconomy`
- `playerUnlocks`
- `gameBalance`
- `dailyNudgeCandidates`
- `dailyNudgeRecords`

保存データ:

- `hibitin:checks:YYYY-MM-DD`
- `hibitin:events:YYYY-MM-DD`
- `hibitin:memo:YYYY-MM-DD`
- `hibitin:itemNotes:v1`
- `hibitin:timerState:v1`
- `hibitin:playerEconomy:v1`
- `hibitin:dateOverrides:v1`
- `hibitin:dateSnapshots:v1`
- `hibitin:dailyNudgeCandidates:v1`
- `hibitin:dailyNudgeRecords:v1`

連動:

- チェック操作は達成率、スタンプ帳、PT、実績の熟練度計算に影響します。
- アドバンストはチェック可能ですが、達成率と熟練度の対象外です。
- アドバンストはボーナスログ扱いで、通常クエスト枠の制限を受けず自由に追加できます。
- 起床・就寝は達成率とPT対象です。ただし熟練度の対象外です。
- お通しクエストは通常ルーティンとは独立し、達成率、熟練度、通常クエスト枠、スタンプ帳ランクには影響しません。PTは `gameBalance.pointSettings.dailyNudge` が有効な場合のみ付与されます。

### スタンプ帳

表示内容:

- 今月のスタンプ帳
- 月移動: 前月 / 今月 / 翌月
- 日付セル
- 日付タップ後の詳細
- 詳細内のチェック、メモ、編集モード

主なstate:

- `calendarMonth`
- `historySelectedDate`
- `historyCheckedItems`
- `isHistoryEditMode`

保存データ:

- `hibitin:checks:YYYY-MM-DD`
- `hibitin:itemNotes:v1`
- `hibitin:dateOverrides:v1`
- `hibitin:dateSnapshots:v1`

連動:

- スタンプ帳でチェックすると同じ日付のチェック保存が更新されます。
- 選択日が今日タブの `selectedDate` と同じ場合は `checkedItems` も同期します。
- 日付詳細の編集はその日付専用の `dateOverrides` に保存されます。

### 実績

表示内容:

- プレイヤー成長
- 各アイテムの星・トロフィー
- 現在連続、最高連続、累計達成
- 過去のアイテム（アーカイブ）

主なstate:

- `masteryStats`
- `archivedItems`
- `playerEconomy`
- `gameBalance`

保存データ:

- 星・トロフィー自体は専用保存ではなく、チェック履歴から再計算されます。
- 累計獲得スターは `hibitin:playerEconomy:v1` に保存されます。
- アーカイブは `hibitin:archivedItems:v1` に保存されます。

### ショップ

表示内容:

- 所持PT
- 商品カテゴリ: クエスト枠、機能、カスタマイズ、アイテム、ガチャ
- 実装済み商品: `クエスト枠 +1`
- 他カテゴリは準備中

主なstate:

- `shopItems`
- `playerEconomy`
- `playerUnlocks`
- `gameBalance`
- `gameMode`

保存データ:

- `hibitin:playerEconomy:v1`
- `hibitin:playerUnlocks:v2`
- `hibitin:gameBalance:v1`

### 設定

表示内容:

- ゲームモード
- プレイヤー設定
- 開発者モード時のみゲームバランス設定
- テンプレート設定
- テンプレート編集
- データ管理

保存データ:

- `hibitin:gameMode:v1`
- `hibitin:playerProfile:v1`
- `hibitin:gameBalance:v1`
- `hibitin:templates:v1`
- `hibitin:rhythmSettings:v1`

## 3. ルーティン構造

主な型は `src/App.tsx` 冒頭で定義されています。

```ts
type RoutineItem = {
  id: string;
  label: string;
  order: number;
  source: 'default' | 'user' | 'ai';
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
```

ルーティンテンプレートは `RoutineTemplateSettings` です。

- `templates.normal`: ノーマル
- `templates.holiday`: 休日
- `weekdayTypeMap`: 月〜日のノーマル/休日割り当て

日付別構造:

- `dateSnapshots`: その日に表示されたルーティンのスナップショット
- `dateOverrides`: その日専用に編集されたルーティン

表示時の優先順位:

1. `dateOverrides[dateKey]`
2. 過去日なら `dateSnapshots[dateKey]`
3. 曜日から決まるテンプレート

起床・就寝:

- 固定アイテムとして `buildDisplaySections()` 内で生成されます。
- `id` は `morning-wake-up` と `night-sleep`。
- 元テンプレートからは `removeFixedRoutineItems()` で除外されます。
- 表示位置は `rhythmSettings[template].startSection` によって決まります。
- 現在の表示レイアウトでは、起床、朝、昼、夕、夜、就寝、アドバンストの順に組み立てられます。

編集:

- 今日タブの編集モード: `dateOverrides` に保存
- スタンプ帳の編集モード: 選択日付の `dateOverrides` に保存
- 設定タブ: `templates.normal` または `templates.holiday` を編集
- 追加: `addRoutine()`
- 削除: `deleteRoutine()` が完全削除ではなくアーカイブへ移動
- 復元: `restoreArchivedItem()`
- 並び替え: HTML drag/drop + Pointer操作で `order` を再採番
- テンプレートコピー: `saveDisplayedRoutineAsTemplate('normal' | 'holiday')`

## 4. 初期ルーティン

初回起動時のテンプレートは `defaultRoutineSections` から生成されます。起床・就寝は `defaultRoutineSections` には入っておらず、`defaultRhythmConfig` から固定アイテムとして表示時に生成されます。

初期リズム:

- 起床: 06:30
- 就寝: 22:30
- 1日の始まり: 朝

初期通常クエスト:

| セクション | アイテムID | 表示名 | タイマー | source |
|---|---|---|---:|---|
| 朝 | `morning-walk-or-running` | 散歩 or ランニング | 600秒 | default |
| 昼 | `noon-chores` | 雑務 | 600秒 | default |
| 夕 | `evening-workout-or-stretch` | 筋トレ or ストレッチ | 300秒 | default |
| 夜 | `night-reading` | 読書 | 600秒 | default |
| アドバンスト | なし | なし | なし | - |

固定アイテム:

| 固定種別 | アイテムID | 表示名 | 時刻 | 達成率 | PT | 熟練度 |
|---|---|---|---|---|---|---|
| wake | `morning-wake-up` | 起床 | 06:30 | 対象 | 対象 | 対象外 |
| sleep | `night-sleep` | 就寝 | 22:30 | 対象 | 対象 | 対象外 |

## 5. チェック・達成率・ランクスタンプ

チェック保存:

- 保存キー: `hibitin:checks:YYYY-MM-DD`
- 構造: `{ [itemId: string]: boolean }`
- 今日タブ: `toggleItem()`
- スタンプ帳詳細: `toggleHistoryItem()`

達成率計算:

- 関数: `calculateCompletionStats(sections, checks)`
- 分母: `section.id !== 'advanced'` の全アイテム
- 含む: 起床、朝、昼、夕、夜、就寝
- 除外: アドバンスト
- 計算: `Math.round((completedCount / totalCount) * 100)`
- アイテム数0なら `rate: null`

ランク条件:

| 達成率 | icon | label | level | 今日タブ | スタンプ帳セル |
|---:|---|---|---|---|---|
| null | なし | なし | empty | ルーティン未設定 | 空扱い |
| 0% | ☕ | READY? | ready | 表示 | 表示しない |
| 1〜24% | 👟 | START! | start | 表示 | 表示 |
| 25〜49% | 👍 | GOOD! | good | 表示 | 表示 |
| 50〜74% | 🎉 | GREAT! | great | 表示 | 表示 |
| 75〜99% | 🌟 | EXCELLENT! | excellent | 表示 | 表示 |
| 100% | 🏆 | PERFECT!! | perfect | 表示 | 表示 |

スタンプ帳セルでは `%` は表示されず、0%ではアイコン・文言も表示されません。丸いスタンプ枠だけが表示されます。

## 6. スタンプ帳

カレンダー生成:

- 関数: `getMonthDateCells(monthDate)`
- 月曜始まりにするため `leadingBlankCount = (firstDate.getDay() + 6) % 7`
- `completionCalendarDays` で各日のテンプレート、カスタム有無、達成率、ランクを算出

表示ルール:

- 未押印日: 丸いスタンプ枠のみ
- 1%以上: ランク文言 + スタンプアイコン
- 今日: `data-today="true"` でCSS強調
- 休日: `data-routine-kind="holiday"` で赤系の背景/枠
- 個別カスタム: `data-routine-kind="custom"` と ✨ 表示
- 選択中: `data-selected="true"` で強調

詳細:

- 初期状態では詳細非表示
- 日付を押すと `historySelectedDate` に設定
- 同じ日付をもう一度押すと閉じる
- 詳細には日付、ルーティン種別、達成率、各セクション、編集モードが出ます
- 詳細内でもチェック可能です

## 7. タイマー

設定形式:

- アイテムに `timerSeconds` を保存
- 旧 `timerMinutes` が残っていても `getItemTimerSeconds()` が秒へ変換
- UIは 時(0〜2) / 分(0〜59) / 秒(0〜59)
- ショートカット: 30秒, 1分, 3分, 5分, 10分, 15分, 20分, 30分
- 0秒は保存不可

保存:

- キー: `hibitin:timerState:v1`
- 構造: `{ activeTimer, pausedTimers }`
- `activeTimer` は `startedAt`, `endsAt`, `status`, `remainingSeconds` を持ちます。

動作:

- 開始: `startItemTimer()`
- 一時停止: `pauseActiveTimer()`
- 再開: `resumeActiveTimer()`
- リセット: `resetActiveTimer()`
- 複数同時実行: running は1つのみ
- 他タイマー開始時: 実行中タイマーは `pausedTimers` に保存されます
- 一時停止タイマーは複数保持できます

復帰処理:

- `normalizeActiveTimer()` が `endsAt` と現在時刻を比較します。
- 起動時、リロード時、`visibilitychange`、`focus`、1秒間隔で同期します。
- 終了時刻を過ぎて戻ると `finished` になります。

終了通知:

- 中央モーダル表示
- 画面上のタイマーパネルも表示
- 通知音: Web Audio APIで鳴らし、終了中は2秒ごとに繰り返し
- バイブ: `navigator.vibrate` がある環境のみ
- ブラウザ通知: Notification permission が `granted` の場合のみ
- Push API / Web Push / サーバー通知は未実装
- 自動チェックはしません
- `完了にする` でチェックを付けます
- `＋5分` で5分タイマーを再開始します
- `閉じる` で終了アラートを止めます

制限:

- PWA単体のため、画面を完全に閉じている間のリアルタイム通知は保証されません。
- 復帰時の終了判定は実装済みです。

## 8. 日付別記録 / メモ

今日/昨日のひとこと:

- 保存キー: `hibitin:memo:YYYY-MM-DD`
- UI: 今日タブ下部の記録カード、スタンプ帳詳細の「その日の記録」
- 今日タブでは大見出しを表示せず、カード内に「今日/昨日のひとこと」を先に表示
- 画面名: 今日表示では「今日のひとこと」、昨日表示では「昨日のひとこと」
- 日替わりの問いかけは廃止
- 今日タブでは入力欄の下に `dailyOneLineExamples` から日付固定の例文を1件表示
- 例文選択: `daily-one-line-example:YYYY-MM-DD` の安定ハッシュで選択
- 例文の保存: なし。回答のみ既存キーへ保存
- プレースホルダー: `なんでも今日思ったこと、今の気持ちを書いてみよう`
- 例文は入力欄へ自動反映しない
- 自動保存
- 達成率、PT、星、トロフィー、ランク、スタンプ帳ランクには影響しない

今日/昨日のできごと:

- 保存キー: `hibitin:events:YYYY-MM-DD`
- データ構造: string
- UI: 今日タブ下部の記録カード、スタンプ帳詳細の「その日の記録」
- 画面名: 今日表示では「今日のできごと」、昨日表示では「昨日のできごと」、スタンプ帳詳細では「その日のできごと」
- 今日タブでは「今日/昨日のひとこと」の下に表示
- プレースホルダー: 今日タブは `今日あったことを書いてみよう`、スタンプ帳詳細は `その日にあったことを書いてみよう`
- 今日タブでは入力欄の下に `dailyEventExamples` から日付固定の例文を1件表示
- 例文選択: `daily-event-example:YYYY-MM-DD` の安定ハッシュで選択
- 例文の保存: なし。入力内容のみ既存キーへ保存
- 例文は入力欄へ自動反映しない
- 自動保存
- 達成率、PT、星、トロフィー、ランク、スタンプ帳ランクには影響しない

アイテム別メモ:

- 保存キー: `hibitin:itemNotes:v1`
- 構造: `{ [dateKey]: { [itemId]: string } }`
- プレースホルダー: `ひとこと記録を残す`
- 今日タブとスタンプ帳詳細の両方で利用可能
- メモありは `📝✨`
- メモなしは `📝`
- 達成率、PT、熟練度には影響しません

開閉:

- `noteEditorTarget` と `timerSettingItemId` で管理
- `data-popup-ui="true"` の外側クリックで閉じます
- Escキーで閉じます
- 他のポップアップを開くと閉じます

## 8.1 本日のお通しクエスト

通常ルーティンとは独立した、日付ごとの小さな提案機能です。

内部型名と保存キーは既存互換のため `dailyNudge` のままです。

保存:

- 候補一覧キー: `hibitin:dailyNudgeCandidates:v1`
- 日付別記録キー: `hibitin:dailyNudgeRecords:v1`
- 候補型: `{ id, text, completionMessage, category, enabled, order, createdAt }`
- 記録型: `{ candidateId, text, completionMessage, category, completed, assignedAt, completedAt }`
- 記録側に提案文と完了文を保存するため、候補の編集/削除後も過去日の表示は変わりません。

表示:

- 今日タブの「今日のクエスト」カード内で、起床セクションより上に表示します。
- 昨日/今日切り替えに連動し、選択中の日付のお通しクエストを表示します。
- 有効候補が0件の場合は `お通しクエストは準備中です` と表示します。

抽選:

- `selectDailyNudgeCandidate()` が日付文字列の安定ハッシュを使って候補を選びます。
- 直近3日の候補IDはなるべく避けます。
- 候補不足の場合は重複を許容します。
- 一度 `dailyNudgeRecords` に保存された日付は再抽選しません。

完了:

- `toggleDailyNudgeCompletion()` でON/OFFします。
- 通常ルーティンの `toggleItem()` は使いません。
- 達成率、星、トロフィー、ショップ、スタンプ帳には影響しません。
- PTは `pointSettings.dailyNudge.enabled` が有効な場合のみ付与され、付与記録は `pointAwards` で日付ごとに二重取得を防ぎます。

管理:

- 開発者モードの設定画面に `お通しクエスト管理` を表示します。
- 候補の有効/無効、提案文、完了メッセージ、カテゴリを編集できます。
- 候補追加、削除、上/下並び替えができます。
- 削除は確認ダイアログあり。削除しても日付別記録は残ります。

## 9. 星・トロフィー

対象:

- 朝・昼・夕・夜の通常アイテム
- 起床・就寝・アドバンストは対象外

計算:

- 関数: `calculateMasteryStats()`
- チェック履歴キーを `getStoredCheckDateKeys()` で収集
- `dateOverrides`, `dateSnapshots`, `templates`, `rhythmSettings` を使って各日の対象アイテムを復元
- 星・トロフィー自体は保存せず、チェック履歴から再計算

条件:

- 星1〜3: 5日連続ごとに+1
- 星4: 星3到達後、15日連続で獲得
- 星5: 星4到達後、30日連続で獲得
- 2日連続未達成で星-1
- 星5到達で🏆+1、その後星0へ戻る
- トロフィー上限: 5

表示:

- 未獲得スターは表示しません
- 0個なら空
- 星は `⭐`
- トロフィーは `🏆`

アーカイブ:

- 削除アイテムは `hibitin:archivedItems:v1` に保存
- 復元時は元の `id` を維持
- アーカイブカードでもチェック履歴から熟練度を再計算

時間帯スター:

- 現行UI/ロジックでは使用されていません。
- `localStorage.removeItem('hibitin:sectionStars:v1')` が起動時に実行され、旧データは破棄されます。

## 10. プレイヤーランク

算出元:

- `playerEconomy.lifetimeStarsEarned`
- 現在の星数 + トロフィー数 × 5 の推定値を下回らないように更新
- 星が減っても累計獲得スターは減りません

初期ランク条件:

| Rank | 必要累計スター | PT倍率 |
|---:|---:|---:|
| 1 | 0 | 1.00 |
| 2 | 5 | 1.10 |
| 3 | 15 | 1.20 |
| 4 | 30 | 1.30 |
| 5 | 50 | 1.40 |
| 6 | 80 | 1.50 |
| 7 | 120 | 1.75 |

表示:

- 今日タブ上部に Rank、所持PT、倍率
- タップで詳細パネル
- 実績タブの「プレイヤー成長」

詳細パネル:

- 現在ランク
- 累計スター
- 所持PT
- 累計獲得PT
- 獲得倍率
- 次ランク必要スター
- 次ランクまであと何個

## 11. PT経済

保存キー: `hibitin:playerEconomy:v1`

構造:

- `currentPoints`
- `lifetimeEarnedPoints`
- `lifetimeSpentPoints`
- `lifetimeStarsEarned`
- `playerRank`
- `pointLedger`
- `pointAwards`

PT対象:

| 対象 | targetKind | 初期enabled | 初期basePoints |
|---|---|---:|---:|
| 起床 | wake | true | 5 |
| 朝・昼・夕・夜の通常クエスト | normal | true | 10 |
| 就寝 | sleep | true | 5 |
| アドバンスト | advanced | false | 0 |

付与:

- `toggleItem()` / `toggleHistoryItem()` でチェックON時に `applyPointChangeForItemCheck()` を呼びます。
- `achievementKey` は `${dateKey}:${itemId}`。
- 獲得PTは `basePoints * rankMultiplier` を丸めます。
- 丸め方は `round`, `floor`, `ceil`。

二重取得防止:

- `pointAwards[achievementKey].active` が true なら追加付与しません。
- チェック解除で既存付与額と同額を取り消します。
- 再チェック時は初回付与時の `points`, `basePoints`, `multiplier` を再利用します。
- 再チェックでは `lifetimeEarnedPoints` は再加算されません。

## 12. ショップ

画面:

- 下部タブの `shop`
- 通常ユーザーにも表示

カテゴリ:

- クエスト枠
- 機能
- カスタマイズ
- アイテム
- ガチャ

実装済み商品:

- `クエスト枠 +1`

商品構造:

```ts
type ShopItem = {
  id: string;
  category: ShopCategory;
  label: string;
  price: number;
  enabled: boolean;
  maxPurchases?: number;
};
```

クエスト枠:

- 保存キー: `hibitin:playerUnlocks:v2`
- 構造: `{ totalQuestSlots: number }`
- 初期合計枠: 4
- 最大合計枠: 10
- 初期価格: 100PT
- 枠判定対象: 朝・昼・夕・夜の通常アイテム合計
- 対象外: 起床、就寝、アドバンスト
- 時間帯別枠購入は現行UIから廃止済みです。
- 旧 `hibitin:playerUnlocks:v1` の `questSlots` は移行処理だけ残っています。

購入:

- `exchangeQuestSlot()`
- プレイヤーモードのみ購入可能
- PT不足、販売OFF、最大枠到達時は購入不可
- 確認ダイアログあり
- `currentPoints` 減算
- `lifetimeSpentPoints` 加算
- `pointLedger` に `spend` 追加
- `playerUnlocks.totalQuestSlots` +1
- 連打防止に `exchangeLockRef` を使用

## 13. プレイヤーモード / 開発者モード

保存キー: `hibitin:gameMode:v1`

初期値:

- `player`

違い:

- プレイヤーモード: 通常クエスト合計枠制限あり。ショップで枠を増やします。
- 開発者モード: 枠制限なし。ゲームバランス設定が表示されます。

制限:

- `countNormalQuestItems()` が朝・昼・夕・夜の通常アイテムを合計
- `getEffectiveQuestSlotLimit()` が `playerUnlocks` と `gameBalance.questSlotExchange` から有効上限を計算
- 追加時と追加ボタン表示時に判定

## 14. 管理者設定 / ゲームバランス設定

表示条件:

- 設定タブ
- `gameMode === 'developer'`

管理項目:

| UI名 | 保存先 | ロジック連動 | 初期値/内容 |
|---|---|---|---|
| 星・トロフィー条件 | コード固定 | 表示のみ | `MASTERY_RULES`, `TROPHY_RULES` |
| 丸め方 | `gameBalance.pointSettings.rounding` | PT計算に連動 | round |
| 起床 基礎PT/対象 | `pointSettings.wake` | PT付与に連動 | enabled true, 5 |
| 通常クエスト 基礎PT/対象 | `pointSettings.normal` | PT付与に連動 | enabled true, 10 |
| 就寝 基礎PT/対象 | `pointSettings.sleep` | PT付与に連動 | enabled true, 5 |
| アドバンスト 基礎PT/対象 | `pointSettings.advanced` | PT付与に連動 | enabled false, 0 |
| Rank | `rankRules[].rank` | ランク表示に連動 | 1〜7 |
| 必要累計★ | `rankRules[].requiredLifetimeStars` | ランク算出に連動 | 0,5,15,30,50,80,120 |
| PT倍率 | `rankRules[].pointMultiplier` | PT計算に連動 | 1.00〜1.75 |
| クエスト枠販売 | `questSlotExchange.enabled` | ショップ購入可否に連動 | true |
| 初期合計枠数 | `questSlotExchange.initialTotalSlots` | 有効枠下限に連動 | 4 |
| 最大合計枠数 | `questSlotExchange.maxTotalSlots` | 有効枠上限/ショップ上限に連動 | 10 |
| 価格 | `questSlotExchange.price` | ショップ購入額に連動 | 100 |
| お通しクエスト管理 | `hibitin:dailyNudgeCandidates:v1` | 今後の日付抽選に連動 | 候補20件 |

入力値検証:

- `normalizeGameBalanceSettings()` で保存時・読み込み時に正規化
- 数値は概ね `Math.max` と `Math.floor` で補正
- Rank倍率は `0.1` 以上

`お通しクエスト管理` はゲームバランス設定とは別の開発者向け設定ブロックです。既に割り当て済みの日付記録は `hibitin:dailyNudgeRecords:v1` 側に文章ごと保存されるため、候補編集・削除の影響を受けません。

管理者画面の実装状況表示:

- 実装済み欄は、現行コード上の主要実装と概ね一致しています。
- 未実装欄の「タイマー機能購入」「メモ機能購入」「背景」「キャラクター着せ替え」「アイテム」「ガチャ」「連続達成PTボーナス」は、現行コード上も未実装です。

## 15. プレイヤープロフィール

保存キー: `hibitin:playerProfile:v1`

構造:

```json
{ "displayName": "名前" }
```

仕様:

- 最大20文字
- onChangeで20文字まで反映
- onBlurでtrim
- 空欄許可
- 今日の一言で一部メッセージのみ名前呼びかけ
- 名前未登録時は通常メッセージ
- バックアップ対象です。

## 16. データ保存一覧

詳細は `docs/hibitin-storage-map-v1.md` に分離しました。

## 17. バックアップ・復元・初期化

バックアップ:

- 関数: `exportBackup()`
- ファイル名: `hibitin-backup-YYYY-MM-DD.json`
- JSON構造: `{ backupVersion, exportedAt, appName, data: { storage } }`
- 対象: `isHibitinStorageKey()` に一致する全localStorageキー
- 条件: `key.startsWith('hibitin:') || key.startsWith('hibitin-')`

復元:

- 関数: `importBackup()`
- `isBackupFile()` で検証
- 必須キー: templates, dateSnapshots, dateOverrides, rhythmSettings
- hibitin関連キーを削除してから復元
- 復元後 reload

初回状態リセット:

- 関数: `resetToInitialState()`
- 2回確認
- `localStorage.clear()` は使わず、hibitin関連キーだけ削除
- 削除後 reload

注意:

- 復元検証は必須キーが object であることを要求するため、非常に古いバックアップは弾かれる可能性があります。

## 18. PWA・通知

manifest:

- `vite.config.ts` の `VitePWA` で定義
- `display: standalone`
- `start_url: /`
- icon: `/pwa-icon.svg`

Service Worker:

- `src/main.tsx` で `registerSW({ immediate: true })`
- generateSWでキャッシュ生成
- アプリ独自のPush処理はありません。

通知:

- Notification API: タイマー終了時のみ使用
- Push API: 未実装
- Web Push: 未実装
- サーバー通知: 未実装
- Vibration API: 存在する場合のみ使用

## 19. CSS・レスポンシブ

主要スタイル:

- `src/styles.css`
- `.app` は `padding-bottom: calc(116px + env(safe-area-inset-bottom))`
- `.bottom-tab-nav` は固定表示、5列、`bottom: calc(12px + env(safe-area-inset-bottom))`
- 最大本文幅は `.app-content { width: min(100%, 520px) }`
- 主要メディアクエリ: `@media (max-width: 640px)`

画面別:

- スタンプ帳: `.completion-calendar`, `.calendar-day`, `data-rate-level`, `data-routine-kind`
- ショップ: `.shop-panel`, `.shop-category-card`, `.point-exchange-card`
- タイマー: `.timer-finished-backdrop`, `.timer-finished-modal`
- メモ: `.item-note-editor`, `.daily-memo`
- 管理者設定: `.admin-balance-settings`, `.admin-balance-grid`

## 20. 実装状況一覧

### 実装済み

- React/Vite/TypeScript/PWA構成
- 下部5タブ
- ノーマル/休日テンプレート
- 曜日割り当て
- 日付別override/snapshot
- 今日/昨日切替
- スタンプ帳
- スタンプ帳内チェック/編集
- 達成率とランク表示
- タイマー設定/実行/復帰/終了モーダル
- 全体メモ、アイテム別メモ
- 本日のお通しクエスト
- 星・トロフィー再計算
- アーカイブ/復元
- PT獲得/取消/二重取得防止
- プレイヤーランク/PT倍率
- ショップタブ
- 合計クエスト枠 +1 購入
- プレイヤーモード/開発者モード
- ゲームバランス設定
- バックアップ/復元/初期化

### 一部実装・要確認

- 星・トロフィー条件は管理者画面で表示されますが、編集はできません。
- `MasteryStats` 型に `totalCompletions` が重複定義されています。TypeScript上は同一型なのでビルドは通っていますが整理対象です。
- `dateSnapshots` は表示時に自動保存されるため、localStorage増加リスクがあります。
- バックアップ復元の必須キー条件により、旧バックアップ互換は限定的です。
- 通常クエスト枠のv1→v2移行は「旧各時間帯枠の購入分を合計」する方式です。過去の購入履歴からの厳密復元ではありません。

### 未実装

- Web Push / サーバー通知
- PTによるタイマー機能購入
- PTによるメモ機能購入
- 背景/キャラクター着せ替え
- アイテム
- ガチャ
- 連続達成PTボーナス
- 月間スタンプ集計
- 外部DB同期

## 21. 技術的負債・危険箇所

- `src/App.tsx` が5684行で、型、ストレージ、画面、ロジックが集中しています。
- `localStorage` 読み書きが多数の `useEffect` と関数に分散しています。
- チェック、PT、星、スタンプ帳が強く連動しており、チェック処理変更時の副作用が大きいです。
- `pointLedger` は増え続けます。長期運用時の容量対策が未設計です。
- `dateSnapshots` も日付ごとに増え続けます。
- 熟練度は過去日を日単位で再走査するため、履歴が増えると重くなる可能性があります。
- Notification APIは画面が開いている前提です。
- 旧仕様キーの一部は移行/削除処理のみ残っています。
- テンプレート、日付override、snapshot、rhythmの責務が近く、Phase 2で分割設計が必要です。

## 22. Phase 2の推奨開始地点

1. `App.tsx` の分割  
   まず storage、routine、timer、economy、mastery、shop、components に分ける準備をする。

2. localStorage層の集約  
   `storage.ts` のようなモジュールを作り、キー、読み込み、正規化、移行を一元化する。

3. チェック処理のテスト追加  
   PT二重取得、取消、スタンプ帳同期、過去日チェックを守るテストを先に作る。

4. 経済システムの整合性確認  
   `pointLedger`, `pointAwards`, `currentPoints`, `lifetimeEarnedPoints`, `lifetimeSpentPoints` の不変条件を整理する。

5. 熟練度計算のキャッシュ検討  
   現状は履歴再走査。Phase 2でデータ量が増える前に方針を決める。

6. バックアップ互換の強化  
   必須キー条件と旧バックアップ復元の扱いを明文化する。

7. UIコンポーネント分割  
   Today, StampBook, Achievements, Shop, Settings を分離して変更リスクを下げる。

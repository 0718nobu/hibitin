# hibitin Phase3 SaveData

作成日: 2026-07-13
根拠: 現在の `src/App.tsx`, `src/styles.css`, `src/main.tsx`, `vite.config.ts`, `package.json`, `docs/*` を確認。
ビルド確認: `npm run build` 成功。

## 1. アプリ概要

hibitin は「ルーティン管理アプリ」ではなく、「着手が重い人が、ゲーム感覚で自然と動き出せるアプリ」。

中心思想:

- 完璧主義や計画倒れを避け、まず一歩踏み出す。
- 少ないクエストを毎日進める。
- 行動すると PT が貯まり、ショップで自由度が増える。
- 習慣ごとに星・トロフィーが育つ。
- 累計スターでプレイヤーRankが上がり、Rankが高いほどPT獲得倍率が上がる。
- スタンプ帳で「日々が埋まっていく」楽しさを見る。
- 今日画面はプレイ画面、スタンプ帳は過去を見る場所、実績は育成を見る場所、ショップはPTを使う場所、設定はゲームを作る場所。

現在の技術:

- React 19
- TypeScript 6
- Vite 8
- vite-plugin-pwa 1.3
- CSSは `src/styles.css` に集約
- 主要実装はほぼ `src/App.tsx` 単一ファイル

起動:

- 開発: `npm run dev`
- ビルド: `npm run build`
- プレビュー: `npm run preview`

PWA:

- `vite.config.ts` の `VitePWA`
- manifest name: `日々のルーティンチェック帳`
- short_name: `日々ティン`
- display: `standalone`
- Service Worker: `src/main.tsx` の `registerSW({ immediate: true })`
- Web Push / Push APIサーバー通知は未実装

## 2. 現在の画面一覧

`PageName = 'today' | 'history' | 'achievements' | 'shop' | 'settings'`

下部タブ:

- 🎮 今日
- 📅 スタンプ帳
- 🏆 実績
- 🛍️ ショップ
- ⚙️ 設定

### Today

役割: 毎日プレイする画面。

主な表示:

- アプリ名 hibitin
- 今日の一言メッセージ
- プレイヤー情報カード: 名前、Rank、所持PT、倍率、当日獲得PT
- Rank詳細パネル
- 昨日 / 今日 切替
- 今日のクエストカード
- 祝日表示付き日付ラベル
- 進捗パネル
- 本日の日替わりクエスト
- 起床、朝、昼、夕、夜、就寝、アドバンスト
- タイマーパネル
- 今日の記録カード: 今日のひとこと、今日のできごと

### スタンプ帳

内部ページ名は `history`。

役割: 月全体のスタンプを眺め、日付を選んで詳細を見る。

主な表示:

- 月カレンダー
- 未達成/ FIRST / START / GOOD / GREAT / EXCELLENT / PERFECT スタンプ
- 休日 `休` 表示
- 今日/選択中表示
- 日付タップで詳細表示
- 選択日のクエスト、チェック、編集、記録欄

### 実績

役割: 育成とコレクションを見る画面。

主な表示:

- プレイヤー成長
- Rank
- 所持PT
- 累計獲得PT
- 累計獲得スター
- PT倍率
- 次Rankまで
- 各ルーティンアイテムの星・トロフィー・連続記録・累計達成

### ショップ

役割: PTを使って機能・枠を購入する画面。

現在実装済み:

- フリークエスト枠 +1
- 所持PT表示
- フリークエスト枠カテゴリ
- 機能/カスタマイズ/アイテム/ガチャは準備中

### 設定

役割: プレイヤー設定、ゲームモード、テンプレート編集、バックアップ、管理者設定。

主な表示:

- プレイヤー設定: プレイヤー名
- ゲームモード: プレイヤーモード / 開発者モード
- 開発者モード時のみゲームバランス設定
- 日替わりクエスト管理
- ルーティン設定
- データ管理、バックアップ、復元、初回状態リセット

## 3. データ構造

主要型:

- `RoutineItem`: `id`, `label`, `order`, `source`, `createdAt`, `fixedKind?`, `time?`, `timerMinutes?`, `timerSeconds?`
- `RoutineSection`: `id`, `title`, `order`, `items`
- `RoutineTemplateSettings`: normal/holiday templates と曜日割当
- `GameBalanceSettings`: `pointSettings`, `rankRules`, `questSlotExchange`
- `PlayerEconomy`: PT、累計スター、Rank、台帳、PT付与記録
- `PlayerUnlocks`: `totalQuestSlots`
- `DailyNudgeCandidate`
- `DailyNudgeRecord`
- `MasteryStats`
- `ActiveTimer`, `PausedTimer`, `StoredTimerState`

主要localStorageキー:

- `hibitin:templates:v1`: normal/holidayルーティン
- `hibitin:dateSnapshots:v1`: 日付スナップショット
- `hibitin:dateOverrides:v1`: 日付別上書き
- `hibitin:checks:YYYY-MM-DD`: チェック状態
- `hibitin:timerState:v1`: タイマー状態
- `hibitin:itemNotes:v1`: アイテム別メモ
- `hibitin:memo:YYYY-MM-DD`: 今日のひとこと
- `hibitin:events:YYYY-MM-DD`: 今日のできごと
- `hibitin:dailyNudgeCandidates:v1`: 日替わりクエスト候補
- `hibitin:dailyNudgeRecords:v1`: 日付別日替わりクエスト記録
- `hibitin:gameMode:v1`: player/developer
- `hibitin:gameBalance:v1`: PT、Rank、ショップ枠設定
- `hibitin:playerEconomy:v1`: PT経済、累計スター、Rank
- `hibitin:playerProfile:v1`: プレイヤー名
- `hibitin:playerUnlocks:v2`: 合計フリークエスト枠
- `hibitin:archivedItems:v1`: 削除済みアイテム
- 旧: `hibitin:playerUnlocks:v1`, `hibitin:sectionStars:v1`, `hibitin-routines:v1`, `hibitin:lifestyleSettings:v1`

バックアップは `isHibitinStorageKey()` により `hibitin:` または `hibitin-` で始まるキーを対象にする。

## 4. ランク仕様

達成率ランク:

- READY: 0%, ☕, 今日画面には表示。スタンプ帳では未押印扱い。
- FIRST: フリークエスト達成0件かつ日替わりクエスト完了, 🐣, STARTより下。
- START: 1〜24%, 👟
- GOOD: 25〜49%, 👍
- GREAT: 50〜74%, 🎉
- EXCELLENT: 75〜99%, 🌟
- PERFECT: 100%, 🏆

実装関数:

- `calculateCompletionStats()`
- `getCompletionRank()`
- `getVisualProgressRank()`

重要:

- FIRSTは達成率計算を変えない。見た目だけの視覚ランク。
- 日替わりクエストは達成率分母に入らない。
- アドバンストは達成率分母に入らない。

## 5. PT仕様

保存先: `hibitin:playerEconomy:v1`

構造:

- `currentPoints`
- `lifetimeEarnedPoints`
- `lifetimeSpentPoints`
- `lifetimeStarsEarned`
- `playerRank`
- `pointLedger`
- `pointAwards`

初期PT設定:

- 起床: enabled true, 5PT
- フリークエスト: enabled true, 10PT
- 就寝: enabled true, 5PT
- アドバンスト: enabled false, 0PT
- 日替わりクエスト: enabled true, 10PT
- rounding: round

PT対象:

- 起床チェック
- 朝/昼/夕/夜のフリークエストチェック
- 就寝チェック
- 日替わりクエストOK
- アドバンストは初期対象外。ただし管理者設定で有効化可能。

二重取得防止:

- 通常チェック: `YYYY-MM-DD:itemId`
- 日替わり: `daily-nudge:YYYY-MM-DD`
- `pointAwards[achievementKey].active` で管理
- チェック解除時は付与時の `points/basePoints/multiplier` を使って取消
- 過去PT履歴は設定変更後も再計算しない

倍率:

- `getPlayerRankProgress(lifetimeStarsEarned, gameBalance)` の `multiplier`
- 新規PT付与時のみ反映

## 6. スター仕様

スターは各ルーティンアイテムの熟練度。

対象:

- 朝/昼/夕/夜のフリークエスト

対象外:

- 起床
- 就寝
- アドバンスト
- 日替わりクエスト
- FIRST
- スタンプ帳ランク

実装:

- `MASTERY_RULES`
- `TROPHY_RULES`
- `applyMasteryDayResult()`
- `calculateMasteryStats()`

ルール:

- 星1〜3: 5日連続達成ごとに+1
- 星4: 星3後、15日連続達成
- 星5: 星4後、30日連続達成
- 2日連続未達成で星-1
- 星5到達で🏆+1、その後星0
- トロフィー上限5

累計スター:

- `playerEconomy.lifetimeStarsEarned`
- `estimatedLifetimeStarsEarned` と比較し、減らさず最大値へ補正
- Rank算出元

## 7. スタンプ帳仕様

月表示:

- `getMonthDateCells()` で月曜始まり風の空白を含むセル生成
- 7列グリッド
- セル大型化済み

セル表示:

- 未達成: 空スタンプ枠
- FIRST: 🐣 FIRST
- START: 👟 START
- GOOD: 👍 GOOD
- GREAT: 🎉 GREAT
- EXCELLENT: 🌟 EXCELLENT
- PERFECT: 🏆 PERFECT

休日:

- weekday map が holiday の日付は赤/ピンク系アクセントと `休`
- 日本の祝日は `getHolidayName()` で取得できるが、スタンプ帳セルには祝日名は出さない

PERFECTデザイン:

- スタンプ帳のPERFECTセルは深いエメラルド、金フレーム、宝石感
- 今日画面PERFECTの方向性もこのセルを大型化する世界観

配色思想:

- 未達成: 淡い空枠
- FIRST: クリーム/ひよこ
- START: 薄いグレー/青み
- GOOD: 明確な青
- GREAT: ピンク/ローズ
- EXCELLENT: ゴールド
- PERFECT: 濃いエメラルド + 金装飾

## 8. 今日画面仕様

今日画面の構造:

- プレイヤー情報
- 今日/昨日切替
- 今日のクエストカード
- 今日の記録カード

今日のクエストカード:

- `data-progress-level` で READY/FIRST/START/GOOD/GREAT/EXCELLENT/PERFECT のCSSを切替
- PERFECT時は外枠・背景演出のみ特別化。起床〜アドバンストの各カードは通常デザインに戻す方向で調整済み
- 直近要望では、PERFECT背景はスタンプ帳PERFECTと同じような濃いエメラルド、金は外枠/装飾だけ

表示順:

- 見出し
- 日付（祝日なら `月・海の日` 形式）
- 進捗パネル
- 本日の日替わりクエスト
- 起床
- 朝
- 昼
- 夕
- 夜
- 就寝
- コアルーティン「今日を残す」
- アドバンスト
- 編集モード

今日の記録:

- 今日のひとこと
- 例文
- 今日のできごと
- 例文
- 保存先は別キー

コアルーティン「今日を残す」:

- `src/coreRoutines.ts` にフリークエストとは別定義。
- `今日を一言で残す`: `hibitin:memo:YYYY-MM-DD` の本文が空白以外1文字以上なら達成。
- `今日のできごとを残す`: `hibitin:events:YYYY-MM-DD` の本文が空白以外1文字以上なら達成。
- 追加のboolean保存はしない。
- 配置は `hibitin:coreRoutinePlacements:v1` に時間帯と順番だけ保存する。
- フリークエストと同じ一覧行で表示されるが、`RoutineItem` には混ぜない。
- 初期配置は「今日を一言で残す」が朝、「今日のできごとを残す」が夜。
- Today編集モードで時間帯変更と並び替えが可能。名称変更・削除は禁止。
- フリークエスト枠、達成率、FIRST/PERFECT判定、PT、星、トロフィーには影響しない。
- スタンプ帳詳細でも該当時間帯の一覧内に表示。

日付表示:

- `formatQuestDateLabel()`
- 祝日は `getHolidayName()` を使い `2026年7月20日（月・海の日）`
- 通常日は `2026年7月13日（月曜日）`

タイマー:

- endsAt方式
- 実行中は `activeTimer`
- 一時停止は `pausedTimers`
- 画面復帰/visibilitychange/focusで補正
- 終了時モーダル、音、Notification API、Vibration API
- 完了にする/+5分/閉じる
- 自動チェックなし

## 9. デザインガイドライン

世界観:

- 「人生を一歩ずつ歩くRPG」
- ラジオ体操カード/スタンプラリー
- 小さな行動を褒める
- 着手の軽さ
- 継続が最強

UI思想:

- 今日画面はプレイ画面。情報を増やしすぎない。
- スタンプ帳は数字より押印体験。
- 実績は育成/コレクション。
- 設定はゲームを作る場所。
- ショップはPTを使って自由度を買う場所。

色:

- 基本は柔らかい緑/クリーム。
- PERFECTは濃いエメラルド主体、金は装飾。
- GREATは休日と混ざらないピンク/ローズ。
- EXCELLENTは金。
- GOODは青。

やってはいけないこと:

- 金色をPERFECT背景の主役にしすぎない。
- 今日画面に説明文を増やしすぎない。
- 日替わりクエストを達成率に混ぜない。
- アドバンストをフリークエスト枠に含めない。
- localStorageキーを安易に変えない。

## 10. 実装済み機能

完成済み:

- 5タブ構成
- 今日/昨日切替
- 日付別チェック
- normal/holidayテンプレート
- 日付別上書き
- 起床/就寝固定枠
- アドバンスト自由追加
- 日付別ひとこと
- 日付別できごと
- アイテム別メモ
- 日替わりクエスト
- FIRSTランク
- スタンプ帳
- 星・トロフィー
- プレイヤーRank
- PT経済
- ショップのフリークエスト枠+1
- プレイヤーモード/開発者モード
- 管理者ゲームバランス設定
- バックアップ/復元/初期化
- PWA
- endsAtタイマー
- 日本祝日名表示

途中:

- PERFECTデザインは調整中。現在の方向は「濃いエメラルド背景、金は枠・装飾だけ」。
- App.tsx肥大化。
- ドキュメントはPhase2時点から更新されているが、最新UI調整の全部が完全反映とは限らない。

保留:

- Web Push
- サーバー通知
- React Native / Expo化

未着手:

- PTでタイマー/メモ/機能購入
- ショップの衣装/背景/アイテム/ガチャ
- できごと一覧
- 月次振り返り
- AI質問生成
- 公開/共有/コミュニティ例文

## 11. 今後実装予定

High:

- PERFECT今日画面デザインの最終調整
- App.tsx分割準備
- localStorage層の整理
- Rank/PT/スターの不変条件のテスト化
- スタンプ帳と今日画面の見た目整合

Middle:

- ショップ商品拡張
- フリークエスト枠以外の機能購入
- 月間スタンプ集計
- できごと/ひとことの振り返り一覧
- 管理者設定の整理

Low:

- キャラクター/衣装
- 背景カスタマイズ
- ガチャ
- コミュニティひとこと
- ネイティブ通知

## 12. 技術情報

主要ファイル:

- `src/App.tsx`: ほぼ全ロジックと画面
- `src/styles.css`: 全CSS
- `src/main.tsx`: React起動、PWA登録
- `vite.config.ts`: Vite/PWA設定
- `docs/hibitin-current-spec-v1.md`: 現行仕様
- `docs/hibitin-storage-map-v1.md`: 保存キー
- `docs/hibitin-phase2-risks-v1.md`: リスク

重要関数:

- `getDateKey()`
- `formatQuestDateLabel()`
- `getHolidayName()`
- `calculateCompletionStats()`
- `getCompletionRank()`
- `getVisualProgressRank()`
- `getPlayerRankProgress()`
- `calculateQuestPoints()`
- `applyMasteryDayResult()`
- `calculateMasteryStats()`
- `countNormalQuestItems()`
- `getEffectiveQuestSlotLimit()`
- `selectDailyNudgeCandidate()`
- `createDailyNudgeRecord()`
- `applyPointChangeForDailyNudge()`
- `loadStoredTimerState()`
- `normalizeActiveTimer()`

依存:

- React/React DOM
- vite-plugin-pwa
- TypeScript

## 13. 修正時の注意事項

壊してはいけない:

- `hibitin:memo:YYYY-MM-DD` は今日のひとこと。旧メモ互換。
- `hibitin:events:YYYY-MM-DD` は今日のできごと。
- `hibitin:dailyNudge*` は内部名のまま。画面名は日替わりクエスト。
- `hibitin:playerUnlocks:v2` は合計枠。時間帯別枠へ戻さない。
- `hibitin:sectionStars:v1` は廃止済み。復活させない。
- コアルーティン「今日を残す」は `src/coreRoutines.ts` と `hibitin:coreRoutinePlacements:v1` で独立管理し、`RoutineItem` に混ぜない。
- Rank 2は累計スター5以上。
- FIRSTは通常0件 + 日替わり完了。
- アドバンストは枠/達成率/星の対象外。PTは管理者が有効にした場合のみ。
- PT取消は付与時額で行う。
- 過去PTは再計算しない。

CSS注意:

- `routine-list[data-progress-level]` 周辺は今日のクエスト進捗演出。
- PERFECTは `routine-list[data-progress-level='perfect']`。
- セクションカードの見た目は `.routine-section` と `.routine-list[data-progress-level] .routine-section`。
- スタンプ帳は `.completion-calendar`, `.calendar-day`, `.calendar-stamp-slot`, `.calendar-stamp-visual`, `data-rate-level`。
- 下部ナビのsafe-area余白を壊さない。

## 14. 開発履歴

Phase1:

- PWAルーティンチェック帳として開始。
- チェック、スタンプ帳、実績、タイマー、メモ、設定を整備。
- 熟練度スター、アーカイブ、管理者設定を追加。

Phase2:

- 「ルーティン管理」から「着手が重い人向けゲーム」へ方向転換。
- ゲームモード、プレイヤーモード制限、PT経済、Rank、ショップを導入。
- 時間帯スターは廃止し、アイテム星・累計スター・Rank・PTへ整理。
- 日替わりクエストを追加し、FIRSTランクを導入。
- 今日の記録としてひとこと/できごとを追加。
- スタンプ帳と今日画面のランク演出を強化。
- PERFECTデザインは「濃いエメラルド + 金装飾」へ調整中。

なぜ現在の仕様か:

- ユーザーが自由に増やしすぎるより、少ないクエストを育てるゲーム性を重視したため。
- ただし自由度はショップで少しずつ買える設計。
- 記録系は達成率/PTに混ぜず、軽い振り返りとして独立。

## 15. 現在残っている課題

未解決:

- App.tsxが巨大。
- localStorageアクセスが分散。
- PT/スター/Rankのロジックに自動テストがない。
- デザイン調整がCSSに集中し、ランクごとの差分追跡が難しい。

改善案:

- `storage.ts`, `routine.ts`, `economy.ts`, `mastery.ts`, `timer.ts`, `dailyNudge.ts` に分割。
- `getCompletionRank`, `getVisualProgressRank`, `getPlayerRankProgress`, `calculateQuestPoints` をテスト化。
- スタンプ帳セルコンポーネントと今日クエストカードを分割。
- 管理者設定を専用コンポーネント化。

バグ候補:

- CSS変更のたびにPERFECT/EXCELLENT/GREATの見た目バランスが崩れやすい。
- `pointLedger` と `pointAwards` は長期運用で肥大化。
- 日付スナップショットも増え続ける。
- PWA通知は画面を閉じている間は保証されない。

## 16. Codexへの申し送り

このプロジェクトでは、「便利な管理ツール」より「動き出せるゲーム体験」を優先する。

のぶさんの好み:

- シンプルで直感的。
- 説明文を増やしすぎない。
- スマホアプリらしい軽快さ。
- スタンプ帳・RPG・育成感が好き。
- PERFECTは濃いエメラルドの宝石感。金は装飾で、背景の主役ではない。
- 未達成を責めるUIは避ける。
- 小さな一歩を肯定する文言がよい。

優先順位:

1. 既存データを壊さない。
2. チェック/PT/Rank/スター/スタンプ判定を壊さない。
3. 今日画面は使いやすく。
4. スタンプ帳は眺めて楽しく。
5. 管理者設定は実装条件の一元管理。

禁止事項:

- `localStorage.clear()` を使わない。
- hibitin以外のlocalStorageを消さない。
- 時間帯スターを復活させない。
- 時間帯別フリークエスト枠購入へ戻さない。
- アドバンストをフリークエスト枠に含めない。
- 日替わりクエストを達成率に入れない。
- 自動チェックを勝手に入れない。
- PERFECT背景を金一色にしない。

作業完了ルール:

- 実装後は `npm run build`
- 可能ならPreview確認
- 最後に `http://127.0.0.1:5173/` のアプリPreviewへ戻して終了

## Phase3開始時点の状態

- hibitinはToday/スタンプ帳/実績/ショップ/設定の5タブPWAとして動作。
- `npm run build` は成功。
- PT、Rank、スター、日替わりクエスト、FIRST、ショップ合計枠、ひとこと、できごと、祝日表示は実装済み。
- ショップは「フリークエスト枠 +1」のみ実装済み。
- PERFECTデザインは直近で調整中。次チャットで最初に見るなら `src/styles.css` の `.routine-list[data-progress-level='perfect']` 周辺。
- 次に効率が良い着手:
  - PERFECT今日画面の背景を、スタンプ帳PERFECTのような濃いエメラルドへ最終調整。
  - その後、App.tsx分割またはRank/PT/スターのテスト追加。
  - ショップ拡張へ進む前に、経済ロジックの不変条件を固定する。

# hibitin

自分だけのゆるい日々ティン帳です。

## Supabase接続設定

Supabase Authを使う場合は、プロジェクト直下に `.env.local` を作成し、以下の2つを設定します。

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

- `VITE_SUPABASE_URL`: Supabase Project Settings の Project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Supabase API Keys の publishable key または anon public key

`.env.local` はGit管理外です。`service_role key`、secret key、データベースパスワード、管理者権限を持つキーはブラウザ側へ置かないでください。

ローカル開発では、Supabase Auth の Redirect URL に以下を追加します。

```text
http://127.0.0.1:5173/
```

本番公開時は、デプロイ先のURLもRedirect URLへ追加し、同じ2つの環境変数をホスティング環境にも設定します。

Supabase未設定でもhibitin本体は端末内データでそのまま動作します。

## Supabase SQL

クラウドバックアップ用テーブルは以下をSupabase SQL Editorで実行します。

```text
supabase/hibitin_backups.sql
```

全ユーザー共通の日替わりクエスト候補マスターは以下を実行します。

```text
supabase/daily_quest_master.sql
```

このSQLには以下が含まれます。

- `admin_users`
- `daily_quest_master`
- RLS
- 管理者だけが追加・編集・削除できるpolicy
- 一般ユーザーと未ログインユーザーが有効候補だけ読めるpolicy
- 初期の日替わりクエスト候補

## 管理者登録

`supabase/daily_quest_master.sql` を実行したあと、自分のSupabase AuthユーザーIDを `admin_users` へ追加します。

1. Supabase Dashboardを開く
2. `Authentication` → `Users` を開く
3. 自分のユーザーを選び、`User UID` をコピーする
4. SQL Editorで以下を実行する

```sql
insert into public.admin_users (user_id)
values ('ここに自分のUser UID')
on conflict (user_id) do nothing;
```

実際のUser UIDはコードへ直書きしません。管理者登録後、hibitinへログインし直すか再読み込みすると、設定画面に管理者用の「管理」が表示されます。一般ユーザーには表示されず、RLSにより直接APIを呼んでも書き込みできません。

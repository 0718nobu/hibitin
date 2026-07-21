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

Supabase未設定でもhibitin本体は端末内データでそのまま動作します。現時点ではログイン状態の確認だけを行い、クラウド同期は実装していません。

# デプロイ手順（Vercel ＋ Railway）

- フロント（React/Vite）→ **Vercel**
- APIサーバー（Express）＋ MySQL → **Railway**

順番が大事：**① Railway（API＋DB）→ ② Vercel（フロント）→ ③ Railwayに本番URLを許可** の順で進める。

---

## ① Railway：APIサーバー ＋ MySQL

1. https://railway.app にGitHubでサインイン
2. **New Project → Deploy from GitHub repo** → このリポジトリを選択
3. サービスの **Settings → Root Directory** を `server` に設定
   - Build Command: `npm run build`（自動検出されるはず）
   - Start Command: `npm start`
4. **New → Database → Add MySQL** でMySQLを追加
5. APIサービスの **Variables** に以下を追加：
   - `MYSQL_URL` = MySQLサービスの `MYSQL_URL`（Variablesから参照、`${{ MySQL.MYSQL_URL }}` で参照可）
   - `JWT_SECRET` = ログイン認証のJWT署名鍵。`openssl rand -base64 48` などで生成した推測不可能な値を設定する
     - **未設定だとコード内の開発用既定値が使われ、誰でもトークンを偽造できてしまうため必須**
     - 一度決めたら変更しない（変えると全ユーザーが再ログインになる）
   - （`CLIENT_ORIGIN` は③で設定）
6. デプロイ完了後、**Settings → Networking → Generate Domain** で公開URLを発行
   - 例: `https://accounting-production.up.railway.app`
   - このURL（末尾に `/api` を付けたもの）を②で使う

## ② Vercel：フロントエンド

1. https://vercel.com にGitHubでサインイン
2. **Add New → Project** → このリポジトリをImport
3. 設定：
   - **Framework Preset**: Vite（自動検出）
   - **Root Directory**: そのまま（リポジトリ直下）
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. **Environment Variables** に追加：
   - `VITE_API_BASE_URL` = `https://<RailwayのURL>/api`
     （例: `https://accounting-production.up.railway.app/api`）
5. **Deploy** → 完了すると `https://<your-app>.vercel.app` が発行される

## ③ Railwayに本番フロントを許可（CORS）

1. Railwayの APIサービス → **Variables** に追加：
   - `CLIENT_ORIGIN` = `https://<your-app>.vercel.app`
     （ローカルも使うなら `,http://localhost:5173` を末尾に追加）
2. 保存すると自動で再デプロイされる

---

## 動作確認

- `https://<your-app>.vercel.app` を開く
- ログイン画面が表示されるので、**新規登録**してログイン（登録時にそのユーザー用の初期データが自動生成される）
- 仕訳などが保存・表示できればOK
- うまくいかない時：ブラウザのコンソール（F12）でAPIエラーやCORSエラーを確認

## 補足

- 初回起動時にスキーマ作成が自動で走る（`ensureSchema` / `ensureInvoiceSchema`）。旧スキーマを検出した場合はデータをリセットして新スキーマで作り直す
- 初期データ（科目・会計年度・サンプル仕訳）は**ユーザー登録時にそのユーザー分が自動生成**される（グローバルなシードは廃止）
- DBの中身はRailwayのMySQLに保存される（ローカルとは別物）
- 環境変数 `.env` はGit管理外。各サービスのダッシュボードで設定する

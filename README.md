# 会計ソフト（複式簿記Webアプリ）

日本の複式簿記に対応した会計ソフトです。仕訳入力から財務諸表・決算処理まで、小規模事業の経理を一通りカバーします。

🌐 **公開URL: https://accounting-iota-two.vercel.app/**

---

## 主な機能

- **仕訳帳** … 複合仕訳（1取引で複数の借方・貸方）、消費税（税抜/税込）、補助科目、検索
- **総勘定元帳・補助元帳** … 科目別の取引明細と残高推移
- **試算表** … 期首/期末残高・カテゴリ合計・会計年度指定、CSV出力
- **財務諸表** … 貸借対照表（BS）・損益計算書（PL）
- **月次レポート** … 損益推移・科目別内訳のグラフ
- **決算・繰越処理** … 損益を利益剰余金へ振替、翌年度へ繰越
- **請求書** … 作成・ステータス管理
- **銀行明細取り込み** … CSVから仕訳を自動生成（ルール設定）
- **マスタ管理** … 勘定科目・補助科目・取引先・会計年度
- **バックアップ/リストア** … 全データのJSONエクスポート・インポート

## 技術スタック

| 領域 | 使用技術 |
|------|---------|
| フロントエンド | React 18, TypeScript, Vite, Recharts |
| バックエンド | Node.js, Express, TypeScript |
| データベース | MySQL |
| デプロイ | フロント: Vercel ／ API・DB: Railway |

## ローカル開発

```bash
# 依存インストール
npm install
npm install --prefix server

# DBセットアップ（MySQLが起動している前提）
npm run db:setup

# APIサーバー起動（http://localhost:3001）
npm run dev:server

# フロント起動（http://localhost:5173）
npm run dev
```

## デプロイ

Vercel（フロント）＋ Railway（API＋MySQL）構成。手順は [DEPLOY.md](DEPLOY.md) を参照。

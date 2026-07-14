import { defineConfig } from 'vitest/config'

// server専用のvitest設定。このファイルが無いとvitestが親ディレクトリの
// vite.config.ts(フロントエンド用)を読み込んでしまい、ルートの
// node_modulesが無いCI環境ではテストが起動できない。
export default defineConfig({
  test: {
    environment: 'node',
  },
})

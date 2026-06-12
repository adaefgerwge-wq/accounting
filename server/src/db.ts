import 'dotenv/config'
import mysql from 'mysql2/promise'

// 接続情報：本番(Railway等)は MYSQL_URL / DATABASE_URL の接続文字列を優先。
// 無ければ個別の DB_* 環境変数（ローカル開発向け）を使う。
const connectionUrl = process.env.MYSQL_URL ?? process.env.DATABASE_URL

interface DbConfig { host: string; port: number; user: string; password: string; database: string }

function parseConfig(): DbConfig {
  if (connectionUrl) {
    const u = new URL(connectionUrl)
    return {
      host: u.hostname,
      port: Number(u.port || 3306),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, '') || 'accounting',
    }
  }
  return {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'accounting',
  }
}

const config = parseConfig()
const database = config.database

export const pool = mysql.createPool({
  host: config.host,
  port: config.port,
  user: config.user,
  password: config.password,
  database,
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
})

// ローカル開発でDBが未作成の場合に作成する。
// 本番(マネージドDB)では作成権限が無い/既に存在するため、失敗しても無視する。
export async function createDatabaseIfNeeded() {
  try {
    const connection = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      multipleStatements: true,
    })
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    )
    await connection.end()
  } catch (e) {
    console.warn('createDatabaseIfNeeded をスキップ:', e instanceof Error ? e.message : e)
  }
}

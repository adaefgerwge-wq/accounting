import 'dotenv/config'
import mysql from 'mysql2/promise'

const database = process.env.DB_NAME ?? 'accounting'

export const pool = mysql.createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database,
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true
})

export async function createDatabaseIfNeeded() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    multipleStatements: true
  })

  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  )
  await connection.end()
}

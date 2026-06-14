import { createDatabaseIfNeeded } from './db.js'
import { pool } from './db.js'
import { ensureSchema, ensureInvoiceSchema } from './schema.js'

await createDatabaseIfNeeded()
await ensureSchema()
await ensureInvoiceSchema()
await pool.end()

// 初期データはユーザー登録時に各ユーザー分を生成する（グローバルseedは廃止）
console.log('Database is ready.')

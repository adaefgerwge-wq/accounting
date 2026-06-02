import { createDatabaseIfNeeded } from './db.js'
import { pool } from './db.js'
import { ensureSchema, seedIfEmpty } from './schema.js'

await createDatabaseIfNeeded()
await ensureSchema()
await seedIfEmpty()
await pool.end()

console.log('Database is ready.')

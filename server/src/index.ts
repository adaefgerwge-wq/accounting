import 'dotenv/config'
import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import { accountsRouter } from './routes/accounts.js'
import { journalsRouter } from './routes/journals.js'
import { partnersRouter } from './routes/partners.js'
import { stateRouter } from './routes/state.js'
import { createDatabaseIfNeeded } from './db.js'
import { ensureSchema, seedIfEmpty } from './schema.js'

const port = Number(process.env.PORT ?? 3001)
const app = express()

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }))
app.use(express.json())

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.use('/api/state', stateRouter)
app.use('/api/accounts', accountsRouter)
app.use('/api/partners', partnersRouter)
app.use('/api/journals', journalsRouter)

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ message: error instanceof Error ? error.message : 'Unexpected server error' })
}

app.use(errorHandler)

await createDatabaseIfNeeded()
await ensureSchema()
await seedIfEmpty()

app.listen(port, () => {
  console.log(`Accounting API listening on http://localhost:${port}`)
})

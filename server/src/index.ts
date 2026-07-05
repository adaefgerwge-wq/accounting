import 'dotenv/config'
import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import { accountsRouter }    from './routes/accounts.js'
import { journalsRouter }    from './routes/journals.js'
import { partnersRouter }    from './routes/partners.js'
import { subAccountsRouter } from './routes/sub-accounts.js'
import { stateRouter }       from './routes/state.js'
import { fiscalYearsRouter } from './routes/fiscal-years.js'
import { exportRouter }      from './routes/export.js'
import { restoreRouter }     from './routes/restore.js'
import { settingsRouter }    from './routes/settings.js'
import { recalculateRouter } from './routes/recalculate.js'
import { reportRouter }      from './routes/report.js'
import { invoicesRouter }    from './routes/invoices.js'
import { bankRulesRouter }   from './routes/bank-rules.js'
import { fixedAssetsRouter } from './routes/fixed-assets.js'
import { authRouter }         from './routes/auth.js'
import { requireAuth }        from './auth.js'
import { createDatabaseIfNeeded } from './db.js'
import { ensureSchema, ensureInvoiceSchema } from './schema.js'

const port = Number(process.env.PORT ?? 3001)
const app = express()

// CLIENT_ORIGIN はカンマ区切りで複数指定可（本番フロント＋ローカル）。
// 未設定ならローカル開発用のみ許可。
const allowedOrigins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
  .split(',').map(o => o.trim()).filter(Boolean)
app.use(cors({
  origin: (origin, callback) => {
    // 同一オリジン/サーバー間リクエスト(originなし)は許可
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    callback(new Error(`Not allowed by CORS: ${origin}`))
  },
}))
app.use(express.json({ limit: '50mb' }))

app.get('/api/health', (_req, res) => res.json({ ok: true }))

// 認証は requireAuth なし（ログイン前に叩くため）
app.use('/api/auth',         authRouter)

// 以降のデータAPIは全て認証必須（req.userId でテナント分離）
app.use('/api/state',        requireAuth, stateRouter)
app.use('/api/accounts',     requireAuth, accountsRouter)
app.use('/api/partners',     requireAuth, partnersRouter)
app.use('/api/sub-accounts', requireAuth, subAccountsRouter)
app.use('/api/journals',     requireAuth, journalsRouter)
app.use('/api/fiscal-years', requireAuth, fiscalYearsRouter)
app.use('/api/export',       requireAuth, exportRouter)
app.use('/api/restore',      requireAuth, restoreRouter)
app.use('/api/settings',     requireAuth, settingsRouter)
app.use('/api/recalculate',  requireAuth, recalculateRouter)
app.use('/api/report',       requireAuth, reportRouter)
app.use('/api/invoices',     requireAuth, invoicesRouter)
app.use('/api/bank-rules',   requireAuth, bankRulesRouter)
app.use('/api/fixed-assets', requireAuth, fixedAssetsRouter)

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ message: error instanceof Error ? error.message : 'Unexpected server error' })
}
app.use(errorHandler)

await createDatabaseIfNeeded()
await ensureSchema()
await ensureInvoiceSchema()

app.listen(port, () => console.log(`Accounting API listening on http://localhost:${port}`))

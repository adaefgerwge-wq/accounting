import { Router } from 'express'
import { pool } from '../db.js'
import { mapAccount, mapJournal, mapPartner, mapFiscalYear } from '../mappers.js'

export const stateRouter = Router()

stateRouter.get('/', async (_req, res, next) => {
  try {
    const [accountRows]    = await pool.query('SELECT * FROM accounts ORDER BY code')
    const [partnerRows]    = await pool.query('SELECT * FROM partners ORDER BY code')
    const [journalRows]    = await pool.query('SELECT * FROM journals ORDER BY date DESC, id DESC')
    const [fiscalYearRows] = await pool.query('SELECT * FROM fiscal_years ORDER BY start_date DESC')
    res.json({
      accounts:    (accountRows    as Parameters<typeof mapAccount>[0][]).map(mapAccount),
      partners:    (partnerRows    as Parameters<typeof mapPartner>[0][]).map(mapPartner),
      journals:    (journalRows    as Parameters<typeof mapJournal>[0][]).map(mapJournal),
      fiscalYears: (fiscalYearRows as Parameters<typeof mapFiscalYear>[0][]).map(mapFiscalYear),
    })
  } catch (e) { next(e) }
})

import { Router } from 'express'
import { pool } from '../db.js'
import { mapAccount, mapJournal, mapPartner } from '../mappers.js'

export const stateRouter = Router()

stateRouter.get('/', async (_req, res, next) => {
  try {
    const [accountRows] = await pool.query('SELECT * FROM accounts ORDER BY code')
    const [partnerRows] = await pool.query('SELECT * FROM partners ORDER BY code')
    const [journalRows] = await pool.query('SELECT * FROM journals ORDER BY date, id')

    res.json({
      accounts: (accountRows as Parameters<typeof mapAccount>[0][]).map(mapAccount),
      partners: (partnerRows as Parameters<typeof mapPartner>[0][]).map(mapPartner),
      journals: (journalRows as Parameters<typeof mapJournal>[0][]).map(mapJournal)
    })
  } catch (error) {
    next(error)
  }
})

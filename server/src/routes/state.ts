import { Router } from 'express'
import { pool } from '../db.js'
import { mapAccount, mapJournal, mapJournalLine, mapPartner, mapSubAccount, mapFiscalYear } from '../mappers.js'

export const stateRouter = Router()

stateRouter.get('/', async (req, res, next) => {
  try {
    const uid = req.userId
    const [accountRows]    = await pool.query('SELECT * FROM accounts WHERE user_id = ? ORDER BY code', [uid]) as any
    const [partnerRows]    = await pool.query('SELECT * FROM partners WHERE user_id = ? ORDER BY code', [uid]) as any
    const [subAccountRows] = await pool.query('SELECT * FROM sub_accounts WHERE user_id = ? ORDER BY account_code, code', [uid]) as any
    const [journalRows]    = await pool.query('SELECT * FROM journals WHERE user_id = ? ORDER BY date DESC, id DESC', [uid]) as any
    const [fiscalYearRows] = await pool.query('SELECT * FROM fiscal_years WHERE user_id = ? ORDER BY start_date DESC', [uid]) as any

    const journals = []
    if (journalRows.length) {
      const ids = journalRows.map((r: any) => r.id)
      const [lineRows] = await pool.query('SELECT * FROM journal_lines WHERE journal_id IN (?) ORDER BY id', [ids]) as any
      const linesByJournal = new Map<number, any[]>()
      for (const r of lineRows) {
        if (!linesByJournal.has(r.journal_id)) linesByJournal.set(r.journal_id, [])
        linesByJournal.get(r.journal_id)!.push(mapJournalLine(r))
      }
      for (const r of journalRows) journals.push(mapJournal(r, linesByJournal.get(r.id) ?? []))
    }

    res.json({
      accounts:    accountRows.map(mapAccount),
      partners:    partnerRows.map(mapPartner),
      subAccounts: subAccountRows.map(mapSubAccount),
      journals,
      fiscalYears: fiscalYearRows.map(mapFiscalYear),
    })
  } catch (e) { next(e) }
})

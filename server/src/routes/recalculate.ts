import { Router } from 'express'
import { pool } from '../db.js'
import { mapAccount, mapJournal, mapJournalLine } from '../mappers.js'
import { balanceSign } from '../balance.js'

export const recalculateRouter = Router()

recalculateRouter.post('/', async (_req, res, next) => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    await conn.query('UPDATE accounts SET balance = 0')

    const [jRows] = await conn.query('SELECT * FROM journals ORDER BY date, id') as any
    if (jRows.length) {
      const ids = jRows.map((r: any) => r.id)
      const [lRows] = await conn.query('SELECT * FROM journal_lines WHERE journal_id IN (?) ORDER BY id', [ids]) as any
      const linesByJournal = new Map<number, any[]>()
      for (const r of lRows) {
        if (!linesByJournal.has(r.journal_id)) linesByJournal.set(r.journal_id, [])
        linesByJournal.get(r.journal_id)!.push(r)
      }

      const codes = [...new Set(lRows.map((r: any) => r.account_code as string))]
      const [accRows] = await conn.query('SELECT code, type FROM accounts WHERE code IN (?)', [codes]) as any
      const typeOf = new Map<string, string>(accRows.map((r: any) => [r.code, r.type]))

      for (const jr of jRows) {
        const lines = linesByJournal.get(jr.id) ?? []
        for (const l of lines) {
          const delta = l.amount * balanceSign(typeOf.get(l.account_code), l.side)
          await conn.query('UPDATE accounts SET balance = balance + ? WHERE code = ?', [delta, l.account_code])
        }
      }
    }

    await conn.commit()

    const [accountRows] = await pool.query('SELECT * FROM accounts ORDER BY code') as any
    const [allJRows] = await pool.query('SELECT * FROM journals ORDER BY date DESC, id DESC') as any
    const journals = []
    if (allJRows.length) {
      const ids = allJRows.map((r: any) => r.id)
      const [lRows] = await pool.query('SELECT * FROM journal_lines WHERE journal_id IN (?) ORDER BY id', [ids]) as any
      const linesByJournal = new Map<number, any[]>()
      for (const r of lRows) {
        if (!linesByJournal.has(r.journal_id)) linesByJournal.set(r.journal_id, [])
        linesByJournal.get(r.journal_id)!.push(mapJournalLine(r))
      }
      for (const r of allJRows) journals.push(mapJournal(r, linesByJournal.get(r.id) ?? []))
    }

    res.json({
      message: `再計算完了（${allJRows.length}件の仕訳を処理）`,
      accounts: accountRows.map(mapAccount),
      journals,
    })
  } catch (e) { await conn.rollback(); next(e) } finally { conn.release() }
})

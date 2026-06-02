import { Router } from 'express'
import { pool } from '../db.js'

export const restoreRouter = Router()

restoreRouter.post('/', async (req, res, next) => {
  const { accounts, partners, journals, fiscalYears } = req.body
  if (!accounts || !partners || !journals || !fiscalYears) {
    res.status(400).json({ message: 'バックアップデータが不正です' }); return
  }
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    await conn.query('SET FOREIGN_KEY_CHECKS = 0')
    await conn.query('TRUNCATE TABLE journals')
    await conn.query('TRUNCATE TABLE partners')
    await conn.query('TRUNCATE TABLE accounts')
    await conn.query('TRUNCATE TABLE fiscal_years')
    await conn.query('SET FOREIGN_KEY_CHECKS = 1')

    if (fiscalYears.length) await conn.query(
      'INSERT INTO fiscal_years (id, name, start_date, end_date, closed) VALUES ?',
      [fiscalYears.map((f: any) => [f.id, f.name, f.start_date, f.end_date, f.closed])]
    )
    if (accounts.length) await conn.query(
      'INSERT INTO accounts (code, name, type, balance, has_sub) VALUES ?',
      [accounts.map((a: any) => [a.code, a.name, a.type, a.balance, a.has_sub])]
    )
    if (partners.length) await conn.query(
      'INSERT INTO partners (code, name, type, account_code) VALUES ?',
      [partners.map((p: any) => [p.code, p.name, p.type, p.account_code])]
    )
    if (journals.length) await conn.query(
      'INSERT INTO journals (id, fiscal_year_id, date, debit, debit_partner, credit, credit_partner, amount, tax_type, memo) VALUES ?',
      [journals.map((j: any) => [j.id, j.fiscal_year_id ?? 1, j.date, j.debit, j.debit_partner, j.credit, j.credit_partner, j.amount, j.tax_type ?? 'none', j.memo])]
    )

    await conn.commit()
    res.json({ message: 'リストア完了', counts: { fiscalYears: fiscalYears.length, accounts: accounts.length, partners: partners.length, journals: journals.length } })
  } catch (e) { await conn.rollback(); next(e) } finally { conn.release() }
})

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
    await conn.query('TRUNCATE TABLE journal_lines')
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
      'INSERT INTO accounts (code, name, type, balance, has_sub, default_tax_type) VALUES ?',
      [accounts.map((a: any) => [a.code, a.name, a.type, a.balance, a.has_sub, a.default_tax_type ?? 'none'])]
    )
    if (partners.length) await conn.query(
      'INSERT INTO partners (code, name, type, account_code) VALUES ?',
      [partners.map((p: any) => [p.code, p.name, p.type, p.account_code])]
    )
    // journals はネスト形式（lines を含む）または旧形式（debit/credit/amount）に対応
    for (const j of journals) {
      await conn.query(
        'INSERT INTO journals (id, fiscal_year_id, date, memo) VALUES (?,?,?,?)',
        [j.id, j.fiscal_year_id ?? 1, j.date, j.memo ?? '']
      )
      const lines: any[] = j.lines ?? []
      // 旧形式のバックアップ（lines がない場合）は debit/credit/amount から変換
      if (!lines.length && j.debit) {
        lines.push({ side: 'debit',  account_code: j.debit,  partner_code: j.debit_partner  ?? '', amount: j.amount, tax_type: j.tax_type ?? 'none' })
        lines.push({ side: 'credit', account_code: j.credit, partner_code: j.credit_partner ?? '', amount: j.amount, tax_type: 'none' })
      }
      if (lines.length) await conn.query(
        'INSERT INTO journal_lines (journal_id, side, account_code, partner_code, amount, tax_type) VALUES ?',
        [lines.map((l: any) => [j.id, l.side, l.account_code ?? l.accountCode, l.partner_code ?? l.partnerCode ?? '', l.amount, l.tax_type ?? l.taxType ?? 'none'])]
      )
    }

    await conn.commit()
    res.json({ message: 'リストア完了', counts: { fiscalYears: fiscalYears.length, accounts: accounts.length, partners: partners.length, journals: journals.length } })
  } catch (e) { await conn.rollback(); next(e) } finally { conn.release() }
})

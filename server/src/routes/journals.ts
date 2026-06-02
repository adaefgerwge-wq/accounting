import { Router } from 'express'
import { pool } from '../db.js'
import { mapAccount, mapJournal } from '../mappers.js'
import type { Journal } from '../types.js'

export const journalsRouter = Router()

async function validateJournal(journal: Omit<Journal, 'id'> | Journal) {
  const errors: string[] = []
  if (!journal.date) errors.push('日付を入力してください')
  if (!journal.amount || journal.amount <= 0) errors.push('正の金額を入力してください')
  if (journal.amount > 999999999) errors.push('金額が大きすぎます（上限: 999,999,999円）')
  if (!journal.debit || !journal.credit) errors.push('借方科目と貸方科目を選択してください')
  if (journal.debit && journal.credit && journal.debit === journal.credit) errors.push('借方と貸方に同じ科目は使えません')

  const [rows] = await pool.query('SELECT code, name, has_sub FROM accounts WHERE code IN (?, ?)', [journal.debit, journal.credit])
  const accounts = rows as Array<{ code: string; name: string; has_sub: 0|1|boolean }>
  const debit  = accounts.find(a => a.code === journal.debit)
  const credit = accounts.find(a => a.code === journal.credit)
  if (!debit)  errors.push('借方科目が見つかりません')
  if (!credit) errors.push('貸方科目が見つかりません')
  if (debit?.has_sub  && !journal.debitPartner)  errors.push(`${debit.name}の取引先を選択してください`)
  if (credit?.has_sub && !journal.creditPartner) errors.push(`${credit.name}の取引先を選択してください`)

  // 会計年度の範囲チェック
  if (journal.fiscalYearId) {
    const [fyRows] = await pool.query('SELECT start_date, end_date, closed FROM fiscal_years WHERE id = ?', [journal.fiscalYearId]) as any
    if (fyRows.length) {
      const fy = fyRows[0]
      if (fy.closed) errors.push('この会計年度は締め済みです')
      if (journal.date < String(fy.start_date).slice(0,10) || journal.date > String(fy.end_date).slice(0,10)) {
        errors.push('日付が会計年度の範囲外です')
      }
    }
  }
  return errors
}

async function readJournalState() {
  const [accountRows] = await pool.query('SELECT * FROM accounts ORDER BY code')
  const [journalRows] = await pool.query('SELECT * FROM journals ORDER BY date, id')
  return {
    accounts: (accountRows as Parameters<typeof mapAccount>[0][]).map(mapAccount),
    journals: (journalRows as Parameters<typeof mapJournal>[0][]).map(mapJournal)
  }
}

async function applyDelta(conn: any, j: Pick<Journal,'debit'|'credit'|'amount'>, sign: 1|-1) {
  await conn.query('UPDATE accounts SET balance = balance + ? WHERE code = ?', [j.amount * sign, j.debit])
  await conn.query('UPDATE accounts SET balance = balance + ? WHERE code = ?', [j.amount * sign, j.credit])
}

journalsRouter.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM journals ORDER BY date, id')
    res.json((rows as Parameters<typeof mapJournal>[0][]).map(mapJournal))
  } catch (e) { next(e) }
})

journalsRouter.post('/', async (req, res, next) => {
  const journal = req.body as Omit<Journal, 'id'>
  const conn = await pool.getConnection()
  try {
    const errors = await validateJournal(journal)
    if (errors.length) { res.status(400).json({ message: errors.join('\n') }); return }
    await conn.beginTransaction()
    await applyDelta(conn, journal, 1)
    await conn.query(
      'INSERT INTO journals (fiscal_year_id, date, debit, debit_partner, credit, credit_partner, amount, tax_type, memo) VALUES (?,?,?,?,?,?,?,?,?)',
      [journal.fiscalYearId ?? 1, journal.date, journal.debit, journal.debitPartner, journal.credit, journal.creditPartner, journal.amount, journal.taxType ?? 'none', journal.memo]
    )
    await conn.commit()
    res.status(201).json(await readJournalState())
  } catch (e) { await conn.rollback(); next(e) } finally { conn.release() }
})

journalsRouter.put('/:id', async (req, res, next) => {
  const journal = req.body as Journal
  const conn = await pool.getConnection()
  try {
    const errors = await validateJournal(journal)
    if (errors.length) { res.status(400).json({ message: errors.join('\n') }); return }
    await conn.beginTransaction()
    const [rows] = await conn.query('SELECT * FROM journals WHERE id = ? FOR UPDATE', [req.params.id])
    const [old] = (rows as Parameters<typeof mapJournal>[0][])
    if (!old) { await conn.rollback(); res.status(404).json({ message: '仕訳が見つかりません' }); return }
    await applyDelta(conn, mapJournal(old), -1)
    await applyDelta(conn, journal, 1)
    await conn.query(
      'UPDATE journals SET fiscal_year_id=?, date=?, debit=?, debit_partner=?, credit=?, credit_partner=?, amount=?, tax_type=?, memo=? WHERE id=?',
      [journal.fiscalYearId ?? 1, journal.date, journal.debit, journal.debitPartner, journal.credit, journal.creditPartner, journal.amount, journal.taxType ?? 'none', journal.memo, req.params.id]
    )
    await conn.commit()
    res.json(await readJournalState())
  } catch (e) { await conn.rollback(); next(e) } finally { conn.release() }
})

journalsRouter.delete('/:id', async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query('SELECT * FROM journals WHERE id = ? FOR UPDATE', [req.params.id])
    const [j] = (rows as Parameters<typeof mapJournal>[0][])
    if (j) { await applyDelta(conn, mapJournal(j), -1); await conn.query('DELETE FROM journals WHERE id = ?', [req.params.id]) }
    await conn.commit()
    res.json(await readJournalState())
  } catch (e) { await conn.rollback(); next(e) } finally { conn.release() }
})

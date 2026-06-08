import { Router } from 'express'
import { pool } from '../db.js'
import { mapAccount, mapJournal } from '../mappers.js'
import type { Journal } from '../types.js'
import { planTax } from '../tax.js'

export const journalsRouter = Router()

async function getTaxMethod(): Promise<'inclusive' | 'exclusive'> {
  const [rows] = await pool.query("SELECT value FROM settings WHERE key_name = 'tax_method'") as any
  return rows[0]?.value === 'exclusive' ? 'exclusive' : 'inclusive'
}

async function validateJournal(journal: Omit<Journal, 'id'> | Journal) {
  const errors: string[] = []
  if (!journal.date) errors.push('日付を入力してください')
  if (!journal.amount || journal.amount <= 0) errors.push('正の金額を入力してください')
  if (journal.amount > 999999999) errors.push('金額が大きすぎます（上限: 999,999,999円）')
  if (!journal.debit || !journal.credit) errors.push('借方科目と貸方科目を選択してください')
  if (journal.debit && journal.credit && journal.debit === journal.credit) errors.push('借方と貸方に同じ科目は使えません')

  const [rows] = await pool.query('SELECT code, name, has_sub, type FROM accounts WHERE code IN (?, ?)', [journal.debit, journal.credit])
  const accs = rows as Array<{ code: string; name: string; has_sub: 0|1|boolean; type: string }>
  const debit  = accs.find(a => a.code === journal.debit)
  const credit = accs.find(a => a.code === journal.credit)
  if (!debit)  errors.push('借方科目が見つかりません')
  if (!credit) errors.push('貸方科目が見つかりません')
  if (debit?.has_sub  && !journal.debitPartner)  errors.push(`${debit.name}の取引先を選択してください`)
  if (credit?.has_sub && !journal.creditPartner) errors.push(`${credit.name}の取引先を選択してください`)

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
  const [journalRows] = await pool.query('SELECT * FROM journals ORDER BY date DESC, id DESC')
  return {
    accounts: (accountRows as Parameters<typeof mapAccount>[0][]).map(mapAccount),
    journals: (journalRows as Parameters<typeof mapJournal>[0][]).map(mapJournal)
  }
}

async function applyDelta(conn: any, j: Pick<Journal,'debit'|'credit'|'amount'>, sign: 1|-1) {
  await conn.query('UPDATE accounts SET balance = balance + ? WHERE code = ?', [j.amount * sign, j.debit])
  await conn.query('UPDATE accounts SET balance = balance + ? WHERE code = ?', [j.amount * sign, j.credit])
}

// 税抜経理：課税科目を税込→税抜に補正し、消費税分を仮受/仮払消費税へ振り替える。
// 表示用の消費税仕訳（売上高 ／ 仮受消費税、または 仮払消費税 ／ 仕入高 等）を1本生成する。
// 相手勘定（普通預金・買掛金等の対象外科目）の金額には手を付けない。
async function applyTaxExclusive(conn: any, journal: Omit<Journal,'id'>, sign: 1|-1) {
  const { taxType, amount, date, fiscalYearId, memo, debit, credit } = journal
  const [dRows] = await conn.query('SELECT type FROM accounts WHERE code = ?', [debit]) as any
  const [cRows] = await conn.query('SELECT type FROM accounts WHERE code = ?', [credit]) as any
  const plan = planTax(debit, credit, dRows[0]?.type, cRows[0]?.type, taxType, amount)
  if (!plan) return

  const diff = plan.taxAmount * sign
  await conn.query('UPDATE accounts SET balance = balance - ? WHERE code = ?', [diff, plan.baseCode])
  await conn.query('UPDATE accounts SET balance = balance + ? WHERE code = ?', [diff, plan.taxCode])

  if (sign === 1) {
    await conn.query(
      'INSERT INTO journals (fiscal_year_id, date, debit, debit_partner, credit, credit_partner, amount, tax_type, memo) VALUES (?,?,?,?,?,?,?,?,?)',
      [fiscalYearId ?? 1, date, plan.taxDebit, '', plan.taxCredit, '', plan.taxAmount, 'none', `消費税: ${memo}`]
    )
  } else {
    // 取消・更新時は対応する消費税仕訳を1本削除
    await conn.query(
      'DELETE FROM journals WHERE memo = ? AND debit = ? AND credit = ? AND amount = ? LIMIT 1',
      [`消費税: ${memo}`, plan.taxDebit, plan.taxCredit, plan.taxAmount]
    )
  }
}

journalsRouter.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM journals ORDER BY date DESC, id DESC')
    res.json((rows as Parameters<typeof mapJournal>[0][]).map(mapJournal))
  } catch (e) { next(e) }
})

journalsRouter.post('/', async (req, res, next) => {
  const journal = req.body as Omit<Journal, 'id'>
  const conn = await pool.getConnection()
  try {
    const errors = await validateJournal(journal)
    if (errors.length) { res.status(400).json({ message: errors.join('\n') }); return }
    const taxMethod = await getTaxMethod()
    await conn.beginTransaction()
    await applyDelta(conn, journal, 1)
    await conn.query(
      'INSERT INTO journals (fiscal_year_id, date, debit, debit_partner, credit, credit_partner, amount, tax_type, memo) VALUES (?,?,?,?,?,?,?,?,?)',
      [journal.fiscalYearId ?? 1, journal.date, journal.debit, journal.debitPartner, journal.credit, journal.creditPartner, journal.amount, journal.taxType ?? 'none', journal.memo]
    )
    if (taxMethod === 'exclusive') await applyTaxExclusive(conn, journal, 1)
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
    const taxMethod = await getTaxMethod()
    await conn.beginTransaction()
    const [rows] = await conn.query('SELECT * FROM journals WHERE id = ? FOR UPDATE', [req.params.id])
    const [old] = (rows as Parameters<typeof mapJournal>[0][])
    if (!old) { await conn.rollback(); res.status(404).json({ message: '仕訳が見つかりません' }); return }
    const oldJournal = mapJournal(old)
    await applyDelta(conn, oldJournal, -1)
    if (taxMethod === 'exclusive') await applyTaxExclusive(conn, oldJournal, -1)
    await applyDelta(conn, journal, 1)
    await conn.query(
      'UPDATE journals SET fiscal_year_id=?, date=?, debit=?, debit_partner=?, credit=?, credit_partner=?, amount=?, tax_type=?, memo=? WHERE id=?',
      [journal.fiscalYearId ?? 1, journal.date, journal.debit, journal.debitPartner, journal.credit, journal.creditPartner, journal.amount, journal.taxType ?? 'none', journal.memo, req.params.id]
    )
    if (taxMethod === 'exclusive') await applyTaxExclusive(conn, journal, 1)
    await conn.commit()
    res.json(await readJournalState())
  } catch (e) { await conn.rollback(); next(e) } finally { conn.release() }
})

journalsRouter.delete('/:id', async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const taxMethod = await getTaxMethod()
    await conn.beginTransaction()
    const [rows] = await conn.query('SELECT * FROM journals WHERE id = ? FOR UPDATE', [req.params.id])
    const [j] = (rows as Parameters<typeof mapJournal>[0][])
    if (j) {
      const journal = mapJournal(j)
      await applyDelta(conn, journal, -1)
      if (taxMethod === 'exclusive') await applyTaxExclusive(conn, journal, -1)
      await conn.query('DELETE FROM journals WHERE id = ?', [req.params.id])
    }
    await conn.commit()
    res.json(await readJournalState())
  } catch (e) { await conn.rollback(); next(e) } finally { conn.release() }
})

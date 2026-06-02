import { Router } from 'express'
import { pool } from '../db.js'
import { mapAccount, mapJournal } from '../mappers.js'
import type { Journal } from '../types.js'

export const journalsRouter = Router()

async function validateJournal(journal: Omit<Journal, 'id'> | Journal) {
  const errors: string[] = []

  if (!journal.date) errors.push('日付を入力してください')
  if (!journal.amount || journal.amount <= 0) errors.push('正の金額を入力してください')
  if (!journal.debit || !journal.credit) errors.push('借方科目と貸方科目を選択してください')
  if (journal.debit && journal.credit && journal.debit === journal.credit) {
    errors.push('借方と貸方に同じ科目は使えません')
  }

  const [rows] = await pool.query('SELECT code, name, has_sub FROM accounts WHERE code IN (?, ?)', [journal.debit, journal.credit])
  const accounts = rows as Array<{ code: string; name: string; has_sub: 0 | 1 | boolean }>

  const debit = accounts.find(a => a.code === journal.debit)
  const credit = accounts.find(a => a.code === journal.credit)

  if (!debit) errors.push('借方科目が見つかりません')
  if (!credit) errors.push('貸方科目が見つかりません')
  if (debit?.has_sub && !journal.debitPartner) errors.push(`${debit.name}の取引先を選択してください`)
  if (credit?.has_sub && !journal.creditPartner) errors.push(`${credit.name}の取引先を選択してください`)

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

async function applyJournalDelta(
  connection: Awaited<ReturnType<typeof pool.getConnection>>,
  journal: Pick<Journal, 'debit' | 'credit' | 'amount'>,
  sign: 1 | -1
) {
  await connection.query('UPDATE accounts SET balance = balance + ? WHERE code = ?', [journal.amount * sign, journal.debit])
  await connection.query('UPDATE accounts SET balance = balance + ? WHERE code = ?', [journal.amount * sign, journal.credit])
}

journalsRouter.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM journals ORDER BY date, id')
    res.json((rows as Parameters<typeof mapJournal>[0][]).map(mapJournal))
  } catch (error) {
    next(error)
  }
})

journalsRouter.post('/', async (req, res, next) => {
  const journal = req.body as Omit<Journal, 'id'>
  const connection = await pool.getConnection()
  try {
    const errors = await validateJournal(journal)
    if (errors.length > 0) {
      res.status(400).json({ message: errors.join('\n') })
      return
    }

    await connection.beginTransaction()
    await applyJournalDelta(connection, journal, 1)
    await connection.query(
      'INSERT INTO journals (date, debit, debit_partner, credit, credit_partner, amount, memo) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [journal.date, journal.debit, journal.debitPartner, journal.credit, journal.creditPartner, journal.amount, journal.memo]
    )
    await connection.commit()
    res.status(201).json(await readJournalState())
  } catch (error) {
    await connection.rollback()
    next(error)
  } finally {
    connection.release()
  }
})

journalsRouter.put('/:id', async (req, res, next) => {
  const journal = req.body as Journal
  const connection = await pool.getConnection()
  try {
    const errors = await validateJournal(journal)
    if (errors.length > 0) {
      res.status(400).json({ message: errors.join('\n') })
      return
    }

    await connection.beginTransaction()
    const [rows] = await connection.query('SELECT * FROM journals WHERE id = ? FOR UPDATE', [req.params.id])
    const [oldJournal] = (rows as Parameters<typeof mapJournal>[0][])

    if (!oldJournal) {
      await connection.rollback()
      res.status(404).json({ message: 'Journal not found' })
      return
    }

    await applyJournalDelta(connection, mapJournal(oldJournal), -1)
    await applyJournalDelta(connection, journal, 1)
    await connection.query(
      'UPDATE journals SET date = ?, debit = ?, debit_partner = ?, credit = ?, credit_partner = ?, amount = ?, memo = ? WHERE id = ?',
      [journal.date, journal.debit, journal.debitPartner, journal.credit, journal.creditPartner, journal.amount, journal.memo, req.params.id]
    )

    await connection.commit()
    res.json(await readJournalState())
  } catch (error) {
    await connection.rollback()
    next(error)
  } finally {
    connection.release()
  }
})

journalsRouter.delete('/:id', async (req, res, next) => {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.query('SELECT * FROM journals WHERE id = ? FOR UPDATE', [req.params.id])
    const [journal] = (rows as Parameters<typeof mapJournal>[0][])

    if (journal) {
      await applyJournalDelta(connection, mapJournal(journal), -1)
      await connection.query('DELETE FROM journals WHERE id = ?', [req.params.id])
    }

    await connection.commit()
    res.json(await readJournalState())
  } catch (error) {
    await connection.rollback()
    next(error)
  } finally {
    connection.release()
  }
})

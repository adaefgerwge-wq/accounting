import { Router } from 'express'
import { pool } from '../db.js'
import { mapSubAccount } from '../mappers.js'
import type { SubAccount } from '../types.js'

export const subAccountsRouter = Router()

const fetchAll = async () => {
  const [rows] = await pool.query('SELECT * FROM sub_accounts ORDER BY account_code, code')
  return (rows as Parameters<typeof mapSubAccount>[0][]).map(mapSubAccount)
}

subAccountsRouter.get('/', async (_req, res, next) => {
  try { res.json(await fetchAll()) } catch (e) { next(e) }
})

subAccountsRouter.post('/', async (req, res, next) => {
  const s = req.body as SubAccount
  try {
    await pool.query(
      'INSERT INTO sub_accounts (code, name, account_code) VALUES (?, ?, ?)',
      [s.code, s.name, s.accountCode]
    )
    res.status(201).json(await fetchAll())
  } catch (e) { next(e) }
})

subAccountsRouter.put('/:code', async (req, res, next) => {
  const s = req.body as SubAccount
  try {
    const [result] = await pool.query(
      'UPDATE sub_accounts SET code = ?, name = ?, account_code = ? WHERE code = ?',
      [s.code, s.name, s.accountCode, req.params.code]
    ) as any
    if (result.affectedRows === 0) { res.status(404).json({ message: 'SubAccount not found' }); return }
    res.json(await fetchAll())
  } catch (e) { next(e) }
})

subAccountsRouter.delete('/:code', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM sub_accounts WHERE code = ?', [req.params.code])
    res.json(await fetchAll())
  } catch (e) { next(e) }
})

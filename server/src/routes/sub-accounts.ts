import { Router } from 'express'
import { pool } from '../db.js'
import { mapSubAccount } from '../mappers.js'
import type { SubAccount } from '../types.js'

export const subAccountsRouter = Router()

const fetchAll = async (userId: number) => {
  const [rows] = await pool.query('SELECT * FROM sub_accounts WHERE user_id = ? ORDER BY account_code, code', [userId])
  return (rows as Parameters<typeof mapSubAccount>[0][]).map(mapSubAccount)
}

subAccountsRouter.get('/', async (req, res, next) => {
  try { res.json(await fetchAll(req.userId)) } catch (e) { next(e) }
})

subAccountsRouter.post('/', async (req, res, next) => {
  const s = req.body as SubAccount
  try {
    await pool.query(
      'INSERT INTO sub_accounts (user_id, code, name, account_code) VALUES (?, ?, ?, ?)',
      [req.userId, s.code, s.name, s.accountCode]
    )
    res.status(201).json(await fetchAll(req.userId))
  } catch (e) { next(e) }
})

subAccountsRouter.put('/:code', async (req, res, next) => {
  const s = req.body as SubAccount
  try {
    const [result] = await pool.query(
      'UPDATE sub_accounts SET code = ?, name = ?, account_code = ? WHERE code = ? AND user_id = ?',
      [s.code, s.name, s.accountCode, req.params.code, req.userId]
    ) as any
    if (result.affectedRows === 0) { res.status(404).json({ message: 'SubAccount not found' }); return }
    res.json(await fetchAll(req.userId))
  } catch (e) { next(e) }
})

subAccountsRouter.delete('/:code', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM sub_accounts WHERE code = ? AND user_id = ?', [req.params.code, req.userId])
    res.json(await fetchAll(req.userId))
  } catch (e) { next(e) }
})

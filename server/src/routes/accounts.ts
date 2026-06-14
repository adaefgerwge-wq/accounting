import { Router } from 'express'
import { pool } from '../db.js'
import { mapAccount } from '../mappers.js'
import type { Account } from '../types.js'

export const accountsRouter = Router()

accountsRouter.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM accounts WHERE user_id = ? ORDER BY code', [req.userId])
    res.json((rows as Parameters<typeof mapAccount>[0][]).map(mapAccount))
  } catch (error) {
    next(error)
  }
})

accountsRouter.post('/', async (req, res, next) => {
  const account = req.body as Account
  try {
    await pool.query(
      'INSERT INTO accounts (user_id, code, name, type, balance, has_sub, default_tax_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.userId, account.code, account.name, account.type, account.balance, account.hasSub, account.defaultTaxType ?? 'none']
    )
    const [rows] = await pool.query('SELECT * FROM accounts WHERE user_id = ? ORDER BY code', [req.userId])
    res.status(201).json((rows as Parameters<typeof mapAccount>[0][]).map(mapAccount))
  } catch (error) {
    next(error)
  }
})

accountsRouter.put('/:code', async (req, res, next) => {
  const account = req.body as Account
  try {
    const [result] = await pool.query(
      'UPDATE accounts SET code = ?, name = ?, type = ?, balance = ?, has_sub = ?, default_tax_type = ? WHERE code = ? AND user_id = ?',
      [account.code, account.name, account.type, account.balance, account.hasSub, account.defaultTaxType ?? 'none', req.params.code, req.userId]
    )

    if ('affectedRows' in result && result.affectedRows === 0) {
      res.status(404).json({ message: 'Account not found' })
      return
    }

    const [rows] = await pool.query('SELECT * FROM accounts WHERE user_id = ? ORDER BY code', [req.userId])
    res.json((rows as Parameters<typeof mapAccount>[0][]).map(mapAccount))
  } catch (error) {
    next(error)
  }
})

accountsRouter.delete('/:code', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM accounts WHERE code = ? AND user_id = ?', [req.params.code, req.userId])
    const [rows] = await pool.query('SELECT * FROM accounts WHERE user_id = ? ORDER BY code', [req.userId])
    res.json((rows as Parameters<typeof mapAccount>[0][]).map(mapAccount))
  } catch (error) {
    next(error)
  }
})

import { Router } from 'express'
import { pool } from '../db.js'
import { mapPartner } from '../mappers.js'
import type { Partner } from '../types.js'

export const partnersRouter = Router()

partnersRouter.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM partners ORDER BY code')
    res.json((rows as Parameters<typeof mapPartner>[0][]).map(mapPartner))
  } catch (error) {
    next(error)
  }
})

partnersRouter.post('/', async (req, res, next) => {
  const partner = req.body as Partner
  try {
    await pool.query(
      'INSERT INTO partners (code, name, type, account_code) VALUES (?, ?, ?, ?)',
      [partner.code, partner.name, partner.type, partner.accountCode]
    )
    const [rows] = await pool.query('SELECT * FROM partners ORDER BY code')
    res.status(201).json((rows as Parameters<typeof mapPartner>[0][]).map(mapPartner))
  } catch (error) {
    next(error)
  }
})

partnersRouter.put('/:code', async (req, res, next) => {
  const partner = req.body as Partner
  try {
    const [result] = await pool.query(
      'UPDATE partners SET code = ?, name = ?, type = ?, account_code = ? WHERE code = ?',
      [partner.code, partner.name, partner.type, partner.accountCode, req.params.code]
    )

    if ('affectedRows' in result && result.affectedRows === 0) {
      res.status(404).json({ message: 'Partner not found' })
      return
    }

    const [rows] = await pool.query('SELECT * FROM partners ORDER BY code')
    res.json((rows as Parameters<typeof mapPartner>[0][]).map(mapPartner))
  } catch (error) {
    next(error)
  }
})

partnersRouter.delete('/:code', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM partners WHERE code = ?', [req.params.code])
    const [rows] = await pool.query('SELECT * FROM partners ORDER BY code')
    res.json((rows as Parameters<typeof mapPartner>[0][]).map(mapPartner))
  } catch (error) {
    next(error)
  }
})

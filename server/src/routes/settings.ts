import { Router } from 'express'
import { pool } from '../db.js'

export const settingsRouter = Router()

settingsRouter.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT key_name, value FROM settings WHERE user_id = ?', [req.userId]) as any
    const settings: Record<string, string> = {}
    for (const row of rows) settings[row.key_name] = row.value
    res.json(settings)
  } catch (e) { next(e) }
})

settingsRouter.put('/:key', async (req, res, next) => {
  try {
    await pool.query(
      'INSERT INTO settings (user_id, key_name, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = ?',
      [req.userId, req.params.key, req.body.value, req.body.value]
    )
    const [rows] = await pool.query('SELECT key_name, value FROM settings WHERE user_id = ?', [req.userId]) as any
    const settings: Record<string, string> = {}
    for (const row of rows) settings[row.key_name] = row.value
    res.json(settings)
  } catch (e) { next(e) }
})

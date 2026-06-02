import { Router } from 'express'
import { pool } from '../db.js'
import { mapFiscalYear } from '../mappers.js'

export const fiscalYearsRouter = Router()

fiscalYearsRouter.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM fiscal_years ORDER BY start_date DESC')
    res.json((rows as Parameters<typeof mapFiscalYear>[0][]).map(mapFiscalYear))
  } catch (e) { next(e) }
})

fiscalYearsRouter.post('/', async (req, res, next) => {
  const { name, startDate, endDate } = req.body
  if (!name || !startDate || !endDate) { res.status(400).json({ message: '必須項目が不足しています' }); return }
  try {
    const [result] = await pool.query(
      'INSERT INTO fiscal_years (name, start_date, end_date) VALUES (?, ?, ?)',
      [name, startDate, endDate]
    ) as any
    const [rows] = await pool.query('SELECT * FROM fiscal_years ORDER BY start_date DESC')
    res.status(201).json((rows as Parameters<typeof mapFiscalYear>[0][]).map(mapFiscalYear))
  } catch (e) { next(e) }
})

fiscalYearsRouter.put('/:id/close', async (req, res, next) => {
  try {
    await pool.query('UPDATE fiscal_years SET closed = 1 WHERE id = ?', [req.params.id])
    const [rows] = await pool.query('SELECT * FROM fiscal_years ORDER BY start_date DESC')
    res.json((rows as Parameters<typeof mapFiscalYear>[0][]).map(mapFiscalYear))
  } catch (e) { next(e) }
})

fiscalYearsRouter.delete('/:id', async (req, res, next) => {
  try {
    const [journals] = await pool.query('SELECT COUNT(*) AS count FROM journals WHERE fiscal_year_id = ?', [req.params.id]) as any
    if (journals[0].count > 0) { res.status(400).json({ message: 'この会計年度に仕訳があるため削除できません' }); return }
    await pool.query('DELETE FROM fiscal_years WHERE id = ?', [req.params.id])
    const [rows] = await pool.query('SELECT * FROM fiscal_years ORDER BY start_date DESC')
    res.json((rows as Parameters<typeof mapFiscalYear>[0][]).map(mapFiscalYear))
  } catch (e) { next(e) }
})

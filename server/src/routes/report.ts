import { Router } from 'express'
import { pool } from '../db.js'

export const reportRouter = Router()

// 月次PL集計
reportRouter.get('/monthly', async (req, res, next) => {
  try {
    const { fiscalYearId } = req.query
    const cond = fiscalYearId ? 'AND j.fiscal_year_id = ?' : ''
    // パラメータ順：accounts join の user_id → where の user_id → (任意) fiscalYearId
    const params: any[] = [req.userId, req.userId]
    if (fiscalYearId) params.push(fiscalYearId)

    const [rows] = await pool.query(`
      SELECT
        DATE_FORMAT(j.date, '%Y-%m') AS month,
        a.type                        AS account_type,
        l.side,
        SUM(l.amount)                 AS total
      FROM journal_lines l
      JOIN journals j  ON j.id = l.journal_id
      JOIN accounts a  ON a.code = l.account_code AND a.user_id = ?
      WHERE j.user_id = ? ${cond}
      GROUP BY month, a.type, l.side
      ORDER BY month
    `, params) as any

    const monthMap: Record<string, { revenue: number; expense: number }> = {}
    for (const row of rows) {
      const m = row.month
      if (!monthMap[m]) monthMap[m] = { revenue: 0, expense: 0 }
      if (row.account_type === 'revenue' && row.side === 'credit') monthMap[m].revenue += Number(row.total)
      if (row.account_type === 'expense' && row.side === 'debit')  monthMap[m].expense += Number(row.total)
    }

    res.json(Object.entries(monthMap).map(([month, v]) => ({
      month, revenue: v.revenue, expense: v.expense, profit: v.revenue - v.expense,
    })))
  } catch (e) { next(e) }
})

// 科目別月次推移
reportRouter.get('/monthly-accounts', async (req, res, next) => {
  try {
    const { fiscalYearId, type } = req.query
    // accounts join の user_id を先頭に
    const params: any[] = [req.userId]
    const conditions = ['j.user_id = ?']
    params.push(req.userId)
    if (fiscalYearId) { conditions.push('j.fiscal_year_id = ?'); params.push(fiscalYearId) }
    if (type)         { conditions.push('a.type = ?'); params.push(type) }

    const [rows] = await pool.query(`
      SELECT
        DATE_FORMAT(j.date, '%Y-%m') AS month,
        a.code, a.name, a.type,
        SUM(CASE WHEN l.side = 'debit'  THEN l.amount ELSE 0 END) AS debit_sum,
        SUM(CASE WHEN l.side = 'credit' THEN l.amount ELSE 0 END) AS credit_sum
      FROM journal_lines l
      JOIN journals j ON j.id = l.journal_id
      JOIN accounts a ON a.code = l.account_code AND a.user_id = ?
      WHERE ${conditions.join(' AND ')}
      GROUP BY month, a.code, a.name, a.type
      ORDER BY month, a.code
    `, params) as any

    res.json(rows.map((r: any) => ({
      month: r.month, code: r.code, name: r.name, type: r.type,
      debitSum: Number(r.debit_sum), creditSum: Number(r.credit_sum),
    })))
  } catch (e) { next(e) }
})

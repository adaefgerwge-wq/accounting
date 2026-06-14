import { Router } from 'express'
import { pool } from '../db.js'

export const bankRulesRouter = Router()

function toRow(r: any) {
  return { id: r.id, name: r.name, keyword: r.keyword, debitCode: r.debit_code, creditCode: r.credit_code, memoTpl: r.memo_tpl, priority: r.priority }
}

bankRulesRouter.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM bank_rules WHERE user_id = ? ORDER BY priority DESC, id', [req.userId]) as any
    res.json(rows.map(toRow))
  } catch(e) { next(e) }
})

bankRulesRouter.post('/', async (req, res, next) => {
  const { name, keyword, debitCode, creditCode, memoTpl = '', priority = 0 } = req.body
  try {
    await pool.query('INSERT INTO bank_rules (user_id, name, keyword, debit_code, credit_code, memo_tpl, priority) VALUES (?,?,?,?,?,?,?)',
      [req.userId, name, keyword, debitCode, creditCode, memoTpl, priority])
    const [rows] = await pool.query('SELECT * FROM bank_rules WHERE user_id = ? ORDER BY priority DESC, id', [req.userId]) as any
    res.status(201).json(rows.map(toRow))
  } catch(e) { next(e) }
})

bankRulesRouter.put('/:id', async (req, res, next) => {
  const { name, keyword, debitCode, creditCode, memoTpl = '', priority = 0 } = req.body
  try {
    await pool.query('UPDATE bank_rules SET name=?, keyword=?, debit_code=?, credit_code=?, memo_tpl=?, priority=? WHERE id=? AND user_id=?',
      [name, keyword, debitCode, creditCode, memoTpl, priority, req.params.id, req.userId])
    const [rows] = await pool.query('SELECT * FROM bank_rules WHERE user_id = ? ORDER BY priority DESC, id', [req.userId]) as any
    res.json(rows.map(toRow))
  } catch(e) { next(e) }
})

bankRulesRouter.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM bank_rules WHERE id = ? AND user_id = ?', [req.params.id, req.userId])
    const [rows] = await pool.query('SELECT * FROM bank_rules WHERE user_id = ? ORDER BY priority DESC, id', [req.userId]) as any
    res.json(rows.map(toRow))
  } catch(e) { next(e) }
})

// CSV取り込み＋自動仕訳プレビュー
bankRulesRouter.post('/match', async (req, res, next) => {
  try {
    const { rows, fiscalYearId = 1 } = req.body as { rows: { date: string; amount: number; description: string }[], fiscalYearId: number }
    const [rules] = await pool.query('SELECT * FROM bank_rules WHERE user_id = ? ORDER BY priority DESC, id', [req.userId]) as any

    const matched = rows.map((row) => {
      const rule = rules.find((r: any) => row.description.includes(r.keyword))
      return {
        ...row,
        ruleId:    rule?.id ?? null,
        ruleName:  rule?.name ?? null,
        debitCode: rule?.debit_code ?? '',
        creditCode:rule?.credit_code ?? '',
        memo:      rule ? rule.memo_tpl.replace('{description}', row.description) : row.description,
        fiscalYearId,
        matched: !!rule,
      }
    })
    res.json(matched)
  } catch(e) { next(e) }
})

import { Router } from 'express'
import { pool } from '../db.js'
import { mapJournal } from '../mappers.js'
import { planTax } from '../tax.js'

export const recalculateRouter = Router()

recalculateRouter.post('/', async (_req, res, next) => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    // 現在の経理方式を取得
    const [settingRows] = await conn.query("SELECT value FROM settings WHERE key_name = 'tax_method'") as any
    const taxMethod: 'inclusive' | 'exclusive' = settingRows[0]?.value === 'exclusive' ? 'exclusive' : 'inclusive'

    // 全科目の残高をゼロにリセット
    await conn.query('UPDATE accounts SET balance = 0')

    // 消費税自動仕訳（消費税: というprefixのもの）を削除
    await conn.query("DELETE FROM journals WHERE memo LIKE '消費税: %'")

    // 残った全仕訳を取得
    const [journalRows] = await conn.query('SELECT * FROM journals ORDER BY date, id') as any
    const journals = (journalRows as Parameters<typeof mapJournal>[0][]).map(mapJournal)

    for (const j of journals) {
      // 本体仕訳の残高を加算
      await conn.query('UPDATE accounts SET balance = balance + ? WHERE code = ?', [j.amount, j.debit])
      await conn.query('UPDATE accounts SET balance = balance + ? WHERE code = ?', [j.amount, j.credit])

      // 税抜経理の場合、消費税分を課税科目から仮受/仮払消費税へ振り替え、消費税仕訳を生成
      if (taxMethod === 'exclusive') {
        const [debitRow]  = await conn.query('SELECT type FROM accounts WHERE code = ?', [j.debit]) as any
        const [creditRow] = await conn.query('SELECT type FROM accounts WHERE code = ?', [j.credit]) as any
        const plan = planTax(j.debit, j.credit, debitRow[0]?.type, creditRow[0]?.type, j.taxType, j.amount)
        if (!plan) continue

        // 課税科目（売上高 / 仕入高・備品 等）を税込→税抜に補正
        await conn.query('UPDATE accounts SET balance = balance - ? WHERE code = ?', [plan.taxAmount, plan.baseCode])
        await conn.query('UPDATE accounts SET balance = balance + ? WHERE code = ?', [plan.taxAmount, plan.taxCode])
        // 表示用の消費税仕訳（売上高 ／ 仮受消費税、または 仮払消費税 ／ 仕入高 等）
        await conn.query(
          'INSERT INTO journals (fiscal_year_id, date, debit, debit_partner, credit, credit_partner, amount, tax_type, memo) VALUES (?,?,?,?,?,?,?,?,?)',
          [j.fiscalYearId, j.date, plan.taxDebit, '', plan.taxCredit, '', plan.taxAmount, 'none', `消費税: ${j.memo}`]
        )
      }
    }

    await conn.commit()

    const [accountRows] = await pool.query('SELECT * FROM accounts ORDER BY code') as any
    const [allJournals] = await pool.query('SELECT * FROM journals ORDER BY date DESC, id DESC') as any
    res.json({
      message: `再計算完了（${journals.length}件の仕訳を処理）`,
      accounts: accountRows,
      journals: (allJournals as Parameters<typeof mapJournal>[0][]).map(mapJournal),
    })
  } catch (e) { await conn.rollback(); next(e) } finally { conn.release() }
})

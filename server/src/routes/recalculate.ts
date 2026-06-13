import { Router } from 'express'
import { pool } from '../db.js'
import { mapAccount, mapJournal, mapJournalLine } from '../mappers.js'
import { planTax, calcTax, TAX_DEBIT_CODE, TAX_CREDIT_CODE } from '../tax.js'
import { balanceSign } from '../balance.js'
import type { JournalLine } from '../types.js'

export const recalculateRouter = Router()

const TAX_CODES = new Set([TAX_DEBIT_CODE, TAX_CREDIT_CODE])

recalculateRouter.post('/', async (_req, res, next) => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    // 経理方式を取得
    const [settingRows] = await conn.query("SELECT value FROM settings WHERE key_name = 'tax_method'") as any
    const taxMethod: 'inclusive' | 'exclusive' = settingRows[0]?.value === 'exclusive' ? 'exclusive' : 'inclusive'

    // 全残高リセット
    await conn.query('UPDATE accounts SET balance = 0')

    const [jRows] = await conn.query('SELECT * FROM journals ORDER BY date, id') as any
    if (jRows.length) {
      const ids = jRows.map((r: any) => r.id)
      const [lRows] = await conn.query('SELECT * FROM journal_lines WHERE journal_id IN (?) ORDER BY id', [ids]) as any

      const allCodes = [...new Set(lRows.map((r: any) => r.account_code as string))]
      const typeOf = new Map<string, string>()
      typeOf.set(TAX_DEBIT_CODE, 'asset')
      typeOf.set(TAX_CREDIT_CODE, 'liability')
      if (allCodes.length) {
        const [accRows] = await conn.query('SELECT code, type FROM accounts WHERE code IN (?)', [allCodes]) as any
        for (const r of accRows) typeOf.set(r.code, r.type)
      }

      const linesByJournal = new Map<number, any[]>()
      for (const r of lRows) {
        if (!linesByJournal.has(r.journal_id)) linesByJournal.set(r.journal_id, [])
        linesByJournal.get(r.journal_id)!.push(r)
      }

      // 全仕訳ぶんの新明細と残高差分をメモリに溜め、最後に一括反映する
      const allNewLines: any[] = []
      const balanceDeltas = new Map<string, number>()

      for (const jr of jRows) {
        const rawLines: any[] = linesByJournal.get(jr.id) ?? []

        // 本体行（消費税科目以外）と消費税行に分離
        const baseLines = rawLines.filter((l: any) => !TAX_CODES.has(l.account_code))
        const taxLines  = rawLines.filter((l: any) =>  TAX_CODES.has(l.account_code))

        let finalLines: Omit<JournalLine, 'id' | 'journalId'>[]

        if (taxMethod === 'exclusive') {
          // ── 税抜モード：本体行を税抜金額にして消費税行を再生成 ──
          // 既に消費税行がある場合は同side分を加算して税込金額に戻してから分割（2重分割防止）
          const existingTaxBySide = new Map<string, number>()
          for (const tl of taxLines) {
            existingTaxBySide.set(tl.side, (existingTaxBySide.get(tl.side) ?? 0) + tl.amount)
          }

          finalLines = []
          for (const l of baseLines) {
            // 既に税抜済みなら税込金額に戻す
            const inclusiveAmount = l.amount + (existingTaxBySide.get(l.side) ?? 0)
            const { taxAmount } = calcTax(inclusiveAmount, l.tax_type)
            if (!taxAmount) {
              finalLines.push({ side: l.side, accountCode: l.account_code, partnerCode: l.partner_code, amount: inclusiveAmount, taxType: l.tax_type })
              continue
            }
            const accType = typeOf.get(l.account_code)
            const plan = planTax(
              l.side === 'debit'  ? l.account_code : '__other__',
              l.side === 'credit' ? l.account_code : '__other__',
              l.side === 'debit'  ? accType : undefined,
              l.side === 'credit' ? accType : undefined,
              l.tax_type, inclusiveAmount
            )
            if (!plan) {
              finalLines.push({ side: l.side, accountCode: l.account_code, partnerCode: l.partner_code, amount: inclusiveAmount, taxType: l.tax_type })
              continue
            }
            // 課税行を税抜金額に補正
            finalLines.push({ side: l.side, accountCode: l.account_code, partnerCode: l.partner_code, amount: inclusiveAmount - plan.taxAmount, taxType: l.tax_type })
            // 消費税行を追加
            finalLines.push({ side: l.side, accountCode: plan.taxCode, partnerCode: '', amount: plan.taxAmount, taxType: 'none' })
          }
        } else {
          // ── 税込モード：消費税行を削除し、本体行を税込金額に戻す ──
          // 同じsideの消費税行合計を本体行に加算して税込金額を復元
          const taxBySide = new Map<string, number>()
          for (const tl of taxLines) {
            taxBySide.set(tl.side, (taxBySide.get(tl.side) ?? 0) + tl.amount)
          }

          finalLines = baseLines.map((l: any) => {
            const hasTaxLine = taxLines.some((tl: any) => tl.side === l.side)
            const restoredAmount = hasTaxLine ? l.amount + (taxBySide.get(l.side) ?? 0) : l.amount
            return { side: l.side, accountCode: l.account_code, partnerCode: l.partner_code, amount: restoredAmount, taxType: l.tax_type }
          })
        }

        // この仕訳の新明細と残高差分を蓄積（個別クエリは投げない）
        for (const l of finalLines) {
          allNewLines.push([jr.id, l.side, l.accountCode, l.partnerCode, l.amount, l.taxType])
          const delta = l.amount * balanceSign(typeOf.get(l.accountCode), l.side)
          balanceDeltas.set(l.accountCode, (balanceDeltas.get(l.accountCode) ?? 0) + delta)
        }
      }

      // 全明細を一括で差し替え（DELETE/INSERTを各1回に）
      const allIds = jRows.map((r: any) => r.id)
      await conn.query('DELETE FROM journal_lines WHERE journal_id IN (?)', [allIds])
      if (allNewLines.length) {
        await conn.query(
          'INSERT INTO journal_lines (journal_id, side, account_code, partner_code, amount, tax_type) VALUES ?',
          [allNewLines]
        )
      }
      // 残高は科目ごとに1回だけUPDATE
      for (const [code, delta] of balanceDeltas) {
        await conn.query('UPDATE accounts SET balance = balance + ? WHERE code = ?', [delta, code])
      }
    }

    await conn.commit()

    // レスポンス用に最新データ取得
    const [accountRows] = await pool.query('SELECT * FROM accounts ORDER BY code') as any
    const [allJRows] = await pool.query('SELECT * FROM journals ORDER BY date DESC, id DESC') as any
    const journals = []
    if (allJRows.length) {
      const ids = allJRows.map((r: any) => r.id)
      const [lRows] = await pool.query('SELECT * FROM journal_lines WHERE journal_id IN (?) ORDER BY id', [ids]) as any
      const linesByJournal = new Map<number, any[]>()
      for (const r of lRows) {
        if (!linesByJournal.has(r.journal_id)) linesByJournal.set(r.journal_id, [])
        linesByJournal.get(r.journal_id)!.push(mapJournalLine(r))
      }
      for (const r of allJRows) journals.push(mapJournal(r, linesByJournal.get(r.id) ?? []))
    }

    res.json({
      message: `再計算完了（${allJRows.length}件の仕訳を処理、モード: ${taxMethod === 'exclusive' ? '税抜' : '税込'}）`,
      accounts: accountRows.map(mapAccount),
      journals,
    })
  } catch (e) { await conn.rollback(); next(e) } finally { conn.release() }
})

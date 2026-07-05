import { Router } from 'express'
import { pool } from '../db.js'
import { mapAccount, mapJournal, mapJournalLine } from '../mappers.js'
import type { Journal, JournalLine } from '../types.js'
import {
  applyLines, splitTaxLines, insertJournal, recordJournalHistory,
} from '../journal-service.js'

export const journalsRouter = Router()

async function getTaxMethod(userId: number): Promise<'inclusive' | 'exclusive'> {
  const [rows] = await pool.query("SELECT value FROM settings WHERE key_name = 'tax_method' AND user_id = ?", [userId]) as any
  return rows[0]?.value === 'exclusive' ? 'exclusive' : 'inclusive'
}

// journal_lines 全件を取得して Journal[] に組み立てる（ユーザーでスコープ）
async function fetchJournals(userId: number, conn?: any): Promise<Journal[]> {
  const q = conn ?? pool
  const [jRows] = await q.query('SELECT * FROM journals WHERE user_id = ? ORDER BY date DESC, id DESC', [userId]) as any
  if (!jRows.length) return []
  const ids = jRows.map((r: any) => r.id)
  const [lRows] = await q.query('SELECT * FROM journal_lines WHERE journal_id IN (?) ORDER BY id', [ids]) as any
  const linesByJournal = new Map<number, JournalLine[]>()
  for (const r of lRows) {
    const l = mapJournalLine(r)
    if (!linesByJournal.has(l.journalId)) linesByJournal.set(l.journalId, [])
    linesByJournal.get(l.journalId)!.push(l)
  }
  return jRows.map((r: any) => mapJournal(r, linesByJournal.get(r.id) ?? []))
}

async function readState(userId: number, conn?: any) {
  const q = conn ?? pool
  const [accountRows] = await q.query('SELECT * FROM accounts WHERE user_id = ? ORDER BY code', [userId]) as any
  return {
    accounts: accountRows.map(mapAccount),
    journals: await fetchJournals(userId, conn),
  }
}

// 対象仕訳を取得（所有チェック込み）。なければ null。
async function getOwnedJournal(conn: any, id: string, userId: number) {
  const [rows] = await conn.query('SELECT * FROM journals WHERE id = ? AND user_id = ?', [id, userId]) as any
  return rows[0] ?? null
}

// 対象年度が締め済みかどうか
async function isFiscalYearClosed(conn: any, fiscalYearId: number, userId: number): Promise<boolean> {
  const [rows] = await conn.query('SELECT closed FROM fiscal_years WHERE id = ? AND user_id = ?', [fiscalYearId, userId]) as any
  return Boolean(rows[0]?.closed)
}

async function validateJournalInput(userId: number, fiscalYearId: number, date: string, _memo: string, lines: any[]) {
  const errors: string[] = []
  if (!date) errors.push('日付を入力してください')
  if (!lines || lines.length < 2) errors.push('明細行は2行以上必要です')
  if (!lines?.length) return errors

  const debitTotal  = lines.filter((l: any) => l.side === 'debit') .reduce((s: number, l: any) => s + (l.amount||0), 0)
  const creditTotal = lines.filter((l: any) => l.side === 'credit').reduce((s: number, l: any) => s + (l.amount||0), 0)
  if (debitTotal !== creditTotal) errors.push(`借方合計(${debitTotal.toLocaleString()})と貸方合計(${creditTotal.toLocaleString()})が一致しません`)
  if (lines.some((l: any) => !l.amount || l.amount <= 0)) errors.push('金額は正の数を入力してください')
  if (lines.some((l: any) => !l.accountCode)) errors.push('すべての行に科目を指定してください')

  const codes = [...new Set(lines.map((l: any) => l.accountCode as string))].filter(Boolean)
  if (codes.length) {
    const [accRows] = await pool.query('SELECT code, name, has_sub FROM accounts WHERE code IN (?) AND user_id = ?', [codes, userId]) as any
    const accMap = new Map<string, any>(accRows.map((a: any) => [a.code, a]))
    // 補助科目の候補（取引先＋汎用補助科目）が存在する科目コードの集合
    const [subRows] = await pool.query(
      'SELECT account_code FROM partners WHERE user_id = ? AND account_code IN (?) UNION SELECT account_code FROM sub_accounts WHERE user_id = ? AND account_code IN (?)',
      [userId, codes, userId, codes]
    ) as any
    const hasCandidates = new Set<string>((subRows as any[]).map((r: any) => r.account_code))
    for (const l of lines) {
      if (!l.accountCode) continue
      if (!accMap.has(l.accountCode)) { errors.push(`科目コード ${l.accountCode} が見つかりません`); continue }
      const acc = accMap.get(l.accountCode)!
      // 候補が1件以上ある場合のみ補助科目を必須にする（候補ゼロなら任意）
      if (acc.has_sub && hasCandidates.has(l.accountCode) && !l.partnerCode) {
        errors.push(`${acc.name}の補助科目（取引先）を指定してください`)
      }
    }
  }

  // 会計年度は必須。自分の年度として実在しなければエラー（他ユーザーの年度IDは通さない）
  if (!fiscalYearId) {
    errors.push('会計年度を指定してください')
  } else {
    const [fyRows] = await pool.query('SELECT start_date, end_date, closed FROM fiscal_years WHERE id = ? AND user_id = ?', [fiscalYearId, userId]) as any
    if (!fyRows.length) {
      errors.push('指定された会計年度が見つかりません')
    } else {
      const fy = fyRows[0]
      if (fy.closed) errors.push('この会計年度は締め済みです')
      if (date && (date < String(fy.start_date).slice(0,10) || date > String(fy.end_date).slice(0,10)))
        errors.push('日付が会計年度の範囲外です')
    }
  }
  return errors
}

journalsRouter.get('/', async (req, res, next) => {
  try { res.json(await fetchJournals(req.userId)) } catch (e) { next(e) }
})

// 監査証跡：この仕訳の変更履歴（削除済み仕訳のIDでも参照可能）
journalsRouter.get('/:id/history', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, journal_id, action, snapshot, created_at FROM journal_history WHERE journal_id = ? AND user_id = ? ORDER BY id DESC',
      [req.params.id, req.userId]
    ) as any
    res.json(rows.map((r: any) => ({
      id: r.id,
      journalId: r.journal_id,
      action: r.action,
      snapshot: typeof r.snapshot === 'string' ? JSON.parse(r.snapshot) : r.snapshot,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    })))
  } catch (e) { next(e) }
})

journalsRouter.post('/', async (req, res, next) => {
  const { fiscalYearId, date, memo, lines } = req.body
  const conn = await pool.getConnection()
  try {
    const errors = await validateJournalInput(req.userId, fiscalYearId, date, memo, lines)
    if (errors.length) { res.status(400).json({ message: errors.join('\n') }); return }

    const taxMethod = await getTaxMethod(req.userId)
    await conn.beginTransaction()

    const finalLines = taxMethod === 'exclusive' ? await splitTaxLines(lines, req.userId, conn) : lines
    const journalId = await insertJournal(conn, req.userId, {
      fiscalYearId, date, memo: memo ?? '', kind: 'normal', lines: finalLines,
    })
    await recordJournalHistory(conn, req.userId, journalId, 'create', {
      fiscalYearId, date, memo: memo ?? '', kind: 'normal', lines: finalLines,
    })
    await conn.commit()
    res.status(201).json(await readState(req.userId))
  } catch (e) { await conn.rollback(); next(e) } finally { conn.release() }
})

journalsRouter.put('/:id', async (req, res, next) => {
  const { fiscalYearId, date, memo, lines } = req.body
  const conn = await pool.getConnection()
  try {
    const errors = await validateJournalInput(req.userId, fiscalYearId, date, memo, lines)
    if (errors.length) { res.status(400).json({ message: errors.join('\n') }); return }

    const taxMethod = await getTaxMethod(req.userId)
    await conn.beginTransaction()

    const journal = await getOwnedJournal(conn, req.params.id, req.userId)
    if (!journal) {
      await conn.rollback(); res.status(404).json({ message: '仕訳が見つかりません' }); return
    }
    if (journal.kind === 'adjusting' || journal.kind === 'closing') {
      await conn.rollback(); res.status(400).json({ message: '決算処理で作成された仕訳は直接編集できません。決算を取り消してください' }); return
    }
    // 移動元の年度が締め済みの場合も編集不可
    if (await isFiscalYearClosed(conn, journal.fiscal_year_id, req.userId)) {
      await conn.rollback(); res.status(400).json({ message: 'この仕訳の会計年度は締め済みです' }); return
    }

    // 旧 lines を取得して残高を逆算し、履歴に旧状態を記録
    const [oldLineRows] = await conn.query('SELECT * FROM journal_lines WHERE journal_id = ?', [req.params.id]) as any
    const oldLines = oldLineRows.map(mapJournalLine)
    await recordJournalHistory(conn, req.userId, journal.id, 'update', {
      fiscalYearId: journal.fiscal_year_id, date: String(journal.date).slice(0,10),
      memo: journal.memo, kind: journal.kind, lines: oldLines,
    })
    await applyLines(conn, req.userId, oldLines, -1)

    // ヘッダー更新 + 旧 lines 削除 + 新 lines 挿入（kind は維持：開始仕訳は開始仕訳のまま）
    await conn.query('UPDATE journals SET fiscal_year_id=?, date=?, memo=? WHERE id=? AND user_id=?',
      [fiscalYearId, date, memo ?? '', req.params.id, req.userId])
    await conn.query('DELETE FROM journal_lines WHERE journal_id = ?', [req.params.id])

    const finalLines = taxMethod === 'exclusive' ? await splitTaxLines(lines, req.userId, conn) : lines
    if (finalLines.length) {
      await conn.query(
        'INSERT INTO journal_lines (journal_id, side, account_code, partner_code, amount, tax_type) VALUES ?',
        [finalLines.map((l: any) => [req.params.id, l.side, l.accountCode, l.partnerCode ?? '', l.amount, l.taxType ?? 'none'])]
      )
    }
    await applyLines(conn, req.userId, finalLines, 1)
    await conn.commit()
    res.json(await readState(req.userId))
  } catch (e) { await conn.rollback(); next(e) } finally { conn.release() }
})

journalsRouter.delete('/:id', async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const journal = await getOwnedJournal(conn, req.params.id, req.userId)
    if (!journal) {
      await conn.rollback(); res.status(404).json({ message: '仕訳が見つかりません' }); return
    }
    if (journal.kind === 'adjusting' || journal.kind === 'closing') {
      await conn.rollback(); res.status(400).json({ message: '決算処理で作成された仕訳は直接削除できません。決算を取り消してください' }); return
    }
    if (await isFiscalYearClosed(conn, journal.fiscal_year_id, req.userId)) {
      await conn.rollback(); res.status(400).json({ message: 'この仕訳の会計年度は締め済みです' }); return
    }

    const [lineRows] = await conn.query('SELECT * FROM journal_lines WHERE journal_id = ?', [req.params.id]) as any
    const oldLines = lineRows.map(mapJournalLine)
    await recordJournalHistory(conn, req.userId, journal.id, 'delete', {
      fiscalYearId: journal.fiscal_year_id, date: String(journal.date).slice(0,10),
      memo: journal.memo, kind: journal.kind, lines: oldLines,
    })
    await applyLines(conn, req.userId, oldLines, -1)
    await conn.query('DELETE FROM journals WHERE id = ? AND user_id = ?', [req.params.id, req.userId]) // CASCADE で lines も削除
    // 請求書からのリンクを解除（再連動できるようにする）
    await conn.query('UPDATE invoices SET sales_journal_id = NULL WHERE user_id = ? AND sales_journal_id = ?', [req.userId, req.params.id])
    await conn.query('UPDATE invoices SET payment_journal_id = NULL WHERE user_id = ? AND payment_journal_id = ?', [req.userId, req.params.id])
    await conn.commit()
    res.json(await readState(req.userId))
  } catch (e) { await conn.rollback(); next(e) } finally { conn.release() }
})

// 仕訳の作成・残高反映・履歴記録の共有ロジック。
// journals ルート、請求書の仕訳連動、決算処理から共用する。

import { balanceSign } from './balance.js'
import { calcTax, planTax } from './tax.js'
import type { JournalLine } from './types.js'
import type { JournalKind } from './domain/reporting.js'

type LineInput = Pick<JournalLine, 'side' | 'accountCode' | 'partnerCode' | 'amount' | 'taxType'>

/** 残高キャッシュに lines の増減を適用（sign=1で加算、-1で打ち消し） */
export async function applyLines(
  conn: any, userId: number,
  lines: Pick<JournalLine, 'side' | 'accountCode' | 'amount'>[], sign: 1 | -1,
) {
  if (!lines.length) return
  const codes = [...new Set(lines.map(l => l.accountCode))]
  const [rows] = await conn.query('SELECT code, type FROM accounts WHERE code IN (?) AND user_id = ?', [codes, userId]) as any
  const typeOf = new Map<string, string>(rows.map((r: any) => [r.code, r.type]))
  const deltas = new Map<string, number>()
  for (const l of lines) {
    const delta = l.amount * sign * balanceSign(typeOf.get(l.accountCode), l.side)
    deltas.set(l.accountCode, (deltas.get(l.accountCode) ?? 0) + delta)
  }
  for (const [code, delta] of deltas) {
    await conn.query('UPDATE accounts SET balance = balance + ? WHERE code = ? AND user_id = ?', [delta, code, userId])
  }
}

/** 税抜モード：課税行を税抜金額に分割し、消費税行を追加して返す */
export async function splitTaxLines(lines: LineInput[], userId: number, conn: any): Promise<LineInput[]> {
  const result: LineInput[] = []
  for (const line of lines) {
    const { taxAmount } = calcTax(line.amount, line.taxType)
    if (!taxAmount) { result.push(line); continue }

    const [accRows] = await conn.query('SELECT type FROM accounts WHERE code = ? AND user_id = ?', [line.accountCode, userId]) as any
    const accType = accRows[0]?.type as string | undefined
    const plan = planTax(
      line.side === 'debit'  ? line.accountCode : '__other__',
      line.side === 'credit' ? line.accountCode : '__other__',
      line.side === 'debit'  ? accType : undefined,
      line.side === 'credit' ? accType : undefined,
      line.taxType, line.amount,
    )
    if (!plan) { result.push(line); continue }

    result.push({ ...line, amount: line.amount - taxAmount })
    result.push({ side: line.side, accountCode: plan.taxCode, partnerCode: '', amount: taxAmount, taxType: 'none' })
  }
  return result
}

export interface JournalInput {
  fiscalYearId: number
  date: string
  memo: string
  kind: JournalKind
  lines: LineInput[]
}

/**
 * 仕訳ヘッダーと明細を挿入し、残高キャッシュへ反映する。
 * トランザクション中の conn 上で呼ぶこと。税抜分割は呼び出し側で済ませる。
 */
export async function insertJournal(conn: any, userId: number, input: JournalInput): Promise<number> {
  const [result] = await conn.query(
    'INSERT INTO journals (user_id, fiscal_year_id, date, memo, kind) VALUES (?,?,?,?,?)',
    [userId, input.fiscalYearId, input.date, input.memo, input.kind],
  ) as any
  const journalId = result.insertId
  if (input.lines.length) {
    await conn.query(
      'INSERT INTO journal_lines (journal_id, side, account_code, partner_code, amount, tax_type) VALUES ?',
      [input.lines.map(l => [journalId, l.side, l.accountCode, l.partnerCode ?? '', l.amount, l.taxType ?? 'none'])],
    )
  }
  await applyLines(conn, userId, input.lines, 1)
  return journalId
}

/** 監査証跡：仕訳の作成・更新・削除時のスナップショットを記録する */
export async function recordJournalHistory(
  conn: any, userId: number, journalId: number,
  action: 'create' | 'update' | 'delete',
  snapshot: { fiscalYearId: number; date: string; memo: string; kind: string; lines: LineInput[] },
) {
  await conn.query(
    'INSERT INTO journal_history (user_id, journal_id, action, snapshot) VALUES (?,?,?,?)',
    [userId, journalId, action, JSON.stringify(snapshot)],
  )
}

/** 指定コードの科目がなければ作成して返す（決算処理で使う専用科目の自動作成用） */
export async function ensureAccount(
  conn: any, userId: number,
  code: string, name: string, type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense',
): Promise<string> {
  const [rows] = await conn.query('SELECT code FROM accounts WHERE user_id = ? AND code = ?', [userId, code]) as any
  if (!rows.length) {
    await conn.query(
      'INSERT INTO accounts (user_id, code, name, type, balance, has_sub, default_tax_type) VALUES (?,?,?,?,0,false,?)',
      [userId, code, name, type, 'none'],
    )
  }
  return code
}

/** 全科目残高を journal_lines から再計算する（ユーザー単位・conn のトランザクション内で実行） */
export async function recomputeBalances(conn: any, userId: number) {
  await conn.query('UPDATE accounts SET balance = 0 WHERE user_id = ?', [userId])
  const [accRows] = await conn.query('SELECT code, type FROM accounts WHERE user_id = ?', [userId]) as any
  const typeOf = new Map<string, string>(accRows.map((r: any) => [r.code, r.type]))
  const [lines] = await conn.query(
    `SELECT jl.account_code, jl.side, jl.amount
     FROM journal_lines jl JOIN journals j ON jl.journal_id = j.id
     WHERE j.user_id = ?`, [userId],
  ) as any
  const deltas = new Map<string, number>()
  for (const l of lines) {
    const d = l.amount * balanceSign(typeOf.get(l.account_code), l.side)
    deltas.set(l.account_code, (deltas.get(l.account_code) ?? 0) + d)
  }
  for (const [code, d] of deltas) {
    await conn.query('UPDATE accounts SET balance = balance + ? WHERE code = ? AND user_id = ?', [d, code, userId])
  }
}

/** 決算関連で使う標準科目コード */
export const STD_CODES = {
  taxPaid: '1150',        // 仮払消費税
  taxReceived: '2050',    // 仮受消費税
  taxPayable: '2060',     // 未払消費税
  taxReceivable: '1160',  // 未収還付消費税
  depreciationExpense: '5040', // 減価償却費
  accumulatedDep: '1590',      // 減価償却累計額
  retainedEarnings: '3020',    // 利益剰余金
} as const

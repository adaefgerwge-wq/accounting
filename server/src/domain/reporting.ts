import { balanceSign } from '../balance.js'

export type JournalKind = 'normal' | 'opening' | 'adjusting' | 'closing'

export interface ReportLineRow {
  accountCode: string
  side: 'debit' | 'credit'
  amount: number
  /** YYYY-MM-DD */
  date: string
  kind: JournalKind
}

export interface AccountMeta {
  code: string
  name: string
  type: string
}

export interface BalanceRow {
  code: string
  name: string
  type: string
  /** 期首残高（正常残高側を正の符号付き） */
  opening: number
  /** 期中借方合計 */
  periodDebit: number
  /** 期中貸方合計 */
  periodCredit: number
  /** 期末残高（符号付き） */
  closing: number
}

export interface AggregateOptions {
  /** 期間開始日（未指定なら期首=0で全件を期中扱い） */
  start?: string
  /** 期間終了日（未指定なら上限なし） */
  end?: string
  /**
   * true のとき期間内の決算振替仕訳（kind='closing'）を除外する。
   * 損益計算書用（振替後だと収益・費用が0になるため）。
   * 期首側（start より前）は年度を跨いだ繰越に必要なので常に含める。
   */
  excludeClosing?: boolean
}

/** 仕訳明細を科目ごとの 期首・期中借方・期中貸方・期末 に集計する */
export function aggregateBalances(
  accounts: AccountMeta[],
  lines: ReportLineRow[],
  opts: AggregateOptions = {},
): BalanceRow[] {
  const { start, end, excludeClosing } = opts
  const rows = new Map<string, BalanceRow>()
  for (const a of accounts) {
    rows.set(a.code, { code: a.code, name: a.name, type: a.type, opening: 0, periodDebit: 0, periodCredit: 0, closing: 0 })
  }

  for (const l of lines) {
    const row = rows.get(l.accountCode)
    if (!row) continue // 削除済み科目の残骸は無視（参照チェック導入後は発生しない想定）
    const delta = l.amount * balanceSign(row.type, l.side)

    if (start && l.date < start) {
      row.opening += delta
      row.closing += delta
      continue
    }
    if (end && l.date > end) continue
    if (excludeClosing && l.kind === 'closing') continue

    if (l.side === 'debit') row.periodDebit += l.amount
    else row.periodCredit += l.amount
    row.closing += delta
  }

  return [...rows.values()]
}

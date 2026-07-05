import { calcTax, TAX_RATES, TAX_DEBIT_CODE, TAX_CREDIT_CODE } from '../tax.js'
import type { TaxType } from '../types.js'

export interface TaxSummaryLine {
  journalId: number
  /** 同一仕訳内の並び順（挿入順）。税抜モードの消費税行ペアリングに使う */
  lineId: number
  side: 'debit' | 'credit'
  accountCode: string
  accountType: string | undefined
  amount: number
  taxType: TaxType
}

export interface TaxSummaryRow {
  /** sales=課税売上 / purchase=課税仕入（経費・資産取得含む） */
  category: 'sales' | 'purchase'
  taxType: Exclude<TaxType, 'none'>
  /** 税抜金額 */
  base: number
  /** 消費税額 */
  tax: number
  /** 税込金額 */
  gross: number
}

const TAX_CODES = new Set<string>([TAX_DEBIT_CODE, TAX_CREDIT_CODE])

/**
 * 仕訳明細から税区分別の課税売上・課税仕入を集計する。
 *  - 収益科目 … 売上側。貸方を正、借方（値引・返品）を負として合算
 *  - 費用・資産科目 … 仕入側。借方を正、貸方を負として合算
 *  - 税込経理: 明細金額は税込 → calcTax で税抜・税額に分解
 *  - 税抜経理: 明細金額は税抜 → 直後に並ぶ仮払/仮受消費税行を税額として対応付け
 */
export function summarizeTax(lines: TaxSummaryLine[], taxMethod: 'inclusive' | 'exclusive'): TaxSummaryRow[] {
  const acc = new Map<string, TaxSummaryRow>()
  const add = (category: 'sales' | 'purchase', taxType: Exclude<TaxType, 'none'>, base: number, tax: number) => {
    const key = `${category}:${taxType}`
    if (!acc.has(key)) acc.set(key, { category, taxType, base: 0, tax: 0, gross: 0 })
    const row = acc.get(key)!
    row.base += base
    row.tax += tax
    row.gross += base + tax
  }

  // 仕訳ごとに挿入順で走査し、税抜モードの「課税行→消費税行」ペアを復元する
  const byJournal = new Map<number, TaxSummaryLine[]>()
  for (const l of lines) {
    if (!byJournal.has(l.journalId)) byJournal.set(l.journalId, [])
    byJournal.get(l.journalId)!.push(l)
  }

  for (const jLines of byJournal.values()) {
    jLines.sort((a, b) => a.lineId - b.lineId)
    for (let i = 0; i < jLines.length; i++) {
      const l = jLines[i]
      if (l.taxType === 'none' || TAX_CODES.has(l.accountCode)) continue

      let category: 'sales' | 'purchase'
      let sign: 1 | -1
      if (l.accountType === 'revenue') {
        category = 'sales'
        sign = l.side === 'credit' ? 1 : -1
      } else if (l.accountType === 'expense' || l.accountType === 'asset') {
        category = 'purchase'
        sign = l.side === 'debit' ? 1 : -1
      } else {
        continue // 負債・純資産科目の課税指定は集計対象外
      }

      const rate = TAX_RATES[l.taxType]
      if (taxMethod === 'inclusive' || rate === 0) {
        // 税込経理（または非課税・不課税・免税）：金額は税込
        const { baseAmount, taxAmount } = calcTax(l.amount, l.taxType)
        add(category, l.taxType, baseAmount * sign, taxAmount * sign)
      } else {
        // 税抜経理：金額は税抜。直後の消費税行が同じ側ならその額を対応付け
        const next = jLines[i + 1]
        const paired = next && TAX_CODES.has(next.accountCode) && next.side === l.side
        const tax = paired ? next.amount : Math.floor(l.amount * rate)
        add(category, l.taxType, l.amount * sign, tax * sign)
        if (paired) i++ // 消費税行は消費済み
      }
    }
  }

  const order: Record<string, number> = { taxable10: 0, taxable8: 1, exempt: 2, non_taxable: 3 }
  return [...acc.values()].sort((a, b) =>
    a.category === b.category ? order[a.taxType] - order[b.taxType] : a.category === 'sales' ? -1 : 1)
}

import type { TaxType } from './types.js'

export const TAX_RATES: Record<TaxType, number> = {
  none: 0, taxable10: 0.1, taxable8: 0.08, exempt: 0, non_taxable: 0
}

export const TAX_DEBIT_CODE  = '1150' // 仮払消費税（仕入・経費・課税資産の取得）
export const TAX_CREDIT_CODE = '2050' // 仮受消費税（売上）

// 税込金額から内税で消費税を逆算（税込 × rate ÷ (1+rate) の切り捨て）。
// 浮動小数点誤差で 11,000 円が 999 円等にならないよう微小値を加えてから切り捨てる。
export function calcTax(amount: number, taxType: TaxType) {
  const rate = TAX_RATES[taxType]
  if (!rate) return { baseAmount: amount, taxAmount: 0 }
  const taxAmount  = Math.floor(amount * rate / (1 + rate) + 1e-6)
  return { baseAmount: amount - taxAmount, taxAmount }
}

export interface TaxPlan {
  kind: 'sales' | 'purchase'
  taxAmount: number
  /** 税込→税抜に補正する課税科目（売上高 / 仕入高・備品 等） */
  baseCode: string
  /** 計上する消費税科目（仮受 or 仮払消費税） */
  taxCode: string
  /** 表示用の消費税仕訳の借方 */
  taxDebit: string
  /** 表示用の消費税仕訳の貸方 */
  taxCredit: string
}

/**
 * 税抜経理で生成すべき消費税仕訳を判定する。対象外なら null。
 *
 *  - 売上（収益が貸方）        → 仮受消費税。  売上高 ／ 仮受消費税
 *  - 仕入・経費・課税資産の取得 → 仮払消費税。  仮払消費税 ／ 仕入高・備品 等
 *
 * 消費税は課税対象となる損益・資産科目に紐づくため、相手勘定（普通預金・買掛金
 * 等の対象外科目）の金額には手を付けない。
 */
export function planTax(
  debit: string, credit: string,
  debitType: string | undefined, creditType: string | undefined,
  taxType: TaxType, amount: number
): TaxPlan | null {
  const { taxAmount } = calcTax(amount, taxType)
  if (!taxAmount) return null

  if (creditType === 'revenue') {
    return {
      kind: 'sales', taxAmount, baseCode: credit, taxCode: TAX_CREDIT_CODE,
      taxDebit: credit, taxCredit: TAX_CREDIT_CODE,
    }
  }
  if (debitType === 'expense' || debitType === 'asset') {
    return {
      kind: 'purchase', taxAmount, baseCode: debit, taxCode: TAX_DEBIT_CODE,
      taxDebit: TAX_DEBIT_CODE, taxCredit: debit,
    }
  }
  return null
}

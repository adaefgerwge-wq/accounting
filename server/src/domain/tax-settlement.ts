import type { EntryLine } from './closing.js'

export interface TaxSettlementCodes {
  /** 仮払消費税（資産） */
  paid: string
  /** 仮受消費税（負債） */
  received: string
  /** 未払消費税（負債） */
  payable: string
  /** 未収還付消費税（資産） */
  receivable: string
}

/**
 * 消費税の決算整理仕訳を組み立てる。
 * 仮受消費税と仮払消費税を相殺し、差額を未払消費税（納付）または
 * 未収還付消費税（還付）に振り替える。
 *
 * @param paidBalance     仮払消費税の期末残高（資産・借方正）
 * @param receivedBalance 仮受消費税の期末残高（負債・貸方正）
 * @returns 両残高とも0なら空配列
 */
export function buildTaxSettlementLines(
  paidBalance: number,
  receivedBalance: number,
  codes: TaxSettlementCodes,
): EntryLine[] {
  if (paidBalance === 0 && receivedBalance === 0) return []

  const lines: EntryLine[] = []
  // 各科目を残高と反対側に立ててゼロにする（逆残にも対応）
  if (receivedBalance !== 0) {
    lines.push({
      side: receivedBalance > 0 ? 'debit' : 'credit',
      accountCode: codes.received,
      amount: Math.abs(receivedBalance),
    })
  }
  if (paidBalance !== 0) {
    lines.push({
      side: paidBalance > 0 ? 'credit' : 'debit',
      accountCode: codes.paid,
      amount: Math.abs(paidBalance),
    })
  }

  // 貸借差額を納付額（貸方: 未払消費税）または還付額（借方: 未収還付消費税）で埋める
  const debitTotal  = lines.filter(l => l.side === 'debit') .reduce((s, l) => s + l.amount, 0)
  const creditTotal = lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amount, 0)
  const diff = debitTotal - creditTotal
  if (diff > 0)      lines.push({ side: 'credit', accountCode: codes.payable,    amount: diff })
  else if (diff < 0) lines.push({ side: 'debit',  accountCode: codes.receivable, amount: -diff })

  return lines
}

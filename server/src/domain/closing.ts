// 決算振替（損益振替）の明細を組み立てる純粋ロジック。
// DBアクセスを持たないため単体テスト可能。

export interface EntryLine {
  side: 'debit' | 'credit'
  accountCode: string
  amount: number
}

export interface PlBalance {
  type: 'revenue' | 'expense'
  /** 正常残高側を正とする符号付き残高 */
  balance: number
}

/**
 * 収益・費用の期末残高から損益振替仕訳の明細を作る。
 *  - 収益は借方、費用は貸方に立てて残高を打ち消す
 *  - 差額（当期純利益）を利益剰余金へ振り替える
 * 残高が全て0なら空配列を返す（振替仕訳は不要）。
 */
export function buildProfitTransferLines(
  plBalances: Map<string, PlBalance>,
  retainedEarningsCode: string,
): { lines: EntryLine[]; net: number } {
  const lines: EntryLine[] = []
  let revenueTotal = 0
  let expenseTotal = 0

  for (const [code, { type, balance }] of plBalances) {
    if (balance === 0) continue
    // 残高がマイナス（逆残）の科目は反対側に立てて打ち消す
    const closeSide: 'debit' | 'credit' =
      type === 'revenue'
        ? (balance > 0 ? 'debit' : 'credit')
        : (balance > 0 ? 'credit' : 'debit')
    lines.push({ side: closeSide, accountCode: code, amount: Math.abs(balance) })
    if (type === 'revenue') revenueTotal += balance
    else expenseTotal += balance
  }

  const net = revenueTotal - expenseTotal // 当期純利益（プラス=黒字）
  if (net > 0) lines.push({ side: 'credit', accountCode: retainedEarningsCode, amount: net })
  else if (net < 0) lines.push({ side: 'debit', accountCode: retainedEarningsCode, amount: -net })

  return { lines, net }
}

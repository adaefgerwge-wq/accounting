import type { AccountType } from './types.js'

// 残高は科目ごとに「正常残高側を正」で保持する。
//   借方記入 … 資産・費用は増、それ以外（負債・純資産・収益）は減
//   貸方記入 … 負債・純資産・収益は増、それ以外（資産・費用）は減
// 科目の type と記入側から、balance に加算する符号（+1 / -1）を返す。
export function balanceSign(type: AccountType | string | undefined, side: 'debit' | 'credit'): 1 | -1 {
  const debitNormal = type === 'asset' || type === 'expense'
  // 借方記入なら借方正常科目が増、貸方記入なら貸方正常科目が増
  return (side === 'debit') === debitNormal ? 1 : -1
}

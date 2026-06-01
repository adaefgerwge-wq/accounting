// 勘定科目の区分
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'

// 取引先の区分
export type PartnerType = 'customer' | 'vendor' | 'both'

// 勘定科目
export interface Account {
  code: string
  name: string
  type: AccountType
  balance: number
  hasSub: boolean // 補助科目（取引先紐づけ）を使用するか
}

// 取引先
export interface Partner {
  code: string
  name: string
  type: PartnerType
  accountCode: string // 紐づく勘定科目コード
}

// 仕訳
export interface Journal {
  id: number
  date: string
  debit: string        // 借方科目コード
  debitPartner: string // 借方補助（取引先コード or ''）
  credit: string       // 貸方科目コード
  creditPartner: string
  amount: number
  memo: string
}

// ページ識別子
export type PageId = 'journal' | 'accounts' | 'partners' | 'bs' | 'pl'

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
export type PartnerType = 'customer' | 'vendor' | 'both'

export interface Account {
  code: string
  name: string
  type: AccountType
  balance: number
  hasSub: boolean
}

export interface Partner {
  code: string
  name: string
  type: PartnerType
  accountCode: string
}

export interface Journal {
  id: number
  date: string
  debit: string
  debitPartner: string
  credit: string
  creditPartner: string
  amount: number
  memo: string
}

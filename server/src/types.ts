export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
export type PartnerType = 'customer' | 'vendor' | 'both'
export type TaxType = 'none' | 'taxable10' | 'taxable8' | 'exempt' | 'non_taxable'

export interface FiscalYear {
  id: number
  name: string
  startDate: string
  endDate: string
  closed: boolean
}

export interface Account {
  code: string
  name: string
  type: AccountType
  balance: number
  hasSub: boolean
  defaultTaxType: TaxType
}

export interface Partner {
  code: string
  name: string
  type: PartnerType
  accountCode: string
}

// 汎用補助科目（取引先以外：銀行口座・経費区分など、どの科目にも紐づけ可）
export interface SubAccount {
  code: string
  name: string
  accountCode: string
}

export interface JournalLine {
  id: number
  journalId: number
  side: 'debit' | 'credit'
  accountCode: string
  partnerCode: string
  amount: number
  taxType: TaxType
}

export type JournalKind = 'normal' | 'opening' | 'adjusting' | 'closing'

export interface Journal {
  id: number
  fiscalYearId: number
  date: string
  memo: string
  kind: JournalKind
  lines: JournalLine[]
}

export interface FixedAsset {
  id: number
  name: string
  acquisitionDate: string
  cost: number
  usefulLifeYears: number
  memo: string
}

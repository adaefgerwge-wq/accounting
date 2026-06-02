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
}

export interface Partner {
  code: string
  name: string
  type: PartnerType
  accountCode: string
}

export interface Journal {
  id: number
  fiscalYearId: number
  date: string
  debit: string
  debitPartner: string
  credit: string
  creditPartner: string
  amount: number
  taxType: TaxType
  memo: string
}

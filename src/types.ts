export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
export type PartnerType = 'customer' | 'vendor' | 'both'
export type TaxType = 'none' | 'taxable10' | 'taxable8' | 'exempt' | 'non_taxable'
export type PageId = 'journal' | 'accounts' | 'partners' | 'bs' | 'pl' | 'trial-balance' | 'fiscal-years' | 'settings' | 'invoices' | 'bank-import' | 'monthly-report'

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

export const TAX_LABELS: Record<TaxType, string> = {
  none:        '対象外',
  taxable10:   '課税 10%',
  taxable8:    '軽減 8%',
  exempt:      '非課税',
  non_taxable: '不課税',
}

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
export type PartnerType = 'customer' | 'vendor' | 'both'
export type TaxType = 'none' | 'taxable10' | 'taxable8' | 'exempt' | 'non_taxable'
export type PageId = 'journal' | 'ledger' | 'accounts' | 'partners' | 'sub-accounts' | 'bs' | 'pl' | 'trial-balance' | 'fiscal-years' | 'settings' | 'invoices' | 'bank-import' | 'monthly-report' | 'tax-summary' | 'fixed-assets'

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

// normal=通常 / opening=開始残高 / adjusting=決算整理（償却・消費税） / closing=損益振替
export type JournalKind = 'normal' | 'opening' | 'adjusting' | 'closing'

export interface Journal {
  id: number
  fiscalYearId: number
  date: string
  memo: string
  kind: JournalKind
  lines: JournalLine[]
}

export const KIND_LABELS: Record<Exclude<JournalKind, 'normal'>, string> = {
  opening: '開始',
  adjusting: '決算整理',
  closing: '決算振替',
}

export interface FixedAsset {
  id: number
  name: string
  acquisitionDate: string
  cost: number
  usefulLifeYears: number
  memo: string
  periodDepreciation?: number
  accumulatedDepreciation?: number
  bookValue?: number
}

export interface BalanceReportRow {
  code: string
  name: string
  type: AccountType
  opening: number
  periodDebit: number
  periodCredit: number
  closing: number
}

export interface BalanceReport {
  fiscalYear: { id: number; name: string; closed: boolean; startDate: string; endDate: string } | null
  rows: BalanceReportRow[]
}

export interface TaxSummaryRow {
  category: 'sales' | 'purchase'
  taxType: Exclude<TaxType, 'none'>
  base: number
  tax: number
  gross: number
}

export interface TaxSummaryReport {
  fiscalYear: BalanceReport['fiscalYear']
  taxMethod: 'inclusive' | 'exclusive'
  rows: TaxSummaryRow[]
  taxPaid: number
  taxReceived: number
  estimatedPayment: number
}

export interface JournalHistoryEntry {
  id: number
  journalId: number
  action: 'create' | 'update' | 'delete'
  snapshot: {
    fiscalYearId: number
    date: string
    memo: string
    kind: JournalKind
    lines: Pick<JournalLine, 'side' | 'accountCode' | 'partnerCode' | 'amount' | 'taxType'>[]
  }
  createdAt: string
}

export const TAX_LABELS: Record<TaxType, string> = {
  none:        '対象外',
  taxable10:   '課税 10%',
  taxable8:    '軽減 8%',
  exempt:      '非課税',
  non_taxable: '不課税',
}

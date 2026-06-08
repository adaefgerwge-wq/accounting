import type { Account, Journal, Partner, FiscalYear } from './types.js'

type AccountRow = { code: string; name: string; type: Account['type']; balance: number; has_sub: 0|1|boolean; default_tax_type?: string }
type PartnerRow = { code: string; name: string; type: Partner['type']; account_code: string }
type JournalRow = {
  id: number; fiscal_year_id: number; date: Date|string
  debit: string; debit_partner: string; credit: string; credit_partner: string
  amount: number; tax_type: Journal['taxType']; memo: string
}
type FiscalYearRow = { id: number; name: string; start_date: Date|string; end_date: Date|string; closed: 0|1|boolean }

export function mapAccount(row: AccountRow): Account {
  return {
    code: row.code, name: row.name, type: row.type, balance: row.balance,
    hasSub: Boolean(row.has_sub),
    defaultTaxType: (row.default_tax_type ?? 'none') as Account['defaultTaxType']
  }
}
export function mapPartner(row: PartnerRow): Partner {
  return { code: row.code, name: row.name, type: row.type, accountCode: row.account_code }
}
export function mapJournal(row: JournalRow): Journal {
  const date = row.date instanceof Date ? row.date.toISOString().slice(0,10) : String(row.date).slice(0,10)
  return {
    id: row.id, fiscalYearId: row.fiscal_year_id, date,
    debit: row.debit, debitPartner: row.debit_partner,
    credit: row.credit, creditPartner: row.credit_partner,
    amount: row.amount, taxType: row.tax_type ?? 'none', memo: row.memo
  }
}
export function mapFiscalYear(row: FiscalYearRow): FiscalYear {
  const startDate = row.start_date instanceof Date ? row.start_date.toISOString().slice(0,10) : String(row.start_date).slice(0,10)
  const endDate   = row.end_date   instanceof Date ? row.end_date.toISOString().slice(0,10)   : String(row.end_date).slice(0,10)
  return { id: row.id, name: row.name, startDate, endDate, closed: Boolean(row.closed) }
}

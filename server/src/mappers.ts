import type { Account, Journal, JournalLine, Partner, SubAccount, FiscalYear } from './types.js'

type AccountRow = { code: string; name: string; type: Account['type']; balance: number; has_sub: 0|1|boolean; default_tax_type?: string }
type PartnerRow = { code: string; name: string; type: Partner['type']; account_code: string }
type SubAccountRow = { code: string; name: string; account_code: string }
type JournalRow = { id: number; fiscal_year_id: number; date: Date|string; memo: string; kind?: Journal['kind'] }
type JournalLineRow = {
  id: number; journal_id: number
  side: 'debit' | 'credit'
  account_code: string; partner_code: string
  amount: number; tax_type: JournalLine['taxType']
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
export function mapSubAccount(row: SubAccountRow): SubAccount {
  return { code: row.code, name: row.name, accountCode: row.account_code }
}
export function mapJournalLine(row: JournalLineRow): JournalLine {
  return {
    id: row.id, journalId: row.journal_id,
    side: row.side,
    accountCode: row.account_code, partnerCode: row.partner_code ?? '',
    amount: row.amount, taxType: row.tax_type ?? 'none'
  }
}
export function mapJournal(row: JournalRow, lines: JournalLine[]): Journal {
  const date = row.date instanceof Date ? row.date.toISOString().slice(0,10) : String(row.date).slice(0,10)
  return { id: row.id, fiscalYearId: row.fiscal_year_id, date, memo: row.memo ?? '', kind: row.kind ?? 'normal', lines }
}
export function mapFiscalYear(row: FiscalYearRow): FiscalYear {
  const startDate = row.start_date instanceof Date ? row.start_date.toISOString().slice(0,10) : String(row.start_date).slice(0,10)
  const endDate   = row.end_date   instanceof Date ? row.end_date.toISOString().slice(0,10)   : String(row.end_date).slice(0,10)
  return { id: row.id, name: row.name, startDate, endDate, closed: Boolean(row.closed) }
}

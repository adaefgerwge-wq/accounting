import type { Account, Journal, Partner } from './types.js'

type AccountRow = {
  code: string
  name: string
  type: Account['type']
  balance: number
  has_sub: 0 | 1 | boolean
}

type PartnerRow = {
  code: string
  name: string
  type: Partner['type']
  account_code: string
}

type JournalRow = {
  id: number
  date: Date | string
  debit: string
  debit_partner: string
  credit: string
  credit_partner: string
  amount: number
  memo: string
}

export function mapAccount(row: AccountRow): Account {
  return {
    code: row.code,
    name: row.name,
    type: row.type,
    balance: row.balance,
    hasSub: Boolean(row.has_sub)
  }
}

export function mapPartner(row: PartnerRow): Partner {
  return {
    code: row.code,
    name: row.name,
    type: row.type,
    accountCode: row.account_code
  }
}

export function mapJournal(row: JournalRow): Journal {
  const date = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10)
  return {
    id: row.id,
    date,
    debit: row.debit,
    debitPartner: row.debit_partner,
    credit: row.credit,
    creditPartner: row.credit_partner,
    amount: row.amount,
    memo: row.memo
  }
}

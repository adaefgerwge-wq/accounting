import type { Account, Journal, Partner } from './types.js'

export const initialAccounts: Account[] = [
  { code: '1010', name: '現金',       type: 'asset',     balance: 500000,  hasSub: false, defaultTaxType: 'none' },
  { code: '1020', name: '普通預金',   type: 'asset',     balance: 2700000, hasSub: false, defaultTaxType: 'none' },
  { code: '1100', name: '売掛金',     type: 'asset',     balance: 600000,  hasSub: true,  defaultTaxType: 'none' },
  { code: '1150', name: '仮払消費税', type: 'asset',     balance: 0,       hasSub: false, defaultTaxType: 'none' },
  { code: '1500', name: '備品',       type: 'asset',     balance: 400000,  hasSub: false, defaultTaxType: 'taxable10' },
  { code: '2010', name: '買掛金',     type: 'liability', balance: 300000,  hasSub: true,  defaultTaxType: 'none' },
  { code: '2050', name: '仮受消費税', type: 'liability', balance: 0,       hasSub: false, defaultTaxType: 'none' },
  { code: '2100', name: '短期借入金', type: 'liability', balance: 1000000, hasSub: false, defaultTaxType: 'none' },
  { code: '3010', name: '資本金',     type: 'equity',    balance: 2000000, hasSub: false, defaultTaxType: 'none' },
  { code: '3020', name: '利益剰余金', type: 'equity',    balance: 900000,  hasSub: false, defaultTaxType: 'none' },
  { code: '4010', name: '売上高',     type: 'revenue',   balance: 0,       hasSub: false, defaultTaxType: 'taxable10' },
  { code: '5010', name: '仕入高',     type: 'expense',   balance: 0,       hasSub: false, defaultTaxType: 'taxable10' },
  { code: '5020', name: '給料手当',   type: 'expense',   balance: 0,       hasSub: false, defaultTaxType: 'none' },
  { code: '5030', name: '地代家賃',   type: 'expense',   balance: 0,       hasSub: false, defaultTaxType: 'taxable10' },
]

export const initialPartners: Partner[] = [
  { code: 'C001', name: '株式会社山田商事', type: 'customer', accountCode: '1100' },
  { code: 'C002', name: '田中工業株式会社', type: 'customer', accountCode: '1100' },
  { code: 'V001', name: '鈴木物産株式会社', type: 'vendor',   accountCode: '2010' },
  { code: 'V002', name: '佐藤電機株式会社', type: 'vendor',   accountCode: '2010' },
]

export const initialJournals: (Omit<Journal,'id'> & { id: number })[] = [
  {
    id: 1, fiscalYearId: 1, date: '2024-01-15', memo: '売上入金',
    lines: [
      { id: 0, journalId: 1, side: 'debit',  accountCode: '1020', partnerCode: '', amount: 500000, taxType: 'none' },
      { id: 0, journalId: 1, side: 'credit', accountCode: '4010', partnerCode: '', amount: 500000, taxType: 'taxable10' },
    ],
  },
  {
    id: 2, fiscalYearId: 1, date: '2024-01-20', memo: '仕入計上',
    lines: [
      { id: 0, journalId: 2, side: 'debit',  accountCode: '5010', partnerCode: '',     amount: 300000, taxType: 'taxable10' },
      { id: 0, journalId: 2, side: 'credit', accountCode: '2010', partnerCode: 'V001', amount: 300000, taxType: 'none' },
    ],
  },
  {
    id: 3, fiscalYearId: 1, date: '2024-01-25', memo: '給与支払',
    lines: [
      { id: 0, journalId: 3, side: 'debit',  accountCode: '5020', partnerCode: '', amount: 200000, taxType: 'none' },
      { id: 0, journalId: 3, side: 'credit', accountCode: '1020', partnerCode: '', amount: 200000, taxType: 'none' },
    ],
  },
  {
    id: 4, fiscalYearId: 1, date: '2024-01-28', memo: '売上計上',
    lines: [
      { id: 0, journalId: 4, side: 'debit',  accountCode: '1100', partnerCode: 'C001', amount: 200000, taxType: 'none' },
      { id: 0, journalId: 4, side: 'credit', accountCode: '4010', partnerCode: '',     amount: 200000, taxType: 'taxable10' },
    ],
  },
]

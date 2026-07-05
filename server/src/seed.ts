import type { Account, JournalLine, Partner } from './types.js'

// balance は開始仕訳（initialOpeningLines）とサンプル仕訳から再計算されるため、ここでは持たない
export const initialAccounts: Omit<Account, 'balance'>[] = [
  { code: '1010', name: '現金',             type: 'asset',     hasSub: false, defaultTaxType: 'none' },
  { code: '1020', name: '普通預金',         type: 'asset',     hasSub: false, defaultTaxType: 'none' },
  { code: '1100', name: '売掛金',           type: 'asset',     hasSub: true,  defaultTaxType: 'none' },
  { code: '1150', name: '仮払消費税',       type: 'asset',     hasSub: false, defaultTaxType: 'none' },
  { code: '1160', name: '未収還付消費税',   type: 'asset',     hasSub: false, defaultTaxType: 'none' },
  { code: '1500', name: '備品',             type: 'asset',     hasSub: false, defaultTaxType: 'taxable10' },
  { code: '1590', name: '減価償却累計額',   type: 'asset',     hasSub: false, defaultTaxType: 'none' },
  { code: '2010', name: '買掛金',           type: 'liability', hasSub: true,  defaultTaxType: 'none' },
  { code: '2050', name: '仮受消費税',       type: 'liability', hasSub: false, defaultTaxType: 'none' },
  { code: '2060', name: '未払消費税',       type: 'liability', hasSub: false, defaultTaxType: 'none' },
  { code: '2100', name: '短期借入金',       type: 'liability', hasSub: false, defaultTaxType: 'none' },
  { code: '3010', name: '資本金',           type: 'equity',    hasSub: false, defaultTaxType: 'none' },
  { code: '3020', name: '利益剰余金',       type: 'equity',    hasSub: false, defaultTaxType: 'none' },
  { code: '4010', name: '売上高',           type: 'revenue',   hasSub: false, defaultTaxType: 'taxable10' },
  { code: '5010', name: '仕入高',           type: 'expense',   hasSub: false, defaultTaxType: 'taxable10' },
  { code: '5020', name: '給料手当',         type: 'expense',   hasSub: false, defaultTaxType: 'none' },
  { code: '5030', name: '地代家賃',         type: 'expense',   hasSub: false, defaultTaxType: 'taxable10' },
  { code: '5040', name: '減価償却費',       type: 'expense',   hasSub: false, defaultTaxType: 'none' },
]

export const initialPartners: Partner[] = [
  { code: 'C001', name: '株式会社山田商事', type: 'customer', accountCode: '1100' },
  { code: 'C002', name: '田中工業株式会社', type: 'customer', accountCode: '1100' },
  { code: 'V001', name: '鈴木物産株式会社', type: 'vendor',   accountCode: '2010' },
  { code: 'V002', name: '佐藤電機株式会社', type: 'vendor',   accountCode: '2010' },
]

type SeedLine = Pick<JournalLine, 'side' | 'accountCode' | 'partnerCode' | 'amount' | 'taxType'>

// 開始残高仕訳（kind='opening'）の明細。貸借一致していること。
export const initialOpeningLines: SeedLine[] = [
  { side: 'debit',  accountCode: '1010', partnerCode: '', amount: 500000,  taxType: 'none' }, // 現金
  { side: 'debit',  accountCode: '1020', partnerCode: '', amount: 2400000, taxType: 'none' }, // 普通預金
  { side: 'debit',  accountCode: '1100', partnerCode: 'C002', amount: 400000, taxType: 'none' }, // 売掛金
  { side: 'debit',  accountCode: '1500', partnerCode: '', amount: 400000,  taxType: 'none' }, // 備品
  { side: 'credit', accountCode: '2100', partnerCode: '', amount: 1000000, taxType: 'none' }, // 短期借入金
  { side: 'credit', accountCode: '3010', partnerCode: '', amount: 2000000, taxType: 'none' }, // 資本金
  { side: 'credit', accountCode: '3020', partnerCode: '', amount: 700000,  taxType: 'none' }, // 利益剰余金
]

// サンプル仕訳（日付は登録時の年の monthDay で起票する）
export const initialJournals: { monthDay: string; memo: string; lines: SeedLine[] }[] = [
  {
    monthDay: '01-15', memo: '売上入金',
    lines: [
      { side: 'debit',  accountCode: '1020', partnerCode: '', amount: 500000, taxType: 'none' },
      { side: 'credit', accountCode: '4010', partnerCode: '', amount: 500000, taxType: 'taxable10' },
    ],
  },
  {
    monthDay: '01-20', memo: '仕入計上',
    lines: [
      { side: 'debit',  accountCode: '5010', partnerCode: '',     amount: 300000, taxType: 'taxable10' },
      { side: 'credit', accountCode: '2010', partnerCode: 'V001', amount: 300000, taxType: 'none' },
    ],
  },
  {
    monthDay: '01-25', memo: '給与支払',
    lines: [
      { side: 'debit',  accountCode: '5020', partnerCode: '', amount: 200000, taxType: 'none' },
      { side: 'credit', accountCode: '1020', partnerCode: '', amount: 200000, taxType: 'none' },
    ],
  },
  {
    monthDay: '01-28', memo: '売上計上',
    lines: [
      { side: 'debit',  accountCode: '1100', partnerCode: 'C001', amount: 200000, taxType: 'none' },
      { side: 'credit', accountCode: '4010', partnerCode: '',     amount: 200000, taxType: 'taxable10' },
    ],
  },
]

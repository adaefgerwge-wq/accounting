import type { Account, Partner, Journal } from './types'

// 期首残高（BS貸借一致: 資産合計 = 負債+純資産 = 4,200,000円）
// 収益・費用科目は期首ゼロ。仕訳を通じて残高が積み上がる。
export const initialAccounts: Account[] = [
  { code: '1010', name: '現金',       type: 'asset',     balance: 500000,  hasSub: false },
  { code: '1020', name: '普通預金',   type: 'asset',     balance: 2700000, hasSub: false },
  { code: '1100', name: '売掛金',     type: 'asset',     balance: 600000,  hasSub: true  },
  { code: '1500', name: '備品',       type: 'asset',     balance: 400000,  hasSub: false },
  { code: '2010', name: '買掛金',     type: 'liability', balance: 300000,  hasSub: true  },
  { code: '2100', name: '短期借入金', type: 'liability', balance: 1000000, hasSub: false },
  { code: '3010', name: '資本金',     type: 'equity',    balance: 2000000, hasSub: false },
  { code: '3020', name: '利益剰余金', type: 'equity',    balance: 900000,  hasSub: false },
  { code: '4010', name: '売上高',     type: 'revenue',   balance: 0,       hasSub: false },
  { code: '5010', name: '仕入高',     type: 'expense',   balance: 0,       hasSub: false },
  { code: '5020', name: '給料手当',   type: 'expense',   balance: 0,       hasSub: false },
  { code: '5030', name: '地代家賃',   type: 'expense',   balance: 0,       hasSub: false },
]
// 資産合計:      500,000 + 2,700,000 + 600,000 + 400,000 = 4,200,000
// 負債+純資産: 300,000 + 1,000,000 + 2,000,000 + 900,000 = 4,200,000 ✓

export const initialPartners: Partner[] = [
  { code: 'C001', name: '株式会社山田商事', type: 'customer', accountCode: '1100' },
  { code: 'C002', name: '田中工業株式会社', type: 'customer', accountCode: '1100' },
  { code: 'V001', name: '鈴木物産株式会社', type: 'vendor',   accountCode: '2010' },
  { code: 'V002', name: '佐藤電機株式会社', type: 'vendor',   accountCode: '2010' },
]

// 仕訳登録後の残高:
// 普通預金: 2,700,000 + 500,000 - 200,000 = 3,000,000... → サーバー側で自動計算
export const initialJournals: Journal[] = [
  { id: 1, fiscalYearId: 1, date: '2024-01-15', debit: '1020', debitPartner: '',     credit: '4010', creditPartner: '',     amount: 500000, taxType: 'taxable10', memo: '売上入金' },
  { id: 2, fiscalYearId: 1, date: '2024-01-20', debit: '5010', debitPartner: '',     credit: '2010', creditPartner: 'V001', amount: 300000, taxType: 'taxable10', memo: '仕入計上' },
  { id: 3, fiscalYearId: 1, date: '2024-01-25', debit: '5020', debitPartner: '',     credit: '1020', creditPartner: '',     amount: 200000, taxType: 'none',       memo: '給与支払' },
  { id: 4, fiscalYearId: 1, date: '2024-01-28', debit: '1100', debitPartner: 'C001', credit: '4010', creditPartner: '',     amount: 200000, taxType: 'taxable10', memo: '売上計上' },
]

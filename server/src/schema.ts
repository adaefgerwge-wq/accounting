import { pool } from './db.js'
import { balanceSign } from './balance.js'
import { initialAccounts, initialJournals, initialPartners, initialOpeningLines } from './seed.js'
import { recomputeBalances } from './journal-service.js'

async function columnExists(table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column],
  ) as any
  return rows.length > 0
}

async function tableExists(table: string): Promise<boolean> {
  const [rows] = await pool.query(
    'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table],
  ) as any
  return rows.length > 0
}

export async function ensureSchema() {
  // ユーザー（認証）
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      email         VARCHAR(255) NOT NULL UNIQUE,
      name          VARCHAR(255) NOT NULL DEFAULT '',
      password_hash VARCHAR(255) NOT NULL,
      created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // 旧（単一テナント）スキーマを検出したらデータをリセットしてから新スキーマで作り直す
  await migrateToMultiUser()

  await pool.query(`
    CREATE TABLE IF NOT EXISTS fiscal_years (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      user_id    INT          NOT NULL,
      name       VARCHAR(50)  NOT NULL,
      start_date DATE         NOT NULL,
      end_date   DATE         NOT NULL,
      closed     TINYINT(1)   NOT NULL DEFAULT 0,
      created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_fiscal_years_user (user_id)
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      user_id          INT          NOT NULL,
      code             VARCHAR(20)  NOT NULL,
      name             VARCHAR(255) NOT NULL,
      type             ENUM('asset','liability','equity','revenue','expense') NOT NULL,
      balance          INT          NOT NULL DEFAULT 0,
      has_sub          BOOLEAN      NOT NULL DEFAULT false,
      default_tax_type ENUM('none','taxable10','taxable8','exempt','non_taxable') NOT NULL DEFAULT 'none',
      created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, code)
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      user_id    INT          NOT NULL,
      key_name   VARCHAR(50)  NOT NULL,
      value      VARCHAR(255) NOT NULL,
      updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, key_name)
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS partners (
      user_id      INT          NOT NULL,
      code         VARCHAR(20)  NOT NULL,
      name         VARCHAR(255) NOT NULL,
      type         ENUM('customer','vendor','both') NOT NULL,
      account_code VARCHAR(20)  NOT NULL DEFAULT '',
      created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, code),
      INDEX idx_partners_account_code (user_id, account_code)
    )
  `)

  // 汎用補助科目（取引先以外：銀行口座・経費区分など）
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sub_accounts (
      user_id      INT          NOT NULL,
      code         VARCHAR(20)  NOT NULL,
      name         VARCHAR(255) NOT NULL,
      account_code VARCHAR(20)  NOT NULL,
      created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, code),
      INDEX idx_sub_accounts_account_code (user_id, account_code)
    )
  `)

  // journals テーブル（ヘッダー：日付・摘要・種別）
  // kind: normal=通常 / opening=開始残高 / adjusting=決算整理（償却・消費税） / closing=損益振替
  await pool.query(`
    CREATE TABLE IF NOT EXISTS journals (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      user_id        INT          NOT NULL,
      fiscal_year_id INT          NOT NULL,
      date           DATE         NOT NULL,
      memo           VARCHAR(255) NOT NULL DEFAULT '',
      kind           ENUM('normal','opening','adjusting','closing') NOT NULL DEFAULT 'normal',
      created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_journals_user (user_id),
      INDEX idx_journals_date (date),
      INDEX idx_journals_fiscal_year (fiscal_year_id),
      FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years(id)
    )
  `)

  // journal_lines テーブル（借方・貸方の各行）。ユーザーは親 journal 経由でスコープ。
  await pool.query(`
    CREATE TABLE IF NOT EXISTS journal_lines (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      journal_id   INT          NOT NULL,
      side         ENUM('debit','credit') NOT NULL,
      account_code VARCHAR(20)  NOT NULL,
      partner_code VARCHAR(20)  NOT NULL DEFAULT '',
      amount       INT          NOT NULL,
      tax_type     ENUM('none','taxable10','taxable8','exempt','non_taxable') NOT NULL DEFAULT 'none',
      INDEX idx_journal_lines_journal (journal_id),
      FOREIGN KEY (journal_id) REFERENCES journals(id) ON DELETE CASCADE
    )
  `)

  // 監査証跡：仕訳の作成・更新・削除スナップショット
  await pool.query(`
    CREATE TABLE IF NOT EXISTS journal_history (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      user_id    INT       NOT NULL,
      journal_id INT       NOT NULL,
      action     ENUM('create','update','delete') NOT NULL,
      snapshot   JSON      NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_journal_history_user (user_id),
      INDEX idx_journal_history_journal (journal_id)
    )
  `)

  // 固定資産台帳（定額法）
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fixed_assets (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      user_id          INT          NOT NULL,
      name             VARCHAR(255) NOT NULL,
      acquisition_date DATE         NOT NULL,
      cost             INT          NOT NULL,
      useful_life      INT          NOT NULL,
      memo             VARCHAR(255) NOT NULL DEFAULT '',
      created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_fixed_assets_user (user_id)
    )
  `)

  await migrateJournalKind()
  await migrateOpeningBalances()
}

// 旧（単一テナント）スキーマ → 多ユーザー化。リセット方針のため既存データは破棄して作り直す。
async function migrateToMultiUser() {
  if (!(await tableExists('accounts'))) return // accounts 自体が無い＝新規DB。新スキーマでそのまま作成する。
  if (await columnExists('accounts', 'user_id')) return // 既に多ユーザー化済み

  console.warn('多ユーザー化マイグレーション: 既存の会計データをリセットして新スキーマで作り直します')
  const conn = await pool.getConnection()
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0')
    for (const t of ['journal_lines', 'journals', 'invoice_items', 'invoices', 'bank_rules', 'sub_accounts', 'partners', 'settings', 'accounts', 'fiscal_years']) {
      await conn.query(`DROP TABLE IF EXISTS \`${t}\``)
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1')
  } finally {
    conn.release()
  }
}

// journals.kind 列の追加と、既存の決算振替仕訳（memo判定していた時代のデータ）への付与
async function migrateJournalKind() {
  if (!(await columnExists('journals', 'kind'))) {
    await pool.query(
      "ALTER TABLE journals ADD COLUMN kind ENUM('normal','opening','adjusting','closing') NOT NULL DEFAULT 'normal' AFTER memo",
    )
  }
  await pool.query("UPDATE journals SET kind = 'closing' WHERE kind = 'normal' AND memo LIKE '決算振替仕訳%'")
}

/**
 * 開始残高マイグレーション：
 * 旧実装では開始残高が accounts.balance に直接入っており、仕訳の裏付けがないため
 * 残高再計算（決算・再計算機能）で消えてしまう。balance と仕訳由来残高の差分を
 * 「開始残高」仕訳（kind='opening'）として起票し、以後は完全に仕訳ベースで管理する。
 */
async function migrateOpeningBalances() {
  const [users] = await pool.query('SELECT id FROM users') as any
  for (const u of users) {
    const userId = u.id
    const [done] = await pool.query(
      "SELECT value FROM settings WHERE user_id = ? AND key_name = 'opening_migrated'", [userId],
    ) as any
    if (done.length) continue

    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await ensureOpeningJournal(conn, userId)
      await conn.query(
        "INSERT INTO settings (user_id, key_name, value) VALUES (?, 'opening_migrated', '1') ON DUPLICATE KEY UPDATE value = '1'",
        [userId],
      )
      await conn.commit()
    } catch (e) {
      await conn.rollback()
      console.error(`開始残高マイグレーション失敗 user=${userId}:`, e)
    } finally {
      conn.release()
    }
  }
}

/**
 * accounts.balance と仕訳由来残高の差分（＝仕訳の裏付けがない開始残高）を
 * 「開始残高」仕訳として起票する。差分がなければ何もしない。
 * リストア時（旧形式バックアップ）にも使う。conn のトランザクション内で呼ぶこと。
 */
export async function ensureOpeningJournal(conn: any, userId: number) {
  const [accRows] = await conn.query('SELECT code, type, balance FROM accounts WHERE user_id = ?', [userId]) as any
  const [lineRows] = await conn.query(
    `SELECT jl.account_code, jl.side, jl.amount
     FROM journal_lines jl JOIN journals j ON jl.journal_id = j.id
     WHERE j.user_id = ?`, [userId],
  ) as any

  const typeOf = new Map<string, string>(accRows.map((a: any) => [a.code, a.type]))
  const derived = new Map<string, number>()
  for (const l of lineRows) {
    derived.set(l.account_code, (derived.get(l.account_code) ?? 0) + l.amount * balanceSign(typeOf.get(l.account_code), l.side))
  }

  // 残差 = キャッシュ残高 − 仕訳由来残高
  const lines: { side: 'debit' | 'credit'; code: string; amount: number }[] = []
  let debitTotal = 0, creditTotal = 0
  for (const a of accRows) {
    const residual = a.balance - (derived.get(a.code) ?? 0)
    if (residual === 0) continue
    const debitNormal = a.type === 'asset' || a.type === 'expense'
    const side: 'debit' | 'credit' = (residual > 0) === debitNormal ? 'debit' : 'credit'
    const amount = Math.abs(residual)
    lines.push({ side, code: a.code, amount })
    if (side === 'debit') debitTotal += amount; else creditTotal += amount
  }
  if (!lines.length) return

  // 貸借が合わない場合（過去の再計算で一部だけ消えた等）は利益剰余金で調整
  const diff = debitTotal - creditTotal
  if (diff !== 0) {
    console.warn(`開始残高: user=${userId} の残差が貸借不一致（差額 ${diff}）。利益剰余金で調整します`)
    lines.push({ side: diff > 0 ? 'credit' : 'debit', code: '3020', amount: Math.abs(diff) })
  }

  const [fyRows] = await conn.query(
    'SELECT id, start_date FROM fiscal_years WHERE user_id = ? ORDER BY start_date LIMIT 1', [userId],
  ) as any
  if (!fyRows.length) {
    console.warn(`開始残高: user=${userId} は会計年度がないためスキップ`)
    return
  }
  const fy = fyRows[0]
  const [r] = await conn.query(
    "INSERT INTO journals (user_id, fiscal_year_id, date, memo, kind) VALUES (?,?,?,?,'opening')",
    [userId, fy.id, String(fy.start_date).slice(0, 10), '開始残高'],
  ) as any
  await conn.query(
    "INSERT INTO journal_lines (journal_id, side, account_code, partner_code, amount, tax_type) VALUES ?",
    [lines.map(l => [r.insertId, l.side, l.code, '', l.amount, 'none'])],
  )
  console.log(`開始残高: user=${userId} に開始仕訳（${lines.length}行）を作成しました`)
}

// 新規ユーザー登録時に、そのユーザー専用の初期データ（科目・取引先・会計年度・開始仕訳・サンプル仕訳・設定）を投入する
export async function seedUserData(userId: number) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const currentYear = new Date().getFullYear()
    const [fyRes] = await conn.query(
      'INSERT INTO fiscal_years (user_id, name, start_date, end_date) VALUES (?,?,?,?)',
      [userId, `${currentYear}年度`, `${currentYear}-01-01`, `${currentYear}-12-31`],
    ) as any
    const fiscalYearId = fyRes.insertId

    await conn.query(
      'INSERT INTO accounts (user_id, code, name, type, balance, has_sub, default_tax_type) VALUES ?',
      [initialAccounts.map(a => [userId, a.code, a.name, a.type, 0, a.hasSub, a.defaultTaxType ?? 'none'])],
    )
    await conn.query(
      'INSERT INTO partners (user_id, code, name, type, account_code) VALUES ?',
      [initialPartners.map(p => [userId, p.code, p.name, p.type, p.accountCode])],
    )
    await conn.query(
      "INSERT INTO settings (user_id, key_name, value) VALUES (?, 'tax_method', 'inclusive'), (?, 'opening_migrated', '1')",
      [userId, userId],
    )

    // 開始残高は kind='opening' の仕訳として起票する（残高再計算しても失われない）
    const [openRes] = await conn.query(
      "INSERT INTO journals (user_id, fiscal_year_id, date, memo, kind) VALUES (?,?,?,?,'opening')",
      [userId, fiscalYearId, `${currentYear}-01-01`, '開始残高'],
    ) as any
    await conn.query(
      'INSERT INTO journal_lines (journal_id, side, account_code, partner_code, amount, tax_type) VALUES ?',
      [initialOpeningLines.map(l => [openRes.insertId, l.side, l.accountCode, '', l.amount, 'none'])],
    )

    // サンプル仕訳は現在年度の日付で投入する
    for (const j of initialJournals) {
      const [result] = await conn.query(
        "INSERT INTO journals (user_id, fiscal_year_id, date, memo, kind) VALUES (?,?,?,?,'normal')",
        [userId, fiscalYearId, `${currentYear}-${j.monthDay}`, j.memo],
      ) as any
      const journalId = result.insertId
      await conn.query(
        'INSERT INTO journal_lines (journal_id, side, account_code, partner_code, amount, tax_type) VALUES ?',
        [j.lines.map(l => [journalId, l.side, l.accountCode, l.partnerCode, l.amount, l.taxType])],
      )
    }

    // 残高キャッシュを仕訳から構築
    await recomputeBalances(conn, userId)

    await conn.commit()
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

export async function ensureInvoiceSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      user_id       INT          NOT NULL,
      invoice_no    VARCHAR(50)  NOT NULL,
      partner_code  VARCHAR(20)  NOT NULL DEFAULT '',
      partner_name  VARCHAR(255) NOT NULL DEFAULT '',
      partner_addr  VARCHAR(500) NOT NULL DEFAULT '',
      issue_date    DATE         NOT NULL,
      due_date      DATE         NOT NULL,
      memo          VARCHAR(1000) NOT NULL DEFAULT '',
      status        ENUM('draft','sent','paid') NOT NULL DEFAULT 'draft',
      created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_invoices_user_no (user_id, invoice_no),
      INDEX idx_invoices_user (user_id)
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      invoice_id  INT           NOT NULL,
      description VARCHAR(255)  NOT NULL,
      qty         DECIMAL(10,2) NOT NULL DEFAULT 1,
      unit_price  INT           NOT NULL,
      tax_type    ENUM('taxable10','taxable8','exempt') NOT NULL DEFAULT 'taxable10',
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bank_rules (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      user_id      INT          NOT NULL,
      name         VARCHAR(100) NOT NULL,
      keyword      VARCHAR(255) NOT NULL,
      debit_code   VARCHAR(20)  NOT NULL,
      credit_code  VARCHAR(20)  NOT NULL,
      memo_tpl     VARCHAR(255) NOT NULL DEFAULT '',
      priority     INT          NOT NULL DEFAULT 0,
      created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_bank_rules_user (user_id)
    )
  `)

  // 請求書 → 仕訳連動のリンク列
  if (!(await columnExists('invoices', 'sales_journal_id'))) {
    await pool.query('ALTER TABLE invoices ADD COLUMN sales_journal_id INT NULL AFTER status')
  }
  if (!(await columnExists('invoices', 'payment_journal_id'))) {
    await pool.query('ALTER TABLE invoices ADD COLUMN payment_journal_id INT NULL AFTER sales_journal_id')
  }
}

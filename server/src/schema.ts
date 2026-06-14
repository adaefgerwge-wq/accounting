import { pool } from './db.js'
import { initialAccounts, initialJournals, initialPartners } from './seed.js'

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

  // journals テーブル（ヘッダーのみ：日付・摘要）
  await pool.query(`
    CREATE TABLE IF NOT EXISTS journals (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      user_id        INT          NOT NULL,
      fiscal_year_id INT          NOT NULL DEFAULT 1,
      date           DATE         NOT NULL,
      memo           VARCHAR(255) NOT NULL DEFAULT '',
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
}

// 旧（単一テナント）スキーマ → 多ユーザー化。リセット方針のため既存データは破棄して作り直す。
async function migrateToMultiUser() {
  const [accExists] = await pool.query(
    "SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accounts'"
  ) as any
  if (!accExists[0].c) return // accounts 自体が無い＝新規DB。新スキーマでそのまま作成する。

  const [cols] = await pool.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'accounts' AND COLUMN_NAME = 'user_id'"
  ) as any
  if (cols.length) return // 既に多ユーザー化済み

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

// 新規ユーザー登録時に、そのユーザー専用の初期データ（科目・取引先・会計年度・サンプル仕訳・設定）を投入する
export async function seedUserData(userId: number) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const currentYear = new Date().getFullYear()
    const [fyRes] = await conn.query(
      'INSERT INTO fiscal_years (user_id, name, start_date, end_date) VALUES (?,?,?,?)',
      [userId, `${currentYear}年度`, `${currentYear}-01-01`, `${currentYear}-12-31`]
    ) as any
    const fiscalYearId = fyRes.insertId

    await conn.query(
      'INSERT INTO accounts (user_id, code, name, type, balance, has_sub, default_tax_type) VALUES ?',
      [initialAccounts.map(a => [userId, a.code, a.name, a.type, a.balance, a.hasSub, a.defaultTaxType ?? 'none'])]
    )
    await conn.query(
      'INSERT INTO partners (user_id, code, name, type, account_code) VALUES ?',
      [initialPartners.map(p => [userId, p.code, p.name, p.type, p.accountCode])]
    )
    await conn.query(
      "INSERT INTO settings (user_id, key_name, value) VALUES (?, 'tax_method', 'inclusive')",
      [userId]
    )

    for (const j of initialJournals) {
      const [result] = await conn.query(
        'INSERT INTO journals (user_id, fiscal_year_id, date, memo) VALUES (?,?,?,?)',
        [userId, fiscalYearId, j.date, j.memo]
      ) as any
      const journalId = result.insertId
      await conn.query(
        'INSERT INTO journal_lines (journal_id, side, account_code, partner_code, amount, tax_type) VALUES ?',
        [j.lines.map(l => [journalId, l.side, l.accountCode, l.partnerCode, l.amount, l.taxType])]
      )
    }

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
}

import { pool } from './db.js'
import { initialAccounts, initialJournals, initialPartners } from './seed.js'

export async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fiscal_years (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(50)  NOT NULL,
      start_date DATE         NOT NULL,
      end_date   DATE         NOT NULL,
      closed     TINYINT(1)   NOT NULL DEFAULT 0,
      created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      code             VARCHAR(20) PRIMARY KEY,
      name             VARCHAR(255) NOT NULL,
      type             ENUM('asset','liability','equity','revenue','expense') NOT NULL,
      balance          INT          NOT NULL DEFAULT 0,
      has_sub          BOOLEAN      NOT NULL DEFAULT false,
      default_tax_type ENUM('none','taxable10','taxable8','exempt','non_taxable') NOT NULL DEFAULT 'none',
      created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key_name   VARCHAR(50)  PRIMARY KEY,
      value      VARCHAR(255) NOT NULL,
      updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS partners (
      code         VARCHAR(20) PRIMARY KEY,
      name         VARCHAR(255) NOT NULL,
      type         ENUM('customer','vendor','both') NOT NULL,
      account_code VARCHAR(20)  NOT NULL DEFAULT '',
      created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_partners_account_code (account_code)
    )
  `)

  // 汎用補助科目（取引先以外：銀行口座・経費区分など）
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sub_accounts (
      code         VARCHAR(20) PRIMARY KEY,
      name         VARCHAR(255) NOT NULL,
      account_code VARCHAR(20)  NOT NULL,
      created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_sub_accounts_account_code (account_code)
    )
  `)

  // journals テーブル（ヘッダーのみ：日付・摘要）
  await pool.query(`
    CREATE TABLE IF NOT EXISTS journals (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      fiscal_year_id INT          NOT NULL DEFAULT 1,
      date           DATE         NOT NULL,
      memo           VARCHAR(255) NOT NULL DEFAULT '',
      created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_journals_date (date),
      INDEX idx_journals_fiscal_year (fiscal_year_id),
      FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_years(id)
    )
  `)

  // journal_lines テーブル（借方・貸方の各行）
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

  // 既存カラムのマイグレーション
  await pool.query(`
    ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS default_tax_type ENUM('none','taxable10','taxable8','exempt','non_taxable') NOT NULL DEFAULT 'none' AFTER has_sub
  `).catch(() => {})

  await backfillTaxDefaults()
  await migrateToJournalLines()
}

// 既存DB向け：journals の旧1行形式（debit/credit/amount カラム）を journal_lines へ移行
async function migrateToJournalLines() {
  // debit カラムが journals に残っているか確認
  const [cols] = await pool.query(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'journals' AND COLUMN_NAME = 'debit'"
  ) as any
  if (!cols.length) return // 既に移行済み

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    // 既存仕訳を journal_lines に変換（借方行）
    await conn.query(`
      INSERT INTO journal_lines (journal_id, side, account_code, partner_code, amount, tax_type)
      SELECT id, 'debit', debit, IFNULL(debit_partner,''), amount, tax_type FROM journals WHERE debit IS NOT NULL AND debit != ''
    `)
    // 貸方行（tax_type は対象外として格納、課税側は借方または貸方の課税科目に付く）
    await conn.query(`
      INSERT INTO journal_lines (journal_id, side, account_code, partner_code, amount, tax_type)
      SELECT id, 'credit', credit, IFNULL(credit_partner,''), amount,
        CASE WHEN credit IN (SELECT code FROM accounts WHERE type = 'revenue') THEN tax_type ELSE 'none' END
      FROM journals WHERE credit IS NOT NULL AND credit != ''
    `)

    // journals から不要カラムを削除（IF EXISTS 非対応のMySQLに対応）
    for (const col of ['debit','debit_partner','credit','credit_partner','amount','tax_type']) {
      await conn.query(`ALTER TABLE journals DROP COLUMN \`${col}\``).catch(() => {})
    }

    await conn.commit()
    console.log('journals → journal_lines 移行完了')
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
  }
}

// 科目デフォルト税区分の初期設定（一度きり）
async function backfillTaxDefaults() {
  await pool.query(
    "INSERT IGNORE INTO accounts (code, name, type, balance, has_sub, default_tax_type) VALUES " +
    "('1150','仮払消費税','asset',0,false,'none'),('2050','仮受消費税','liability',0,false,'none')"
  ).catch(() => {})

  const [rows] = await pool.query("SELECT value FROM settings WHERE key_name = 'tax_defaults_seeded'") as any
  if (rows.length) return
  await pool.query("UPDATE accounts SET default_tax_type = 'taxable10' WHERE code IN ('1500','4010','5010','5030')")
  await pool.query(
    "INSERT INTO settings (key_name, value) VALUES ('tax_defaults_seeded','1') ON DUPLICATE KEY UPDATE value = '1'"
  )
}

export async function seedIfEmpty() {
  // 初期化済み判定は会計年度の有無で行う。
  // accounts は backfillTaxDefaults が消費税科目を先に入れるため、件数で判定すると
  // 新規DBでも「初期化済み」と誤判定してしまう。
  const [fyRows] = await pool.query('SELECT COUNT(*) AS count FROM fiscal_years')
  const [{ count }] = fyRows as [{ count: number }]
  if (count > 0) return

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const currentYear = new Date().getFullYear()
    await connection.query(
      'INSERT INTO fiscal_years (id, name, start_date, end_date) VALUES (1, ?, ?, ?)',
      [`${currentYear}年度`, `${currentYear}-01-01`, `${currentYear}-12-31`]
    )
    // backfillTaxDefaults が先に入れた消費税科目(1150/2050)と衝突しないよう IGNORE
    await connection.query(
      'INSERT IGNORE INTO accounts (code, name, type, balance, has_sub, default_tax_type) VALUES ?',
      [initialAccounts.map(a => [a.code, a.name, a.type, a.balance, a.hasSub, a.defaultTaxType ?? 'none'])]
    )
    await connection.query(
      'INSERT INTO partners (code, name, type, account_code) VALUES ?',
      [initialPartners.map(p => [p.code, p.name, p.type, p.accountCode])]
    )
    for (const j of initialJournals) {
      const [result] = await connection.query(
        'INSERT INTO journals (id, fiscal_year_id, date, memo) VALUES (?,?,?,?)',
        [j.id, 1, j.date, j.memo]
      ) as any
      const journalId = result.insertId
      await connection.query(
        'INSERT INTO journal_lines (journal_id, side, account_code, partner_code, amount, tax_type) VALUES ?',
        [j.lines.map(l => [journalId, l.side, l.accountCode, l.partnerCode, l.amount, l.taxType])]
      )
    }

    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export async function ensureInvoiceSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      invoice_no    VARCHAR(50)  NOT NULL UNIQUE,
      partner_code  VARCHAR(20)  NOT NULL DEFAULT '',
      partner_name  VARCHAR(255) NOT NULL DEFAULT '',
      partner_addr  VARCHAR(500) NOT NULL DEFAULT '',
      issue_date    DATE         NOT NULL,
      due_date      DATE         NOT NULL,
      memo          VARCHAR(1000) NOT NULL DEFAULT '',
      status        ENUM('draft','sent','paid') NOT NULL DEFAULT 'draft',
      created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
      name         VARCHAR(100) NOT NULL,
      keyword      VARCHAR(255) NOT NULL,
      debit_code   VARCHAR(20)  NOT NULL,
      credit_code  VARCHAR(20)  NOT NULL,
      memo_tpl     VARCHAR(255) NOT NULL DEFAULT '',
      priority     INT          NOT NULL DEFAULT 0,
      created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

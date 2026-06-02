import { pool } from './db.js'
import { initialAccounts, initialJournals, initialPartners } from './seed.js'

export async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      code VARCHAR(20) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type ENUM('asset', 'liability', 'equity', 'revenue', 'expense') NOT NULL,
      balance INT NOT NULL DEFAULT 0,
      has_sub BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS partners (
      code VARCHAR(20) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type ENUM('customer', 'vendor', 'both') NOT NULL,
      account_code VARCHAR(20) NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_partners_account_code (account_code)
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS journals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      date DATE NOT NULL,
      debit VARCHAR(20) NOT NULL,
      debit_partner VARCHAR(20) NOT NULL DEFAULT '',
      credit VARCHAR(20) NOT NULL,
      credit_partner VARCHAR(20) NOT NULL DEFAULT '',
      amount INT NOT NULL,
      memo VARCHAR(255) NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_journals_date (date),
      INDEX idx_journals_debit (debit),
      INDEX idx_journals_credit (credit)
    )
  `)
}

export async function seedIfEmpty() {
  const [accountRows] = await pool.query('SELECT COUNT(*) AS count FROM accounts')
  const [{ count }] = accountRows as [{ count: number }]
  if (count > 0) return

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    await connection.query(
      'INSERT INTO accounts (code, name, type, balance, has_sub) VALUES ?',
      [initialAccounts.map(a => [a.code, a.name, a.type, a.balance, a.hasSub])]
    )
    await connection.query(
      'INSERT INTO partners (code, name, type, account_code) VALUES ?',
      [initialPartners.map(p => [p.code, p.name, p.type, p.accountCode])]
    )
    await connection.query(
      'INSERT INTO journals (id, date, debit, debit_partner, credit, credit_partner, amount, memo) VALUES ?',
      [initialJournals.map(j => [j.id, j.date, j.debit, j.debitPartner, j.credit, j.creditPartner, j.amount, j.memo])]
    )

    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

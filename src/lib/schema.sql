-- ==============================================================================
-- 🕌 Masjid Accounting - Cloudflare D1 (SQLite) Master Database Schema
-- ==============================================================================

-- 1. Organisation Profile & Settings
CREATE TABLE IF NOT EXISTS organisations (
  id TEXT PRIMARY KEY DEFAULT 'main',
  name TEXT NOT NULL,
  short_name TEXT,
  tagline TEXT,
  charity_number TEXT,
  address TEXT,
  email TEXT,
  phone TEXT,
  currency_symbol TEXT DEFAULT '£',
  country TEXT DEFAULT 'United Kingdom',
  receipt_counter INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. System Users & RBAC (ADMIN, REVIEWER, AUDITOR)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'REVIEWER', 'AUDITOR')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

-- 3. Islamic Funds (Restricted: Zakat, Fitrana, Riba; Unrestricted: Lillah, Building, etc.)
CREATE TABLE IF NOT EXISTS funds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_restricted INTEGER NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

-- 4. Donors with HMRC Gift Aid Declarations
CREATE TABLE IF NOT EXISTS donors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  is_anonymous INTEGER DEFAULT 0,
  gift_aid_eligible INTEGER DEFAULT 0,
  gift_aid_declaration_date TEXT,
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  postcode TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

-- 5. Financial Transactions (Ledger Core)
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'BANKED', 'VOIDED', 'FAILED')),
  method TEXT NOT NULL DEFAULT 'CASH',
  total_amount REAL NOT NULL,
  transaction_date TEXT NOT NULL,
  donor_id TEXT REFERENCES donors(id),
  receipt_url TEXT,
  receipt_number TEXT,
  reference_note TEXT,
  category TEXT NOT NULL,
  gift_aid INTEGER DEFAULT 0,
  notes TEXT,
  reconciled INTEGER DEFAULT 0,
  void_reason TEXT,
  voided_at TEXT,
  voided_by TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 6. Multi-Fund Transaction Splits (Atomic Allocation)
CREATE TABLE IF NOT EXISTS transaction_splits (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  fund_id TEXT NOT NULL REFERENCES funds(id),
  amount REAL NOT NULL,
  is_voided INTEGER DEFAULT 0,
  voided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 7. Audit Logs (Immutable Governance Trail)
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL,
  user_id TEXT,
  user_email TEXT,
  user_name TEXT,
  metadata TEXT, -- JSON blob for extra context / diffs
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 8. Persistent Rate Limiter Hits (Edge Multi-Instance Protection)
CREATE TABLE IF NOT EXISTS rate_limit_hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 9. Fund Budgets & Spending Limits (Islamic Financial Planning)
CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  fund_id TEXT NOT NULL REFERENCES funds(id),
  fiscal_year INTEGER NOT NULL,
  target_amount REAL NOT NULL,
  max_spend_limit REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  UNIQUE (fund_id, fiscal_year)
);

-- 10. Asnaf Beneficiary Records (Zakat & Fitrana Distribution Auditing)
CREATE TABLE IF NOT EXISTS asnaf_records (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  beneficiary_name TEXT NOT NULL,
  asnaf_category TEXT NOT NULL CHECK (asnaf_category IN ('FUQARA', 'MASAKEEN', 'AMILINA_ALAYHA', 'MUALLAFAT_QULUB', 'FIR_RIQAB', 'GHARIMEEN', 'FI_SABILILLAH', 'IBN_SABIL')),
  amount REAL NOT NULL,
  distribution_date TEXT NOT NULL,
  witness_name TEXT,
  verification_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for lightning fast lookups and aggregations
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_tx_donor ON transactions(donor_id);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_tx_reconciled ON transactions(reconciled);

CREATE INDEX IF NOT EXISTS idx_splits_tx ON transaction_splits(transaction_id);
CREATE INDEX IF NOT EXISTS idx_splits_fund ON transaction_splits(fund_id);
CREATE INDEX IF NOT EXISTS idx_splits_voided ON transaction_splits(is_voided);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_table_record ON audit_logs(table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_rate_limit_key_time ON rate_limit_hits(key, timestamp);

CREATE INDEX IF NOT EXISTS idx_asnaf_tx ON asnaf_records(transaction_id);
CREATE INDEX IF NOT EXISTS idx_asnaf_category ON asnaf_records(asnaf_category);

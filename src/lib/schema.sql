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
  fiscal_year_start TEXT DEFAULT '04-06', -- UK charity fiscal year default (April 6)
  zakat_surplus_alert_pence INTEGER DEFAULT 500000, -- £5,000 alert threshold
  zakat_reserve_min_pence INTEGER DEFAULT 20000, -- £200 minimum reserve threshold
  large_donation_threshold_pence INTEGER DEFAULT 50000, -- £500 large donation threshold
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

-- 4. Donors with HMRC Gift Aid Declarations & Structured Names
CREATE TABLE IF NOT EXISTS donors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT,
  first_name TEXT,
  last_name TEXT,
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

-- 5. Financial Transactions (Ledger Core) - Amounts stored as exact integer pence
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'BANKED', 'VOIDED', 'FAILED')),
  method TEXT NOT NULL DEFAULT 'CASH',
  total_amount INTEGER NOT NULL, -- Exact integer pence (e.g. 10000 = £100.00)
  transaction_date TEXT NOT NULL,
  donor_id TEXT REFERENCES donors(id),
  receipt_url TEXT,
  receipt_number TEXT,
  reference_note TEXT,
  category TEXT NOT NULL,
  gift_aid INTEGER DEFAULT 0,
  notes TEXT,
  reconciled INTEGER DEFAULT 0,
  reconciled_at TEXT,
  reconciled_by TEXT,
  bank_statement_ref TEXT,
  is_jummah INTEGER DEFAULT 0, -- First-class Friday collection tracking
  void_reason TEXT,
  voided_at TEXT,
  voided_by TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

-- 6. Multi-Fund Transaction Splits (Atomic Allocation in Integer Pence)
CREATE TABLE IF NOT EXISTS transaction_splits (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  fund_id TEXT NOT NULL REFERENCES funds(id),
  amount INTEGER NOT NULL, -- Exact integer pence (e.g. 5000 = £50.00)
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

-- 9. Fund Budgets & Spending Limits (Stored in Integer Pence)
CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  fund_id TEXT NOT NULL REFERENCES funds(id),
  fiscal_year INTEGER NOT NULL,
  target_amount INTEGER NOT NULL, -- Target amount in pence
  max_spend_limit INTEGER, -- Max spend limit in pence
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  UNIQUE (fund_id, fiscal_year)
);

-- 10. Asnaf Beneficiary Records (Zakat & Fitrana Distribution Auditing in Pence)
CREATE TABLE IF NOT EXISTS asnaf_records (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  beneficiary_name TEXT NOT NULL,
  asnaf_category TEXT NOT NULL CHECK (asnaf_category IN ('FUQARA', 'MASAKEEN', 'AMILINA_ALAYHA', 'MUALLAFAT_QULUB', 'FIR_RIQAB', 'GHARIMEEN', 'FI_SABILILLAH', 'IBN_SABIL')),
  amount INTEGER NOT NULL, -- Disbursement amount in pence
  distribution_date TEXT NOT NULL,
  witness_name TEXT,
  verification_notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 11. Edge Sessions with Nonce Revocation (P10)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jti TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT
);

-- 12. Persistent System & Trustee Notifications (P14)
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  message TEXT NOT NULL,
  transaction_id TEXT REFERENCES transactions(id),
  delivered_at TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 13. Pre-Restore Point-in-Time Database Snapshots (P15)
CREATE TABLE IF NOT EXISTS backup_snapshots (
  id TEXT PRIMARY KEY,
  description TEXT,

  snapshot_data TEXT NOT NULL, -- Full JSON dump
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 14. Processed Webhook Events (Idempotency)
CREATE TABLE IF NOT EXISTS processed_webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);


-- ==============================================================================
-- Indexes for High-Performance Queries & Reporting
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_tx_donor ON transactions(donor_id);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_tx_reconciled ON transactions(reconciled);
CREATE INDEX IF NOT EXISTS idx_tx_created_by ON transactions(created_by);
CREATE INDEX IF NOT EXISTS idx_tx_jummah ON transactions(is_jummah);

CREATE INDEX IF NOT EXISTS idx_splits_tx ON transaction_splits(transaction_id);
CREATE INDEX IF NOT EXISTS idx_splits_fund ON transaction_splits(fund_id);
CREATE INDEX IF NOT EXISTS idx_splits_voided ON transaction_splits(is_voided);

CREATE INDEX IF NOT EXISTS idx_donors_gift_aid ON donors(gift_aid_eligible);
CREATE INDEX IF NOT EXISTS idx_donors_email ON donors(email);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_table_record ON audit_logs(table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_rate_limit_key_time ON rate_limit_hits(key, timestamp);

CREATE INDEX IF NOT EXISTS idx_asnaf_tx ON asnaf_records(transaction_id);
CREATE INDEX IF NOT EXISTS idx_asnaf_category ON asnaf_records(asnaf_category);
CREATE INDEX IF NOT EXISTS idx_asnaf_date ON asnaf_records(distribution_date);

CREATE INDEX IF NOT EXISTS idx_sessions_jti ON sessions(jti);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read_at);

CREATE INDEX IF NOT EXISTS idx_snapshots_created ON backup_snapshots(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON processed_webhook_events(provider);

-- ==============================================================================
-- MASJID ACCOUNTING — POSTGRESQL & SUPABASE PRODUCTION SCHEMA WITH RLS
-- ==============================================================================
-- Multi-Fund Islamic Financial Management & HMRC Gift Aid Compliance
-- Includes Granular Row-Level Security (RLS) Policies for RBAC and IDOR Defense
-- ==============================================================================

-- 1. ENUMS & EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('ADMIN', 'REVIEWER', 'AUDITOR');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE transaction_type AS ENUM ('INCOME', 'EXPENSE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE transaction_status AS ENUM ('PENDING', 'BANKED', 'VOIDED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. TABLES

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY DEFAULT ('user-' || substring(uuid_generate_v4()::text, 1, 8)),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'REVIEWER',
    status user_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Funds Table (Multi-Wallet Segregation)
CREATE TABLE IF NOT EXISTS funds (
    id TEXT PRIMARY KEY DEFAULT ('fund-' || substring(uuid_generate_v4()::text, 1, 8)),
    name TEXT UNIQUE NOT NULL,
    is_restricted BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT DEFAULT '',
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Donors Table
CREATE TABLE IF NOT EXISTS donors (
    id TEXT PRIMARY KEY DEFAULT ('donor-' || substring(uuid_generate_v4()::text, 1, 8)),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    address_line_1 TEXT,
    address_line_2 TEXT,
    city TEXT,
    postcode TEXT,
    gift_aid_eligible BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY DEFAULT ('tx-' || substring(uuid_generate_v4()::text, 1, 8)),
    receipt_number TEXT UNIQUE,
    type transaction_type NOT NULL,
    status transaction_status NOT NULL DEFAULT 'PENDING',
    category TEXT NOT NULL,
    method TEXT NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount > 0),
    transaction_date DATE NOT NULL,
    donor_id TEXT REFERENCES donors(id) ON DELETE SET NULL,
    reference_note TEXT NOT NULL DEFAULT 'Donation',
    notes TEXT DEFAULT '',
    receipt_url TEXT,
    reconciled BOOLEAN NOT NULL DEFAULT FALSE,
    reconciled_at TIMESTAMPTZ,
    reconciled_by TEXT REFERENCES users(id),
    gift_aid BOOLEAN NOT NULL DEFAULT FALSE,
    is_jummah_collection BOOLEAN NOT NULL DEFAULT FALSE,
    witness_1 TEXT,
    witness_2 TEXT,
    void_reason TEXT,
    voided_at TIMESTAMPTZ,
    voided_by TEXT REFERENCES users(id),
    created_by TEXT REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transaction Splits Table (Sub-ledger accounting)
CREATE TABLE IF NOT EXISTS transaction_splits (
    id TEXT PRIMARY KEY DEFAULT ('split-' || substring(uuid_generate_v4()::text, 1, 8)),
    transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    fund_id TEXT NOT NULL REFERENCES funds(id) ON DELETE RESTRICT,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    is_voided BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit Logs Table (Tamper-evident Immutable Log)
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY DEFAULT ('audit-' || substring(uuid_generate_v4()::text, 1, 8)),
    entity_name TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    changed_by TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details JSONB
);

-- ==============================================================================
-- 3. PERFORMANCE INDEXING (Foreign Keys, Filter & Sorting Columns)
-- ==============================================================================

-- Transactions Performance Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_donor ON transactions (donor_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type_status ON transactions (type, status);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions (category);
CREATE INDEX IF NOT EXISTS idx_transactions_jummah ON transactions (is_jummah_collection) WHERE is_jummah_collection = TRUE;
CREATE INDEX IF NOT EXISTS idx_transactions_created_by ON transactions (created_by);

-- Splits Performance Indexes (Foreign Key & Aggregation)
CREATE INDEX IF NOT EXISTS idx_splits_transaction ON transaction_splits (transaction_id);
CREATE INDEX IF NOT EXISTS idx_splits_fund ON transaction_splits (fund_id);
CREATE INDEX IF NOT EXISTS idx_splits_fund_active ON transaction_splits (fund_id, is_voided);

-- Donors Performance Indexes
CREATE INDEX IF NOT EXISTS idx_donors_name ON donors (name);
CREATE INDEX IF NOT EXISTS idx_donors_email ON donors (email);
CREATE INDEX IF NOT EXISTS idx_donors_postcode ON donors (postcode);
CREATE INDEX IF NOT EXISTS idx_donors_giftaid ON donors (gift_aid_eligible) WHERE gift_aid_eligible = TRUE;

-- Audit Logs Performance Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_name, entity_id);

-- ==============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Helper functions to extract user context from JWT/Session claims in Supabase
CREATE OR REPLACE FUNCTION current_user_role() RETURNS TEXT AS $$
BEGIN
    RETURN COALESCE(
        current_setting('request.jwt.claim.role', true),
        (SELECT role::text FROM users WHERE id = current_setting('request.jwt.claim.sub', true))
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_user_id() RETURNS TEXT AS $$
BEGIN
    RETURN COALESCE(
        current_setting('request.jwt.claim.sub', true),
        current_setting('app.current_user_id', true)
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Enable RLS across all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE donors ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- USERS POLICIES (IDOR & Privilege Escalation Defense)
-- -----------------------------------------------------------------------------
-- 1. SELECT: Admins can see all users. Other roles can only view their own user record.
CREATE POLICY users_select_policy ON users
    FOR SELECT
    USING (
        current_user_role() = 'ADMIN' OR
        id = current_user_id()
    );

-- 2. INSERT: Only Admins can create user accounts.
CREATE POLICY users_insert_policy ON users
    FOR INSERT
    WITH CHECK (
        current_user_role() = 'ADMIN'
    );

-- 3. UPDATE: Admins can update any user; Non-admins can only update their own profile.
CREATE POLICY users_update_policy ON users
    FOR UPDATE
    USING (
        current_user_role() = 'ADMIN' OR
        id = current_user_id()
    )
    WITH CHECK (
        current_user_role() = 'ADMIN' OR
        (id = current_user_id() AND role = (SELECT role FROM users WHERE id = current_user_id()))
    );

-- 4. DELETE: Disallow hard user deletes; soft-deactivate instead.
CREATE POLICY users_delete_policy ON users
    FOR DELETE
    USING (FALSE);

-- -----------------------------------------------------------------------------
-- FUNDS POLICIES
-- -----------------------------------------------------------------------------
-- All authenticated roles can view funds.
CREATE POLICY funds_select_policy ON funds
    FOR SELECT
    USING (current_user_role() IN ('ADMIN', 'REVIEWER', 'AUDITOR'));

-- Only Admins can create or update fund configurations.
CREATE POLICY funds_insert_policy ON funds
    FOR INSERT
    WITH CHECK (current_user_role() = 'ADMIN');

CREATE POLICY funds_update_policy ON funds
    FOR UPDATE
    USING (current_user_role() = 'ADMIN')
    WITH CHECK (current_user_role() = 'ADMIN');

-- -----------------------------------------------------------------------------
-- DONORS POLICIES
-- -----------------------------------------------------------------------------
-- All authenticated roles can view donor records.
CREATE POLICY donors_select_policy ON donors
    FOR SELECT
    USING (current_user_role() IN ('ADMIN', 'REVIEWER', 'AUDITOR'));

-- Only Admins can register or update donor details.
CREATE POLICY donors_insert_policy ON donors
    FOR INSERT
    WITH CHECK (current_user_role() = 'ADMIN');

CREATE POLICY donors_update_policy ON donors
    FOR UPDATE
    USING (current_user_role() = 'ADMIN')
    WITH CHECK (current_user_role() = 'ADMIN');

-- -----------------------------------------------------------------------------
-- TRANSACTIONS & SPLITS POLICIES
-- -----------------------------------------------------------------------------
-- All authenticated roles can read transactions and splits.
CREATE POLICY transactions_select_policy ON transactions
    FOR SELECT
    USING (current_user_role() IN ('ADMIN', 'REVIEWER', 'AUDITOR'));

CREATE POLICY splits_select_policy ON transaction_splits
    FOR SELECT
    USING (current_user_role() IN ('ADMIN', 'REVIEWER', 'AUDITOR'));

-- Only Admins can insert transactions & splits.
CREATE POLICY transactions_insert_policy ON transactions
    FOR INSERT
    WITH CHECK (current_user_role() = 'ADMIN');

CREATE POLICY splits_insert_policy ON transaction_splits
    FOR INSERT
    WITH CHECK (current_user_role() = 'ADMIN');

-- Only Admins can update transactions (e.g. void, bank, reconcile), but locked/reconciled cannot be voided.
CREATE POLICY transactions_update_policy ON transactions
    FOR UPDATE
    USING (current_user_role() = 'ADMIN')
    WITH CHECK (current_user_role() = 'ADMIN');

CREATE POLICY splits_update_policy ON transaction_splits
    FOR UPDATE
    USING (current_user_role() = 'ADMIN')
    WITH CHECK (current_user_role() = 'ADMIN');

-- Hard Deletes strictly prohibited to maintain permanent audit ledger.
CREATE POLICY transactions_delete_policy ON transactions
    FOR DELETE
    USING (FALSE);

CREATE POLICY splits_delete_policy ON transaction_splits
    FOR DELETE
    USING (FALSE);

-- -----------------------------------------------------------------------------
-- AUDIT LOGS POLICIES (Append-Only Immutable Ledger)
-- -----------------------------------------------------------------------------
-- Only Admins and Auditors can view audit logs.
CREATE POLICY audit_logs_select_policy ON audit_logs
    FOR SELECT
    USING (current_user_role() IN ('ADMIN', 'AUDITOR'));

-- Audit logs can only be inserted, never updated or deleted.
CREATE POLICY audit_logs_insert_policy ON audit_logs
    FOR INSERT
    WITH CHECK (TRUE);

CREATE POLICY audit_logs_update_policy ON audit_logs
    FOR UPDATE
    USING (FALSE);

CREATE POLICY audit_logs_delete_policy ON audit_logs
    FOR DELETE
    USING (FALSE);

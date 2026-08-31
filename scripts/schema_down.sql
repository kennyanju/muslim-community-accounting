-- ==============================================================================
-- MASJID ACCOUNTING — REVERSE MIGRATION (DOWN-PATH)
-- ==============================================================================
-- Safely drops all Row-Level Security policies, indexes, tables, and types
-- in reverse dependency order.
-- ==============================================================================

-- 1. DROP ROW LEVEL SECURITY POLICIES
DROP POLICY IF EXISTS users_select_policy ON users;
DROP POLICY IF EXISTS users_insert_policy ON users;
DROP POLICY IF EXISTS users_update_policy ON users;
DROP POLICY IF EXISTS users_delete_policy ON users;

DROP POLICY IF EXISTS funds_select_policy ON funds;
DROP POLICY IF EXISTS funds_insert_policy ON funds;
DROP POLICY IF EXISTS funds_update_policy ON funds;

DROP POLICY IF EXISTS donors_select_policy ON donors;
DROP POLICY IF EXISTS donors_insert_policy ON donors;
DROP POLICY IF EXISTS donors_update_policy ON donors;

DROP POLICY IF EXISTS transactions_select_policy ON transactions;
DROP POLICY IF EXISTS splits_select_policy ON transaction_splits;
DROP POLICY IF EXISTS transactions_insert_policy ON transactions;
DROP POLICY IF EXISTS splits_insert_policy ON transaction_splits;
DROP POLICY IF EXISTS transactions_update_policy ON transactions;
DROP POLICY IF EXISTS splits_update_policy ON transaction_splits;
DROP POLICY IF EXISTS transactions_delete_policy ON transactions;
DROP POLICY IF EXISTS splits_delete_policy ON transaction_splits;

DROP POLICY IF EXISTS audit_logs_select_policy ON audit_logs;
DROP POLICY IF EXISTS audit_logs_insert_policy ON audit_logs;
DROP POLICY IF EXISTS audit_logs_update_policy ON audit_logs;
DROP POLICY IF EXISTS audit_logs_delete_policy ON audit_logs;

-- 2. DROP PERFORMANCE INDEXES
DROP INDEX IF EXISTS idx_transactions_date;
DROP INDEX IF EXISTS idx_transactions_donor;
DROP INDEX IF EXISTS idx_transactions_type_status;
DROP INDEX IF EXISTS idx_transactions_category;
DROP INDEX IF EXISTS idx_transactions_jummah;
DROP INDEX IF EXISTS idx_transactions_created_by;

DROP INDEX IF EXISTS idx_splits_transaction;
DROP INDEX IF EXISTS idx_splits_fund;
DROP INDEX IF EXISTS idx_splits_fund_active;

DROP INDEX IF EXISTS idx_donors_name;
DROP INDEX IF EXISTS idx_donors_email;
DROP INDEX IF EXISTS idx_donors_postcode;
DROP INDEX IF EXISTS idx_donors_giftaid;

DROP INDEX IF EXISTS idx_audit_logs_timestamp;
DROP INDEX IF EXISTS idx_audit_logs_entity;

-- 3. DROP TABLES (Reverse Foreign Key Order)
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS transaction_splits CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS donors CASCADE;
DROP TABLE IF EXISTS funds CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 4. DROP HELPER FUNCTIONS
DROP FUNCTION IF EXISTS current_user_role();
DROP FUNCTION IF EXISTS current_user_id();

-- 5. DROP CUSTOM ENUM TYPES
DROP TYPE IF EXISTS transaction_status;
DROP TYPE IF EXISTS transaction_type;
DROP TYPE IF EXISTS user_status;
DROP TYPE IF EXISTS user_role;

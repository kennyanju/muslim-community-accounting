import fs from 'fs';
import path from 'path';

let localSqliteInstance = null;
let schemaLoaded = false;

/**
 * Returns the path to the local SQLite database file
 */
export function getLocalDbPath() {
  return path.join(process.cwd(), 'src/data/masjid.sqlite');
}

/**
 * Read schema.sql content safely
 */
export function getSchemaSql() {
  const schemaPath = path.join(process.cwd(), 'src/lib/schema.sql');
  if (fs.existsSync(schemaPath)) {
    return fs.readFileSync(schemaPath, 'utf8');
  }
  return '';
}

/**
 * Ensures newly introduced schema columns are added to existing SQLite tables.
 */
function applySchemaMigrations(sqlite) {
  try {
    const orgCols = sqlite.prepare("PRAGMA table_info(organisations)").all().map(c => c.name);
    if (orgCols.length > 0 && !orgCols.includes('approval_threshold_pence')) {
      sqlite.exec("ALTER TABLE organisations ADD COLUMN approval_threshold_pence INTEGER DEFAULT 100000;");
    }

    const txTableRow = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'").get();
    if (txTableRow && txTableRow.sql && !txTableRow.sql.includes('PENDING_APPROVAL')) {
      sqlite.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE transactions_migrated (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
          status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'BANKED', 'VOIDED', 'FAILED', 'PENDING_APPROVAL')),
          method TEXT NOT NULL DEFAULT 'CASH',
          total_amount INTEGER NOT NULL,
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
          is_jummah INTEGER DEFAULT 0,
          approval_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED' CHECK (approval_status IN ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED')),
          approved_by TEXT REFERENCES users(id),
          approved_at TEXT,
          rejected_by TEXT REFERENCES users(id),
          rejected_at TEXT,
          rejection_reason TEXT,
          void_reason TEXT,
          voided_at TEXT,
          voided_by TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT
        );
        INSERT INTO transactions_migrated (
          id, type, status, method, total_amount, transaction_date, donor_id,
          receipt_url, receipt_number, reference_note, category, gift_aid,
          notes, reconciled, reconciled_at, reconciled_by, bank_statement_ref,
          is_jummah, created_by, created_at, updated_at
        )
        SELECT 
          id, type, status, method, total_amount, transaction_date, donor_id,
          receipt_url, receipt_number, reference_note, category, gift_aid,
          notes, reconciled, reconciled_at, reconciled_by, bank_statement_ref,
          is_jummah, created_by, created_at, updated_at
        FROM transactions;
        DROP TABLE transactions;
        ALTER TABLE transactions_migrated RENAME TO transactions;
        PRAGMA foreign_keys = ON;
      `);
    }

    const txCols = sqlite.prepare("PRAGMA table_info(transactions)").all().map(c => c.name);
    if (txCols.length > 0) {
      if (!txCols.includes('approval_status')) {
        sqlite.exec("ALTER TABLE transactions ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED';");
      }
      if (!txCols.includes('approved_by')) {
        sqlite.exec("ALTER TABLE transactions ADD COLUMN approved_by TEXT REFERENCES users(id);");
      }
      if (!txCols.includes('approved_at')) {
        sqlite.exec("ALTER TABLE transactions ADD COLUMN approved_at TEXT;");
      }
      if (!txCols.includes('rejected_by')) {
        sqlite.exec("ALTER TABLE transactions ADD COLUMN rejected_by TEXT REFERENCES users(id);");
      }
      if (!txCols.includes('rejected_at')) {
        sqlite.exec("ALTER TABLE transactions ADD COLUMN rejected_at TEXT;");
      }
      if (!txCols.includes('rejection_reason')) {
        sqlite.exec("ALTER TABLE transactions ADD COLUMN rejection_reason TEXT;");
      }
    }
  } catch (_) {
    // Non-fatal if tables are being initialized for the first time
  }
}

/**
 * Synchronously initializes or retrieves the local node:sqlite database.
 * Used for local development, test suites, and CLI scripts.
 */
export function getSyncSqliteDb(options = {}) {
  const { memory = false, fresh = false } = options;

  if (fresh && localSqliteInstance) {
    try { localSqliteInstance.close(); } catch (_) {}
    localSqliteInstance = null;
    schemaLoaded = false;
  }

  if (localSqliteInstance && !memory) {
    return localSqliteInstance;
  }

  try {
    const { DatabaseSync } = require('node:sqlite');
    const dbPath = memory ? ':memory:' : getLocalDbPath();
    const dbDir = path.dirname(dbPath);
    if (!memory && !fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const sqlite = new DatabaseSync(dbPath);
    
    // Enable Foreign Keys & WAL mode for performance
    try {
      sqlite.exec('PRAGMA foreign_keys = ON;');
      if (!memory) {
        sqlite.exec('PRAGMA journal_mode = WAL;');
      }
    } catch (_) {}

    // Ensure schema is applied
    const schemaSql = getSchemaSql();
    if (schemaSql) {
      applySchemaMigrations(sqlite);
      sqlite.exec(schemaSql);
      applySchemaMigrations(sqlite);
    }

    if (!memory) {
      localSqliteInstance = sqlite;
      schemaLoaded = true;
    }

    return sqlite;
  } catch (err) {
    // Fallback if node:sqlite requires dynamic import (ESM environment)
    return null;
  }
}

/**
 * Creates a D1-compatible statement wrapper around a node:sqlite prepared statement.
 */
function createD1StatementWrapper(sqlite, sql, initialArgs = []) {
  let boundArgs = [...initialArgs];

  const wrapper = {
    bind(...args) {
      boundArgs = args;
      return wrapper;
    },
    async all() {
      try {
        const stmt = sqlite.prepare(sql);
        const results = stmt.all(...boundArgs);
        return { results: results.map(r => ({ ...r })), success: true, meta: { changes: 0 } };
      } catch (e) {
        console.error('D1 Local SQLite all() Error:', e.message, 'SQL:', sql, 'ARGS:', boundArgs);
        throw e;
      }
    },
    async first(colName) {
      try {
        const stmt = sqlite.prepare(sql);
        const row = stmt.get(...boundArgs);
        if (!row) return null;
        const obj = { ...row };
        if (colName) return obj[colName] !== undefined ? obj[colName] : null;
        return obj;
      } catch (e) {
        console.error('D1 Local SQLite first() Error:', e.message, 'SQL:', sql, 'ARGS:', boundArgs);
        throw e;
      }
    },
    async run() {
      try {
        const stmt = sqlite.prepare(sql);
        const info = stmt.run(...boundArgs);
        return {
          success: true,
          meta: {
            changes: info.changes || 0,
            last_row_id: Number(info.lastInsertRowid || 0)
          }
        };
      } catch (e) {
        console.error('D1 Local SQLite run() Error:', e.message, 'SQL:', sql, 'ARGS:', boundArgs);
        throw e;
      }
    },
    // Synchronous equivalents for sync callers
    allSync() {
      const stmt = sqlite.prepare(sql);
      return stmt.all(...boundArgs).map(r => ({ ...r }));
    },
    firstSync(colName) {
      const stmt = sqlite.prepare(sql);
      const row = stmt.get(...boundArgs);
      if (!row) return null;
      const obj = { ...row };
      if (colName) return obj[colName] !== undefined ? obj[colName] : null;
      return obj;
    },
    runSync() {
      const stmt = sqlite.prepare(sql);
      const info = stmt.run(...boundArgs);
      return {
        success: true,
        changes: info.changes || 0,
        lastInsertRowid: Number(info.lastInsertRowid || 0)
      };
    }
  };

  return wrapper;
}

/**
 * Creates a D1-compatible client wrapped around local node:sqlite.
 */
export async function createLocalD1Adapter(sqliteDb = null) {
  let sqlite = sqliteDb;
  if (!sqlite) {
    const { DatabaseSync } = await import('node:sqlite');
    const dbPath = getLocalDbPath();
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    sqlite = new DatabaseSync(dbPath);
    sqlite.exec('PRAGMA foreign_keys = ON;');
    sqlite.exec('PRAGMA journal_mode = WAL;');
    const schemaSql = getSchemaSql();
    if (schemaSql) {
      applySchemaMigrations(sqlite);
      sqlite.exec(schemaSql);
      applySchemaMigrations(sqlite);
    }
    localSqliteInstance = sqlite;
  }

  return {
    isD1: true,
    isLocal: true,
    prepare(sql) {
      return createD1StatementWrapper(sqlite, sql);
    },
    async batch(statements) {
      sqlite.exec('BEGIN TRANSACTION;');
      try {
        const results = [];
        for (const stmt of statements) {
          const res = await stmt.run();
          results.push(res);
        }
        sqlite.exec('COMMIT;');
        return results;
      } catch (err) {
        sqlite.exec('ROLLBACK;');
        throw err;
      }
    },
    async exec(sql) {
      sqlite.exec(sql);
      return { count: 1, duration: 0 };
    },
    getRawDb() {
      return sqlite;
    }
  };
}

/**
 * Universal getter to retrieve the D1 Database instance.
 * Automatically discovers Cloudflare OpenNext env.DB, globalThis.DB, or creates local adapter.
 */
export async function getD1Database() {
  // 1. Check Cloudflare OpenNext runtime context
  try {
    const openNext = await import('@opennextjs/cloudflare');
    if (openNext && typeof openNext.getCloudflareContext === 'function') {
      const ctx = await openNext.getCloudflareContext();
      if (ctx && ctx.env && ctx.env.DB) {
        return ctx.env.DB;
      }
    }
  } catch (_) {
    // Not running inside Cloudflare OpenNext worker
  }

  // 2. Check globalThis.DB (Workers native bindings)
  if (typeof globalThis !== 'undefined' && globalThis.DB) {
    return globalThis.DB;
  }

  // 3. Fall back to local SQLite adapter
  return createLocalD1Adapter(localSqliteInstance);
}

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
      sqlite.exec(schemaSql);
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
    if (schemaSql) sqlite.exec(schemaSql);
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

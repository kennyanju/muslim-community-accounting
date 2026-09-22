import crypto from 'crypto';
import { getD1Database } from './db-client.js';
import { hashPassword, getSafeUser } from './auth.js';
import { sanitizeText } from './sanitize.js';
import { splitDonorName, calculateGiftAidClaim, getFiscalYearBounds } from './validation.js';

const DEFAULT_ORGANISATION = {
  id: 'main',
  name: 'Bristol South Muslim Community',
  short_name: 'BSMC',
  tagline: 'Bristol South Mosque & Islamic Centre',
  charity_number: '1234567',
  address: '100 Mosque Road, Bristol, BS3 1AB',
  email: 'finance@bsmc.org.uk',
  phone: '0117 000 0000',
  currency_symbol: '£',
  country: 'United Kingdom',
  fiscal_year_start: '04-06',
  zakat_surplus_alert_pence: 500000,
  zakat_reserve_min_pence: 20000,
  large_donation_threshold_pence: 50000,
  receipt_counter: 1
};

export const DISPLAY_SAFE_ORG_FIELDS = [
  'name', 'short_name', 'tagline', 'currency_symbol', 'fiscal_year_start'
];

// Short-lived balance cache to avoid redundant aggregations on rapid dashboard requests (Item #13)
let balanceCache = { data: null, timestamp: 0 };
const BALANCE_CACHE_TTL_MS = 20000;

export function invalidateBalanceCache() {
  balanceCache = { data: null, timestamp: 0 };
}

/**
 * Enterprise Cloudflare D1 Controller for Masjid Accounting
 * High-performance, fully async, ACID-compliant, integer cents precision
 */
export class D1Controller {
  constructor(role = 'ADMIN', userId = 'system', userName = 'System User', userEmail = 'system@masjid.org.uk') {
    this.role = role;
    this.userId = userId;
    this.userName = userName;
    this.userEmail = userEmail;
  }

  async getDb() {
    return await getD1Database();
  }

  checkAdmin() {
    if (this.role !== 'ADMIN') {
      throw new Error('Access denied: Admin role required');
    }
  }

  checkAuditorOrAdmin() {
    if (this.role !== 'ADMIN' && this.role !== 'AUDITOR') {
      throw new Error('Access denied: Auditor or Admin role required');
    }
  }

  // -------------------------------------------------------------
  // AUDIT LOGGING (Item #3)
  // -------------------------------------------------------------
  async logAudit(tableName, recordId, action, metadata = {}) {
    try {
      const db = await this.getDb();
      const auditId = `aud-${crypto.randomUUID()}`;
      const metaStr = typeof metadata === 'string' ? metadata : JSON.stringify(metadata || {});
      await db.prepare(`
        INSERT INTO audit_logs (id, table_name, record_id, action, user_id, user_email, user_name, metadata, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        auditId,
        tableName,
        recordId,
        action,
        this.userId || 'system',
        this.userEmail || 'system',
        this.userName || 'System',
        metaStr
      ).run();
      return auditId;
    } catch (err) {
      console.error('Failed to write audit log to D1:', err.message);
      return null;
    }
  }

  async getAuditLogs(limit = 100, offset = 0) {
    this.checkAuditorOrAdmin();
    const db = await this.getDb();
    const res = await db.prepare(`
      SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?
    `).bind(limit, offset).all();
    return res.results || [];
  }

  // -------------------------------------------------------------
  // ORGANISATION & FINANCIAL SETTINGS (Item #6)
  // -------------------------------------------------------------
  async getOrganisation() {
    const db = await this.getDb();
    let org = await db.prepare(`SELECT * FROM organisations WHERE id = 'main'`).first();
    if (!org) {
      // Seed default organisation row if missing
      await db.prepare(`
        INSERT INTO organisations (
          id, name, short_name, tagline, charity_number, address, email, phone,
          currency_symbol, country, receipt_counter, fiscal_year_start,
          zakat_surplus_alert_pence, zakat_reserve_min_pence, large_donation_threshold_pence
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        DEFAULT_ORGANISATION.id,
        DEFAULT_ORGANISATION.name,
        DEFAULT_ORGANISATION.short_name,
        DEFAULT_ORGANISATION.tagline,
        DEFAULT_ORGANISATION.charity_number,
        DEFAULT_ORGANISATION.address,
        DEFAULT_ORGANISATION.email,
        DEFAULT_ORGANISATION.phone,
        DEFAULT_ORGANISATION.currency_symbol,
        DEFAULT_ORGANISATION.country,
        DEFAULT_ORGANISATION.receipt_counter,
        DEFAULT_ORGANISATION.fiscal_year_start,
        DEFAULT_ORGANISATION.zakat_surplus_alert_pence,
        DEFAULT_ORGANISATION.zakat_reserve_min_pence,
        DEFAULT_ORGANISATION.large_donation_threshold_pence
      ).run();
      org = { ...DEFAULT_ORGANISATION };
    }

    // Attach human-readable pounds alongside pence for convenience
    return {
      ...org,
      zakat_surplus_alert: (org.zakat_surplus_alert_pence || 500000) / 100,
      zakat_reserve_min: (org.zakat_reserve_min_pence || 20000) / 100,
      large_donation_threshold: (org.large_donation_threshold_pence || 50000) / 100
    };
  }

  async updateOrganisation(updates) {
    this.checkAdmin();
    const db = await this.getDb();
    const current = await this.getOrganisation();

    const name = updates.name !== undefined ? sanitizeText(updates.name) : current.name;
    const short_name = updates.short_name !== undefined ? sanitizeText(updates.short_name) : current.short_name;
    const tagline = updates.tagline !== undefined ? sanitizeText(updates.tagline) : current.tagline;
    const charity_number = updates.charity_number !== undefined ? sanitizeText(updates.charity_number) : current.charity_number;
    const address = updates.address !== undefined ? sanitizeText(updates.address) : current.address;
    const email = updates.email !== undefined ? sanitizeText(updates.email) : current.email;
    const phone = updates.phone !== undefined ? sanitizeText(updates.phone) : current.phone;
    const currency_symbol = updates.currency_symbol !== undefined ? sanitizeText(updates.currency_symbol) : current.currency_symbol;
    const country = updates.country !== undefined ? sanitizeText(updates.country) : current.country;
    const fiscal_year_start = updates.fiscal_year_start !== undefined ? updates.fiscal_year_start.trim() : (current.fiscal_year_start || '04-06');

    // Financial thresholds (convert pounds to pence if given as floats)
    let zakat_surplus_alert_pence = current.zakat_surplus_alert_pence;
    if (updates.zakat_surplus_alert !== undefined) {
      zakat_surplus_alert_pence = Math.round(parseFloat(updates.zakat_surplus_alert) * 100);
    } else if (updates.zakat_surplus_alert_pence !== undefined) {
      zakat_surplus_alert_pence = parseInt(updates.zakat_surplus_alert_pence, 10);
    }

    let zakat_reserve_min_pence = current.zakat_reserve_min_pence;
    if (updates.zakat_reserve_min !== undefined) {
      zakat_reserve_min_pence = Math.round(parseFloat(updates.zakat_reserve_min) * 100);
    } else if (updates.zakat_reserve_min_pence !== undefined) {
      zakat_reserve_min_pence = parseInt(updates.zakat_reserve_min_pence, 10);
    }

    let large_donation_threshold_pence = current.large_donation_threshold_pence;
    if (updates.large_donation_threshold !== undefined) {
      large_donation_threshold_pence = Math.round(parseFloat(updates.large_donation_threshold) * 100);
    } else if (updates.large_donation_threshold_pence !== undefined) {
      large_donation_threshold_pence = parseInt(updates.large_donation_threshold_pence, 10);
    }

    await db.prepare(`
      UPDATE organisations SET
        name = ?, short_name = ?, tagline = ?, charity_number = ?, address = ?,
        email = ?, phone = ?, currency_symbol = ?, country = ?, fiscal_year_start = ?,
        zakat_surplus_alert_pence = ?, zakat_reserve_min_pence = ?, large_donation_threshold_pence = ?,
        updated_at = datetime('now')
      WHERE id = 'main'
    `).bind(
      name, short_name, tagline, charity_number, address,
      email, phone, currency_symbol, country, fiscal_year_start,
      zakat_surplus_alert_pence, zakat_reserve_min_pence, large_donation_threshold_pence
    ).run();

    await this.logAudit('organisations', 'main', 'UPDATE', { before: current, after: updates });
    return await this.getOrganisation();
  }

  // -------------------------------------------------------------
  // USERS & RBAC (Items #9, #10, #19)
  // -------------------------------------------------------------
  async getUsers() {
    const db = await this.getDb();
    const res = await db.prepare(`
      SELECT id, email, name, role, status, created_at, updated_at FROM users ORDER BY created_at DESC
    `).all();
    return res.results || [];
  }

  async getUserById(id) {
    const db = await this.getDb();
    const user = await db.prepare(`
      SELECT id, email, name, role, status, created_at, updated_at FROM users WHERE id = ?
    `).bind(id).first();
    return user || null;
  }

  async getUserByEmail(email) {
    const db = await this.getDb();
    const user = await db.prepare(`
      SELECT * FROM users WHERE email = ?
    `).bind(email.toLowerCase().trim()).first();
    return user || null;
  }

  async createUser({ email, password, role, name }) {
    this.checkAdmin();
    if (!password || password.length < 12) {
      throw new Error('Password must be at least 12 characters.');
    }
    const db = await this.getDb();
    const cleanEmail = email.toLowerCase().trim();
    const existing = await this.getUserByEmail(cleanEmail);
    if (existing) {
      throw new Error(`User with email '${cleanEmail}' already exists.`);
    }

    const userId = `user-${crypto.randomUUID().substring(0, 8)}`;
    const passwordHash = hashPassword(password);
    const cleanName = sanitizeText(name || cleanEmail.split('@')[0]);

    await db.prepare(`
      INSERT INTO users (id, email, name, role, status, password_hash, created_at)
      VALUES (?, ?, ?, ?, 'ACTIVE', ?, datetime('now'))
    `).bind(userId, cleanEmail, cleanName, role || 'AUDITOR', passwordHash).run();

    await this.logAudit('users', userId, 'INSERT', { email: cleanEmail, role, name: cleanName });
    return await this.getUserById(userId);
  }

  async updateUser(id, updates) {
    this.checkAdmin();
    const db = await this.getDb();
    const current = await this.getUserById(id);
    if (!current) {
      throw new Error(`User not found with ID ${id}`);
    }

    const name = updates.name !== undefined ? sanitizeText(updates.name) : current.name;
    const role = updates.role !== undefined ? updates.role : current.role;
    const status = updates.status !== undefined ? updates.status : current.status;

    // Protection against self-demotion and self-deactivation
    if (id === this.userId) {
      if (status === 'INACTIVE') {
        throw new Error('Cannot deactivate your own active administrator account.');
      }
      if (role !== 'ADMIN') {
        throw new Error('Cannot demote your own active administrator account.');
      }
    }

    // Protection against losing the last active administrator
    if (current.role === 'ADMIN' && (role !== 'ADMIN' || status === 'INACTIVE')) {
      const activeAdmins = await db.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'`).first('count');
      if (activeAdmins <= 1) {
        throw new Error('Cannot demote or deactivate the last active administrator.');
      }
    }

    let passwordHash = null;
    if (updates.password && updates.password.trim()) {
      if (updates.password.length < 12) {
        throw new Error('Password must be at least 12 characters.');
      }
      passwordHash = hashPassword(updates.password.trim());
    }

    if (passwordHash) {
      await db.prepare(`
        UPDATE users SET name = ?, role = ?, status = ?, password_hash = ?, updated_at = datetime('now') WHERE id = ?
      `).bind(name, role, status, passwordHash, id).run();
    } else {
      await db.prepare(`
        UPDATE users SET name = ?, role = ?, status = ?, updated_at = datetime('now') WHERE id = ?
      `).bind(name, role, status, id).run();
    }

    // Item #10: Revoke active sessions if user is deactivated or role changed
    if (status === 'INACTIVE' || role !== current.role || passwordHash) {
      await this.revokeUserSessions(id);
    }

    await this.logAudit('users', id, 'UPDATE', { before: current, after: updates });
    return await this.getUserById(id);
  }

  async deleteUser(id) {
    this.checkAdmin();
    if (id === this.userId) {
      throw new Error('Cannot delete your own active administrator account.');
    }
    const db = await this.getDb();
    const user = await this.getUserById(id);
    if (!user) throw new Error(`User not found with ID ${id}`);

    if (user.role === 'ADMIN') {
      const activeAdmins = await db.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'`).first('count');
      if (activeAdmins <= 1) {
        throw new Error('Cannot delete the last active administrator.');
      }
    }

    await this.revokeUserSessions(id);
    await db.prepare(`DELETE FROM users WHERE id = ?`).bind(id).run();
    await this.logAudit('users', id, 'DELETE', { email: user.email, name: user.name });
    return true;
  }

  // -------------------------------------------------------------
  // SESSIONS WITH JTI NONCE (Item #10)
  // -------------------------------------------------------------
  async createSession(userId, jti, expiresAt) {
    const db = await this.getDb();
    const sessId = `sess-${crypto.randomUUID()}`;
    await db.prepare(`
      INSERT INTO sessions (id, user_id, jti, expires_at, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(sessId, userId, jti, expiresAt).run();
    return sessId;
  }

  async verifySession(jti) {
    const db = await this.getDb();
    const session = await db.prepare(`
      SELECT s.id as session_id, s.jti, s.user_id, s.expires_at, s.revoked_at,
             u.email, u.name, u.role, u.status
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.jti = ?
    `).bind(jti).first();

    if (!session) return null;
    if (session.revoked_at !== null) return null;
    if (session.status !== 'ACTIVE') return null;
    if (new Date(session.expires_at).getTime() < Date.now()) return null;

    return session;
  }

  async revokeSession(jti) {
    const db = await this.getDb();
    await db.prepare(`
      UPDATE sessions SET revoked_at = datetime('now') WHERE jti = ?
    `).bind(jti).run();
  }

  async revokeUserSessions(userId) {
    const db = await this.getDb();
    await db.prepare(`
      UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL
    `).bind(userId).run();
  }

  // -------------------------------------------------------------
  // ISLAMIC FUNDS (Item #18)
  // -------------------------------------------------------------
  async getFunds() {
    const db = await this.getDb();
    const res = await db.prepare(`
      SELECT id, name, is_restricted, description, is_archived, created_at, updated_at
      FROM funds ORDER BY is_archived ASC, name ASC
    `).all();
    return (res.results || []).map(f => ({
      ...f,
      fundId: f.id,
      fundName: f.name,
      isRestricted: Boolean(f.is_restricted),
      isArchived: Boolean(f.is_archived),
      is_restricted: Boolean(f.is_restricted),
      is_archived: Boolean(f.is_archived)
    }));
  }

  async getFundById(id) {
    const db = await this.getDb();
    const f = await db.prepare(`SELECT * FROM funds WHERE id = ?`).bind(id).first();
    if (!f) return null;
    return {
      ...f,
      fundId: f.id,
      fundName: f.name,
      isRestricted: Boolean(f.is_restricted),
      isArchived: Boolean(f.is_archived),
      is_restricted: Boolean(f.is_restricted),
      is_archived: Boolean(f.is_archived)
    };
  }

  async createFund({ name, is_restricted = false, description = '' }) {
    this.checkAdmin();
    const db = await this.getDb();
    const cleanName = sanitizeText(name);
    const existing = await db.prepare(`SELECT id FROM funds WHERE LOWER(name) = LOWER(?)`).bind(cleanName).first();
    if (existing) {
      throw new Error(`Fund '${cleanName}' already exists.`);
    }

    const fundId = `fund-${crypto.randomUUID().substring(0, 8)}`;
    await db.prepare(`
      INSERT INTO funds (id, name, is_restricted, description, is_archived, created_at)
      VALUES (?, ?, ?, ?, 0, datetime('now'))
    `).bind(fundId, cleanName, is_restricted ? 1 : 0, sanitizeText(description)).run();

    invalidateBalanceCache();
    await this.logAudit('funds', fundId, 'INSERT', { name: cleanName, is_restricted });
    return await this.getFundById(fundId);
  }

  async updateFund(id, updates) {
    this.checkAdmin();
    const db = await this.getDb();
    const current = await this.getFundById(id);
    if (!current) throw new Error(`Fund not found with ID ${id}`);

    // Protection for core Islamic & Shariah funds
    const CORE_FUNDS = ['zakat', 'fitrana', 'interest/riba', 'riba'];
    const isCore = CORE_FUNDS.includes(current.name.toLowerCase());
    if (isCore) {
      if (updates.is_restricted !== undefined && (updates.is_restricted ? 1 : 0) !== current.is_restricted) {
        throw new Error(`Strict Compliance: Core fund '${current.name}' restriction status cannot be reclassified.`);
      }
      if (updates.name !== undefined && updates.name.trim().toLowerCase() !== current.name.toLowerCase()) {
        throw new Error(`Strict Compliance: Core fund '${current.name}' cannot be renamed.`);
      }
      if (updates.is_archived === 1 || updates.is_archived === true) {
        throw new Error(`Strict Compliance: Core fund '${current.name}' cannot be archived.`);
      }
    }

    // Check balance before archival
    if (updates.is_archived === 1 || updates.is_archived === true) {
      const balanceRow = await db.prepare(`
        SELECT COALESCE(SUM(
          CASE 
            WHEN t.id IS NULL THEN 0
            WHEN t.type = 'INCOME' THEN s.amount 
            ELSE -s.amount 
          END
        ), 0) as balance_pence
        FROM transaction_splits s
        JOIN transactions t ON t.id = s.transaction_id AND t.status NOT IN ('VOIDED', 'FAILED', 'PENDING_APPROVAL')
        WHERE s.fund_id = ? AND s.is_voided = 0
      `).bind(id).first();

      const balPence = balanceRow?.balance_pence || 0;
      if (balPence !== 0) {
        throw new Error(`Cannot archive fund '${current.name}' with active balance (£${(balPence / 100).toFixed(2)}). Reallocate funds first.`);
      }

      // Item #18: Check for open/incomplete Asnaf records before archival
      const incompleteAsnaf = await db.prepare(`
        SELECT t.id, t.total_amount, COALESCE(SUM(a.amount), 0) as asnaf_disbursed
        FROM transactions t
        JOIN transaction_splits s ON s.transaction_id = t.id AND s.fund_id = ?
        LEFT JOIN asnaf_records a ON a.transaction_id = t.id
        WHERE t.type = 'EXPENSE' AND t.status NOT IN ('VOIDED', 'FAILED', 'PENDING_APPROVAL')
        GROUP BY t.id, t.total_amount
        HAVING asnaf_disbursed < t.total_amount
      `).bind(id).all();

      if (incompleteAsnaf.results && incompleteAsnaf.results.length > 0) {
        throw new Error(`Cannot archive fund with undocumented Zakat/Asnaf disbursements (${incompleteAsnaf.results.length} expense transactions pending audit records).`);
      }
    }

    const name = updates.name !== undefined ? sanitizeText(updates.name) : current.name;
    const is_restricted = updates.is_restricted !== undefined ? (updates.is_restricted ? 1 : 0) : current.is_restricted;
    const description = updates.description !== undefined ? sanitizeText(updates.description) : current.description;
    const is_archived = updates.is_archived !== undefined ? (updates.is_archived ? 1 : 0) : current.is_archived;

    await db.prepare(`
      UPDATE funds SET name = ?, is_restricted = ?, description = ?, is_archived = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(name, is_restricted, description, is_archived, id).run();

    invalidateBalanceCache();
    await this.logAudit('funds', id, 'UPDATE', { before: current, after: updates });
    return await this.getFundById(id);
  }

  async archiveFund(id) {
    return await this.updateFund(id, { is_archived: 1 });
  }

  async transferFund({ fromFundId, toFundId, from_fund_id, to_fund_id, amount, reason, date }) {
    this.checkAdmin();
    const sourceId = fromFundId || from_fund_id;
    const targetId = toFundId || to_fund_id;
    if (!sourceId || !targetId) {
      throw new Error('Both source and destination fund IDs are required.');
    }
    if (sourceId === targetId) {
      throw new Error('Cannot transfer funds to the same fund.');
    }
    const amountPence = Math.round(parseFloat(amount || 0) * 100);
    if (isNaN(amountPence) || amountPence <= 0) {
      throw new Error('Transfer amount must be greater than zero.');
    }

    const db = await this.getDb();
    const sourceFund = await this.getFundById(sourceId);
    if (!sourceFund) throw new Error(`Source fund not found with ID ${sourceId}`);
    if (sourceFund.isArchived) throw new Error(`Cannot transfer from archived fund '${sourceFund.name}'.`);

    const targetFund = await this.getFundById(targetId);
    if (!targetFund) throw new Error(`Destination fund not found with ID ${targetId}`);
    if (targetFund.isArchived) throw new Error(`Cannot transfer to archived fund '${targetFund.name}'.`);

    // Strict Charity Commission & Islamic Jurisprudence Rule:
    // Restricted funds cannot be repurposed / transferred to unrestricted funds.
    if (sourceFund.isRestricted && !targetFund.isRestricted) {
      throw new Error(`Strict Compliance: Cannot transfer from restricted fund '${sourceFund.name}' to unrestricted fund '${targetFund.name}'.`);
    }

    // If source fund is Zakat or Fitrana, it cannot be transferred to a non-Zakat fund
    const isSourceZakat = sourceFund.name.toLowerCase().includes('zakat') || sourceFund.name.toLowerCase().includes('fitrana');
    const isTargetZakat = targetFund.name.toLowerCase().includes('zakat') || targetFund.name.toLowerCase().includes('fitrana');
    if (isSourceZakat && !isTargetZakat) {
      throw new Error(`Strict Shariah Compliance: Zakat/Fitrana funds cannot be reallocated to non-Zakat fund '${targetFund.name}'.`);
    }

    // Check source fund balance
    const balanceRow = await db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN t.type = 'INCOME' THEN s.amount ELSE -s.amount END), 0) as balance_pence
      FROM transaction_splits s
      JOIN transactions t ON t.id = s.transaction_id AND t.status NOT IN ('VOIDED', 'FAILED', 'PENDING_APPROVAL')
      WHERE s.fund_id = ? AND s.is_voided = 0
    `).bind(sourceId).first();

    const sourceBalancePence = balanceRow?.balance_pence || 0;
    if (sourceBalancePence < amountPence) {
      throw new Error(`Insufficient balance in source fund '${sourceFund.name}' (£${(sourceBalancePence / 100).toFixed(2)}) for transfer of £${(amountPence / 100).toFixed(2)}.`);
    }

    const transferDate = date || new Date().toISOString().substring(0, 10);
    const cleanReason = sanitizeText(reason || `Inter-fund transfer from ${sourceFund.name} to ${targetFund.name}`);
    const outTxId = `tx-${crypto.randomUUID().substring(0, 8)}`;
    const inTxId = `tx-${crypto.randomUUID().substring(0, 8)}`;

    const batch = [
      // Outgoing leg from source fund
      db.prepare(`
        INSERT INTO transactions (
          id, receipt_number, type, status, total_amount, method, category,
          reference_note, transaction_date, bank_statement_ref, reconciled,
          gift_aid, created_by, created_at, updated_at
        ) VALUES (?, ?, 'EXPENSE', 'BANKED', ?, 'BANK_TRANSFER', 'Other', ?, ?, ?, 0, 0, ?, datetime('now'), datetime('now'))
      `).bind(outTxId, `TR-OUT-${outTxId.substring(3)}`, amountPence, cleanReason, transferDate, `TRANSFER:${inTxId}`, this.userId),
      db.prepare(`
        INSERT INTO transaction_splits (id, transaction_id, fund_id, amount, is_voided, created_at)
        VALUES (?, ?, ?, ?, 0, datetime('now'))
      `).bind(`spl-${crypto.randomUUID().substring(0, 8)}`, outTxId, sourceId, amountPence),

      // Incoming leg to destination fund
      db.prepare(`
        INSERT INTO transactions (
          id, receipt_number, type, status, total_amount, method, category,
          reference_note, transaction_date, bank_statement_ref, reconciled,
          gift_aid, created_by, created_at, updated_at
        ) VALUES (?, ?, 'INCOME', 'BANKED', ?, 'BANK_TRANSFER', 'Other', ?, ?, ?, 0, 0, ?, datetime('now'), datetime('now'))
      `).bind(inTxId, `TR-IN-${inTxId.substring(3)}`, amountPence, cleanReason, transferDate, `TRANSFER:${outTxId}`, this.userId),
      db.prepare(`
        INSERT INTO transaction_splits (id, transaction_id, fund_id, amount, is_voided, created_at)
        VALUES (?, ?, ?, ?, 0, datetime('now'))
      `).bind(`spl-${crypto.randomUUID().substring(0, 8)}`, inTxId, targetId, amountPence)
    ];

    await db.batch(batch);
    invalidateBalanceCache();

    await this.logAudit('funds', sourceId, 'TRANSFER', {
      from_fund_id: sourceId,
      to_fund_id: targetId,
      amount: amountPence / 100,
      reason: cleanReason,
      expense_tx_id: outTxId,
      income_tx_id: inTxId
    });

    return {
      success: true,
      from_fund: sourceFund,
      to_fund: targetFund,
      amount: amountPence / 100,
      date: transferDate,
      outTxId,
      inTxId
    };
  }



  // -------------------------------------------------------------
  // DONORS & HMRC GIFT AID (Item #16)
  // -------------------------------------------------------------
  async getDonors(options = {}) {
    const db = await this.getDb();
    let sql = `SELECT * FROM donors WHERE 1=1`;
    const args = [];

    if (options.search && typeof options.search === 'string' && options.search.trim()) {
      const term = `%${options.search.trim().toLowerCase()}%`;
      sql += ` AND (
        LOWER(name) LIKE ? OR
        LOWER(first_name) LIKE ? OR
        LOWER(last_name) LIKE ? OR
        LOWER(email) LIKE ? OR
        LOWER(postcode) LIKE ?
      )`;
      args.push(term, term, term, term, term);
    }

    if (options.giftAidOnly) {
      sql += ` AND gift_aid_eligible = 1`;
    }

    sql += ` ORDER BY name ASC`;

    if (options.limit) {
      sql += ` LIMIT ?`;
      args.push(parseInt(options.limit, 10));
      if (options.offset) {
        sql += ` OFFSET ?`;
        args.push(parseInt(options.offset, 10));
      }
    }

    const res = await db.prepare(sql).bind(...args).all();
    const donors = res.results || [];

    // Aggregate giving totals per donor in a single fast query (only posted INCOME)
    const totalsRes = await db.prepare(`
      SELECT donor_id, SUM(total_amount) as total_pence, COUNT(*) as tx_count
      FROM transactions
      WHERE status NOT IN ('VOIDED', 'FAILED', 'PENDING_APPROVAL') AND type = 'INCOME' AND donor_id IS NOT NULL
      GROUP BY donor_id
    `).all();

    const totalsMap = {};
    (totalsRes.results || []).forEach(r => {
      totalsMap[r.donor_id] = {
        total_donated: (r.total_pence || 0) / 100,
        tx_count: r.tx_count || 0
      };
    });

    return donors.map(d => ({
      ...d,
      total_donated: totalsMap[d.id]?.total_donated || 0,
      donation_count: totalsMap[d.id]?.tx_count || 0
    }));
  }

  async getDonor(id) {
    const db = await this.getDb();
    const donor = await db.prepare(`SELECT * FROM donors WHERE id = ?`).bind(id).first();
    if (!donor) return null;

    const txsRes = await db.prepare(`
      SELECT * FROM transactions WHERE donor_id = ? AND type = 'INCOME' AND status NOT IN ('VOIDED', 'FAILED')
      ORDER BY transaction_date DESC
    `).bind(id).all();

    const history = (txsRes.results || []).map(t => ({
      ...t,
      total_amount: (t.total_amount || 0) / 100
    }));

    const totalPence = history.reduce((sum, t) => sum + (t.total_amount * 100), 0);

    return {
      ...donor,
      total_donated: totalPence / 100,
      total_donations: totalPence / 100,
      donation_count: history.length,
      giving_history: history
    };
  }


  async createDonor(data) {
    this.checkAdmin();
    const db = await this.getDb();
    const donorId = `don-${crypto.randomUUID().substring(0, 8)}`;

    const fullName = sanitizeText(data.name || '');
    const { title: parsedTitle, firstName, lastName } = splitDonorName(fullName);

    const title = data.title !== undefined ? sanitizeText(data.title) : parsedTitle;
    const first_name = data.first_name !== undefined ? sanitizeText(data.first_name) : firstName;
    const last_name = data.last_name !== undefined ? sanitizeText(data.last_name) : lastName;

    const email = data.email ? sanitizeText(data.email).toLowerCase() : '';
    const phone = data.phone ? sanitizeText(data.phone) : '';
    const is_anonymous = data.is_anonymous ? 1 : 0;
    const gift_aid_eligible = (data.giftAidEligible || data.gift_aid_eligible) ? 1 : 0;
    const address_line_1 = sanitizeText(data.address_line_1 || '');
    const address_line_2 = sanitizeText(data.address_line_2 || '');
    const city = sanitizeText(data.city || '');
    const postcode = sanitizeText(data.postcode || '');
    const notes = sanitizeText(data.notes || '');

    if (gift_aid_eligible && (!address_line_1 || !postcode)) {
      throw new Error('Address line 1 is required for Gift Aid declarations.');
    }

    await db.prepare(`
      INSERT INTO donors (
        id, name, title, first_name, last_name, email, phone, is_anonymous,
        gift_aid_eligible, gift_aid_declaration_date, address_line_1, address_line_2,
        city, postcode, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      donorId, fullName, title, first_name, last_name, email, phone, is_anonymous,
      gift_aid_eligible, gift_aid_eligible ? (data.gift_aid_declaration_date || new Date().toISOString()) : null,
      address_line_1, address_line_2, city, postcode, notes
    ).run();

    await this.logAudit('donors', donorId, 'INSERT', { name: fullName, gift_aid_eligible });
    return donorId;
  }

  async updateDonor(id, updates) {
    this.checkAdmin();
    const db = await this.getDb();
    const current = await this.getDonor(id);
    if (!current) throw new Error(`Donor not found with ID ${id}`);

    const name = updates.name !== undefined ? sanitizeText(updates.name) : current.name;
    const { title: parsedTitle, firstName, lastName } = splitDonorName(name);

    const title = updates.title !== undefined ? sanitizeText(updates.title) : (current.title || parsedTitle);
    const first_name = updates.first_name !== undefined ? sanitizeText(updates.first_name) : (current.first_name || firstName);
    const last_name = updates.last_name !== undefined ? sanitizeText(updates.last_name) : (current.last_name || lastName);

    const email = updates.email !== undefined ? sanitizeText(updates.email).toLowerCase() : current.email;
    const phone = updates.phone !== undefined ? sanitizeText(updates.phone) : current.phone;
    const is_anonymous = updates.is_anonymous !== undefined ? (updates.is_anonymous ? 1 : 0) : current.is_anonymous;
    const gift_aid_eligible = updates.giftAidEligible !== undefined
      ? (updates.giftAidEligible ? 1 : 0)
      : (updates.gift_aid_eligible !== undefined ? (updates.gift_aid_eligible ? 1 : 0) : current.gift_aid_eligible);

    const address_line_1 = updates.address_line_1 !== undefined ? sanitizeText(updates.address_line_1) : current.address_line_1;
    const address_line_2 = updates.address_line_2 !== undefined ? sanitizeText(updates.address_line_2) : current.address_line_2;
    const city = updates.city !== undefined ? sanitizeText(updates.city) : current.city;
    const postcode = updates.postcode !== undefined ? sanitizeText(updates.postcode) : current.postcode;
    const notes = updates.notes !== undefined ? sanitizeText(updates.notes) : current.notes;

    if (gift_aid_eligible && (!address_line_1 || !postcode)) {
      throw new Error('Address line 1 is required for Gift Aid declarations.');
    }

    await db.prepare(`
      UPDATE donors SET
        name = ?, title = ?, first_name = ?, last_name = ?, email = ?, phone = ?,
        is_anonymous = ?, gift_aid_eligible = ?, address_line_1 = ?, address_line_2 = ?,
        city = ?, postcode = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      name, title, first_name, last_name, email, phone,
      is_anonymous, gift_aid_eligible, address_line_1, address_line_2,
      city, postcode, notes, id
    ).run();

    await this.logAudit('donors', id, 'UPDATE', { before: current, after: updates });
    return await this.getDonor(id);
  }

  async deleteDonor(id) {
    this.checkAdmin();
    const db = await this.getDb();
    const txCount = await db.prepare(`
      SELECT count(*) as count FROM transactions WHERE donor_id = ?
    `).bind(id).first('count');

    if (txCount > 0) {
      throw new Error(`Cannot delete donor with ID ${id} because they have ${txCount} recorded transaction(s).`);
    }

    await db.prepare(`DELETE FROM donors WHERE id = ?`).bind(id).run();
    await this.logAudit('donors', id, 'DELETE', { donorId: id });
    return true;
  }

  // -------------------------------------------------------------
  // DATED GIFT AID DECLARATIONS & CLAIM BATCHES
  // -------------------------------------------------------------
  async isGiftAidCovered(donorId, txDate) {
    const db = await this.getDb();
    // 1. Check if donor has any declarations in gift_aid_declarations table
    const countDecls = await db.prepare(`SELECT count(*) as count FROM gift_aid_declarations WHERE donor_id = ?`).bind(donorId).first('count');

    if ((countDecls || 0) > 0) {
      // Single source of truth: explicit declarations table
      const decl = await db.prepare(`
        SELECT * FROM gift_aid_declarations
        WHERE donor_id = ?
          AND (status = 'ACTIVE' OR status = 'CANCELLED')
          AND start_date <= ?
          AND (end_date IS NULL OR end_date >= ?)
          AND (cancellation_date IS NULL OR cancellation_date >= ?)
        ORDER BY start_date DESC
        LIMIT 1
      `).bind(donorId, txDate, txDate, txDate).first();

      return Boolean(decl);
    }

    // 2. Fallback to donor record for backward compatibility
    const donor = await db.prepare(`SELECT * FROM donors WHERE id = ?`).bind(donorId).first();
    if (!donor || !donor.gift_aid_eligible) return false;
    if (donor.gift_aid_declaration_date && donor.gift_aid_declaration_date > txDate) return false;
    return true;
  }

  async createGiftAidDeclaration(data) {
    this.checkAdmin();
    const donor_id = data.donor_id || data.donorId;
    const scope = data.scope || 'PAST_PRESENT_FUTURE';
    const start_date = data.start_date || data.startDate;
    const end_date = data.end_date || data.endDate || null;
    const notes = data.notes || '';

    const db = await this.getDb();
    const donor = await this.getDonor(donor_id);
    if (!donor) throw new Error(`Donor '${donor_id}' not found.`);
    if (!donor.address_line_1 || !donor.postcode) {
      throw new Error('Donor must have address line 1 and postcode for Gift Aid declaration.');
    }
    const id = `gadecl-${crypto.randomUUID().substring(0, 8)}`;
    const sDate = start_date || new Date().toISOString().substring(0, 10);

    await db.prepare(`
      INSERT INTO gift_aid_declarations (
        id, donor_id, scope, start_date, end_date, status, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, datetime('now'))
    `).bind(id, donor_id, scope, sDate, end_date, sanitizeText(notes)).run();

    // Sync donor flag
    await db.prepare(`
      UPDATE donors SET gift_aid_eligible = 1, gift_aid_declaration_date = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(sDate, donor_id).run();

    await this.logAudit('gift_aid_declarations', id, 'INSERT', { donor_id, scope, start_date: sDate });
    return await db.prepare(`SELECT * FROM gift_aid_declarations WHERE id = ?`).bind(id).first();
  }

  async cancelGiftAidDeclaration(id, cancellationDate = null) {
    this.checkAdmin();
    const db = await this.getDb();
    const decl = await db.prepare(`SELECT * FROM gift_aid_declarations WHERE id = ?`).bind(id).first();
    if (!decl) throw new Error(`Gift Aid declaration '${id}' not found.`);

    const cDate = cancellationDate || new Date().toISOString().substring(0, 10);
    await db.prepare(`
      UPDATE gift_aid_declarations
      SET status = 'CANCELLED', cancellation_date = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(cDate, id).run();

    await this.logAudit('gift_aid_declarations', id, 'CANCEL', { cancellation_date: cDate });
    return await db.prepare(`SELECT * FROM gift_aid_declarations WHERE id = ?`).bind(id).first();
  }

  async getGiftAidClaimableTransactions(filters = {}) {
    const dateFrom = filters.dateFrom || filters.startDate;
    const dateTo = filters.dateTo || filters.endDate;
    const db = await this.getDb();
    let sql = `
      SELECT t.*, d.name as donor_name, d.title as donor_title,
             d.first_name as donor_first_name, d.last_name as donor_last_name,
             d.address_line_1, d.address_line_2, d.city, d.postcode,
             d.gift_aid_eligible as donor_gift_aid_eligible,
             d.gift_aid_declaration_date as donor_declaration_date
      FROM transactions t
      JOIN donors d ON d.id = t.donor_id
      WHERE t.type = 'INCOME'
        AND t.status NOT IN ('VOIDED', 'FAILED', 'PENDING_APPROVAL')
        AND t.gift_aid = 1
        AND t.id NOT IN (SELECT transaction_id FROM gift_aid_claim_items)
    `;
    const args = [];
    if (dateFrom) {
      sql += ` AND t.transaction_date >= ?`;
      args.push(dateFrom);
    }
    if (dateTo) {
      sql += ` AND t.transaction_date <= ?`;
      args.push(dateTo);
    }
    sql += ` ORDER BY t.transaction_date ASC`;

    const res = await db.prepare(sql).bind(...args).all();
    const candidateTxs = res.results || [];

    const claimable = [];
    for (const tx of candidateTxs) {
      if (tx.address_line_1 && tx.postcode) {
        const covered = await this.isGiftAidCovered(tx.donor_id, tx.transaction_date);
        if (covered) {
          claimable.push({
            ...tx,
            total_amount: tx.total_amount / 100,
            total_amount_pence: tx.total_amount
          });
        }
      }
    }
    return claimable;
  }

  async createGiftAidClaimBatch(data = {}) {
    if (this.role !== 'ADMIN' && this.role !== 'AUDITOR') {
      throw new Error('Forbidden: Only Financial Secretary (Admin) or Auditor can submit Gift Aid claims.');
    }
    const period_start = data.period_start || data.periodStart;
    const period_end = data.period_end || data.periodEnd;
    const notes = data.notes || '';
    const dateFilters = {};
    if (period_start) dateFilters.dateFrom = period_start;
    if (period_end) dateFilters.dateTo = period_end;

    let claimable = await this.getGiftAidClaimableTransactions(dateFilters);
    if (Array.isArray(data.transactionIds) && data.transactionIds.length > 0) {
      claimable = claimable.filter(t => data.transactionIds.includes(t.id));
    }

    if (claimable.length === 0) {
      throw new Error('No claimable Gift Aid donations found for the specified period, or all eligible donations have already been claimed.');
    }

    const db = await this.getDb();
    const claimId = `gaclaim-${crypto.randomUUID().substring(0, 8)}`;
    const countRow = await db.prepare(`SELECT count(*) as count FROM gift_aid_claims`).first('count');
    const claimRef = `HMRC-GA-${new Date().getFullYear()}-${String((countRow || 0) + 1).padStart(4, '0')}`;

    let totalDonationsPence = 0;
    let totalClaimPence = 0;

    const claimStatements = [];

    claimable.forEach(tx => {
      totalDonationsPence += tx.total_amount_pence;
      const claimP = Math.round(tx.total_amount_pence * 0.25); // 25% HMRC Gift Aid rate
      totalClaimPence += claimP;

      const itemId = `gaitem-${crypto.randomUUID().substring(0, 8)}`;
      claimStatements.push(
        db.prepare(`
          INSERT INTO gift_aid_claim_items (id, claim_id, transaction_id, donation_amount_pence, claim_amount_pence, created_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
        `).bind(itemId, claimId, tx.id, tx.total_amount_pence, claimP)
      );
    });

    const headerStmt = db.prepare(`
      INSERT INTO gift_aid_claims (
        id, claim_reference, period_start, period_end, total_donations_pence,
        total_claim_pence, status, submitted_at, submitted_by, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'SUBMITTED', datetime('now'), ?, ?, datetime('now'))
    `).bind(
      claimId, claimRef, period_start, period_end, totalDonationsPence,
      totalClaimPence, this.userId, sanitizeText(notes)
    );

    // Execute atomic batch
    await db.batch([headerStmt, ...claimStatements]);

    await this.logAudit('gift_aid_claims', claimId, 'SUBMIT_CLAIM', {
      claim_reference: claimRef,
      transaction_count: claimable.length,
      total_donations: totalDonationsPence / 100,
      total_claim: totalClaimPence / 100
    });

    return {
      id: claimId,
      claim_reference: claimRef,
      claimReference: claimRef,
      period_start,
      periodStart: period_start,
      period_end,
      periodEnd: period_end,
      transaction_count: claimable.length,
      transactionCount: claimable.length,
      total_donations: totalDonationsPence / 100,
      totalDonations: totalDonationsPence / 100,
      total_donations_pence: totalDonationsPence,
      totalDonationsPence,
      total_claim: totalClaimPence / 100,
      totalClaim: totalClaimPence / 100,
      total_claim_pence: totalClaimPence,
      totalClaimPence,
      status: 'SUBMITTED'
    };
  }

  async getGiftAidClaims() {
    const db = await this.getDb();
    const res = await db.prepare(`
      SELECT c.*, count(i.id) as item_count
      FROM gift_aid_claims c
      LEFT JOIN gift_aid_claim_items i ON i.claim_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `).all();

    return (res.results || []).map(r => ({
      ...r,
      total_donations: r.total_donations_pence / 100,
      total_claim: r.total_claim_pence / 100
    }));
  }

  // -------------------------------------------------------------
  // TRANSACTIONS & SPLITS (Items #4, #11, #12, #21, #22)
  // -------------------------------------------------------------
  async getTransactions(filters = {}) {
    const db = await this.getDb();
    let sql = `
      SELECT t.*, d.name as donor_name, d.gift_aid_eligible as donor_gift_aid
      FROM transactions t
      LEFT JOIN donors d ON d.id = t.donor_id
      WHERE 1=1
    `;
    const args = [];

    if (filters.type) {
      sql += ` AND t.type = ?`;
      args.push(filters.type.toUpperCase());
    }
    if (filters.status) {
      sql += ` AND t.status = ?`;
      args.push(filters.status.toUpperCase());
    }
    if (filters.approval_status) {
      sql += ` AND t.approval_status = ?`;
      args.push(filters.approval_status.toUpperCase());
    }
    if (filters.donor_id) {
      sql += ` AND t.donor_id = ?`;
      args.push(filters.donor_id);
    }
    if (filters.category) {
      sql += ` AND t.category = ?`;
      args.push(filters.category);
    }
    if (filters.reconciled !== undefined) {
      sql += ` AND t.reconciled = ?`;
      args.push(filters.reconciled ? 1 : 0);
    }
    if (filters.is_jummah !== undefined) {
      sql += ` AND t.is_jummah = ?`;
      args.push(filters.is_jummah ? 1 : 0);
    }
    if (filters.dateFrom) {
      sql += ` AND t.transaction_date >= ?`;
      args.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      sql += ` AND t.transaction_date <= ?`;
      args.push(filters.dateTo);
    }

    sql += ` ORDER BY t.transaction_date DESC, t.created_at DESC`;

    const txRes = await db.prepare(sql).bind(...args).all();
    const transactions = txRes.results || [];

    if (transactions.length === 0) return [];

    // Batch hydrate splits for all matching transactions
    const txIds = transactions.map(t => t.id);
    const placeholders = txIds.map(() => '?').join(',');
    const splitsRes = await db.prepare(`
      SELECT s.*, f.name as fund_name, f.is_restricted
      FROM transaction_splits s
      JOIN funds f ON f.id = s.fund_id
      WHERE s.transaction_id IN (${placeholders})
    `).bind(...txIds).all();

    const splitsMap = {};
    (splitsRes.results || []).forEach(s => {
      if (!splitsMap[s.transaction_id]) splitsMap[s.transaction_id] = [];
      splitsMap[s.transaction_id].push({
        ...s,
        fundId: s.fund_id,
        fund_id: s.fund_id,
        fundName: s.fund_name,
        fund_name: s.fund_name,
        isRestricted: Boolean(s.is_restricted),
        is_restricted: Boolean(s.is_restricted),
        amount: s.amount / 100, // display as pounds
        amount_pence: s.amount
      });
    });

    return transactions.map(t => ({
      ...t,
      reconciled: Boolean(t.reconciled),
      is_reconciled: Boolean(t.reconciled),
      isReconciled: Boolean(t.reconciled),
      is_jummah: Boolean(t.is_jummah),
      isJummah: Boolean(t.is_jummah),
      gift_aid: Boolean(t.gift_aid),
      giftAid: Boolean(t.gift_aid),
      approval_status: t.approval_status || 'NOT_REQUIRED',
      approvalStatus: t.approval_status || 'NOT_REQUIRED',
      approved_by: t.approved_by || null,
      approved_at: t.approved_at || null,
      rejected_by: t.rejected_by || null,
      rejected_at: t.rejected_at || null,
      rejection_reason: t.rejection_reason || null,
      total_amount: t.total_amount / 100, // display as pounds
      totalAmount: t.total_amount / 100,
      total_amount_pence: t.total_amount,
      splits: splitsMap[t.id] || []
    }));

  }

  async getTransaction(id) {
    const txs = await this.getTransactions();
    return txs.find(t => t.id === id) || null;
  }

  async createTransaction(data) {
    this.checkAdmin();
    const db = await this.getDb();

    const type = (data.type || 'INCOME').toUpperCase();
    if (type !== 'INCOME' && type !== 'EXPENSE') {
      throw new Error(`Invalid transaction type: '${type}'. Must be INCOME or EXPENSE.`);
    }

    const totalPence = Math.round(parseFloat(data.totalAmount || data.total_amount || 0) * 100);
    if (isNaN(totalPence) || totalPence <= 0) {
      throw new Error('Transaction total amount must be a positive number greater than £0.00.');
    }

    const status = (data.status || 'PENDING').toUpperCase();
    const method = (data.method || 'CASH').toUpperCase();
    const category = sanitizeText(data.category || (type === 'INCOME' ? 'Donation' : 'Maintenance'));
    const donorId = data.donorId || data.donor_id || 'anonymous';
    const refNote = sanitizeText(data.reference_note || data.referenceNote || '');
    const notes = sanitizeText(data.notes || '');
    const giftAid = (data.giftAid || data.gift_aid) ? 1 : 0;

    // 1. Force interest (Riba) category to Interest/Riba fund
    let rawSplits = Array.isArray(data.splits) ? [...data.splits] : [];
    if (type === 'INCOME' && (refNote === 'Interest' || category === 'Interest' || category.toLowerCase().includes('riba'))) {
      const ribaFund = await db.prepare(`SELECT id, name FROM funds WHERE LOWER(name) = 'interest/riba' OR LOWER(name) = 'riba'`).first();
      if (ribaFund) {
        rawSplits = [{ fund_id: ribaFund.id, amount: (totalPence / 100) }];
      }
    }

    // Default split if none provided
    if (rawSplits.length === 0) {
      const defaultFund = await db.prepare(`SELECT id, name FROM funds WHERE is_archived = 0 AND is_restricted = 0 ORDER BY id ASC`).first();
      if (!defaultFund) throw new Error('No active fund available for transaction split.');
      rawSplits = [{ fund_id: defaultFund.id, amount: (totalPence / 100) }];
    }

    // Check unique fund IDs in splits
    const fundIdSet = new Set();
    for (const s of rawSplits) {
      if (!s.fund_id) throw new Error('Each split must specify a fund_id.');
      if (fundIdSet.has(s.fund_id)) {
        throw new Error('Duplicate fund detected in transaction splits. Each fund split must be unique.');
      }
      fundIdSet.add(s.fund_id);
    }

    // Validate funds exist and are not archived
    const fundPlaceholders = Array.from(fundIdSet).map(() => '?').join(',');
    const fundsRes = await db.prepare(`
      SELECT id, name, is_restricted, is_archived FROM funds WHERE id IN (${fundPlaceholders})
    `).bind(...Array.from(fundIdSet)).all();
    const fundMap = new Map((fundsRes.results || []).map(f => [f.id, f]));

    for (const s of rawSplits) {
      const fund = fundMap.get(s.fund_id);
      if (!fund) {
        throw new Error(`Fund with ID '${s.fund_id}' not found.`);
      }
      if (fund.is_archived) {
        throw new Error(`Cannot allocate to archived fund '${fund.name}'.`);
      }
    }

    // Validate split amounts match total amount in pence
    let splitSumPence = 0;
    const validatedSplits = rawSplits.map(s => {
      const p = Math.round(parseFloat(s.amount || 0) * 100);
      if (isNaN(p) || p <= 0) {
        throw new Error('Split amount must be greater than £0.00.');
      }
      splitSumPence += p;
      return {
        id: `split-${crypto.randomUUID().substring(0, 8)}`,
        fund_id: s.fund_id,
        amount_pence: p
      };
    });

    if (splitSumPence !== totalPence) {
      throw new Error(`Allocated splits (£${(splitSumPence / 100).toFixed(2)}) must exactly match total amount (£${(totalPence / 100).toFixed(2)}).`);
    }

    // Strict Shariah Compliance Rule (Restricted funds Zakat / Fitrana can ONLY be spent on Charitable Payout)
    if (type === 'EXPENSE') {
      for (const s of validatedSplits) {
        const fund = fundMap.get(s.fund_id);
        if (fund && fund.is_restricted && (fund.name.toLowerCase() === 'zakat' || fund.name.toLowerCase() === 'fitrana')) {
          if (category !== 'Charitable Payout') {
            throw new Error(`Strict Compliance Violation: Restricted funds (${fund.name}) can only be disbursed under the 'Charitable Payout' category to eligible beneficiaries (Asnaf). Found category: '${category}'.`);
          }
          const auditNote = refNote || notes;
          if (!auditNote || !auditNote.trim()) {
            throw new Error(`Zakat and Fitrana disbursements require detailed beneficiary (Asnaf) notes for auditing purposes.`);
          }
        }
      }
    }


    // Gift Aid Constraint
    if (type === 'INCOME' && giftAid) {
      if (!donorId || donorId === 'anonymous') {
        throw new Error('Gift Aid can only be claimed if a named donor is specified.');
      }
      const donor = await db.prepare(`SELECT * FROM donors WHERE id = ?`).bind(donorId).first();
      if (!donor || !donor.gift_aid_eligible || !donor.address_line_1 || !donor.postcode) {
        throw new Error('Gift Aid can only be claimed if the donor profile has a signed declaration and a valid UK address.');
      }
    }

    // Generate atomic receipt number for INCOME only
    let receiptNumber = '';
    const txDate = data.date || data.transaction_date || new Date().toISOString().split('T')[0];

    if (type === 'INCOME') {
      const orgUpdate = await db.prepare(`
        UPDATE organisations
        SET receipt_counter = receipt_counter + 1, updated_at = datetime('now')
        WHERE id = 'main'
        RETURNING receipt_counter, short_name, fiscal_year_start
      `).first();

      const counter = orgUpdate?.receipt_counter || Math.floor(Math.random() * 9000) + 1000;
      const orgShort = orgUpdate?.short_name || 'BSMC';
      const fiscalBounds = getFiscalYearBounds(txDate, orgUpdate?.fiscal_year_start || '04-06');
      receiptNumber = `${orgShort}-${fiscalBounds.startYear}-${String(counter).padStart(4, '0')}`;
    }

    const txId = `tx-${crypto.randomUUID().substring(0, 8)}`;
    const isJummah = Boolean(data.is_jummah || data.isJummah) ||
      ((category?.toLowerCase().includes('jummah') || refNote?.toLowerCase().includes('jummah')) ? 1 : 0);

    let jummahDetails = null;
    if (isJummah) {
      // 1. Enforce Friday collection date
      const dateObj = new Date(txDate + 'T12:00:00Z');
      if (dateObj.getUTCDay() !== 5) {
        throw new Error(`Governance Violation: Jummah cash collections must occur on a Friday (Date '${txDate}' is not a Friday).`);
      }

      // 2. Enforce two distinct counters
      const counter1 = sanitizeText(data.counter1 || data.counter_1_name || '');
      const counter2 = sanitizeText(data.counter2 || data.counter_2_name || '');
      if (!counter1 || !counter2) {
        throw new Error('Dual Witness Requirement: Two independent cash counters / two distinct witness counters must be provided for Jummah collections.');
      }
      if (counter1.trim().toLowerCase() === counter2.trim().toLowerCase()) {
        throw new Error('Dual Witness Requirement: Counter 1 and Counter 2 must be two distinct witness counters / individuals (found duplicate witness name).');
      }

      // 3. Denominations check if provided
      const n50 = parseInt(data.notes_50 ?? data.notes_50_count ?? 0, 10);
      const n20 = parseInt(data.notes_20 ?? data.notes_20_count ?? 0, 10);
      const n10 = parseInt(data.notes_10 ?? data.notes_10_count ?? 0, 10);
      const n5 = parseInt(data.notes_5 ?? data.notes_5_count ?? 0, 10);
      const coinsPence = Math.round(parseFloat(data.coins_total || data.coins_total_pence || 0) * 100);

      const denomTotalPence = (n50 * 5000) + (n20 * 2000) + (n10 * 1000) + (n5 * 500) + coinsPence;
      if (denomTotalPence > 0 && denomTotalPence !== totalPence) {
        throw new Error(`Denomination mismatch: Counted breakdown (£${(denomTotalPence / 100).toFixed(2)}) does not match total amount (£${(totalPence / 100).toFixed(2)}).`);
      }

      jummahDetails = {
        id: `jummah-${crypto.randomUUID().substring(0, 8)}`,
        notes_50_count: n50,
        notes_20_count: n20,
        notes_10_count: n10,
        notes_5_count: n5,
        coins_total_pence: coinsPence,
        counter_1_name: counter1,
        counter_2_name: counter2,
        notes: sanitizeText(data.jummah_notes || '')
      };
    }

    // Dual Approval Rule (Maker-Checker):
    // Large expenses (>= approval_threshold_pence) or restricted fund disbursements (e.g. Zakat / Fitrana) require dual approval
    let requiresApproval = false;
    let finalStatus = status;
    let approvalStatus = 'NOT_REQUIRED';

    if (type === 'EXPENSE') {
      const orgRow = await db.prepare(`SELECT approval_threshold_pence FROM organisations WHERE id = 'main'`).first();
      const thresholdPence = orgRow?.approval_threshold_pence || 100000; // £1,000 default

      const touchesRestricted = validatedSplits.some(s => {
        const fund = fundMap.get(s.fund_id);
        return fund && Boolean(fund.is_restricted);
      });

      if (totalPence >= thresholdPence || touchesRestricted) {
        requiresApproval = true;
        finalStatus = 'PENDING_APPROVAL';
        approvalStatus = 'PENDING';
      }
    }

    // Atomic D1 batch statement execution
    const batchStatements = [
      db.prepare(`
        INSERT INTO transactions (
          id, type, status, method, total_amount, transaction_date, donor_id,
          receipt_url, receipt_number, reference_note, category, gift_aid,
          notes, reconciled, is_jummah, approval_status, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(
        txId, type, finalStatus, method, totalPence, txDate, donorId,
        data.receipt_url || '', receiptNumber, refNote, category, giftAid,
        notes, isJummah ? 1 : 0, approvalStatus, this.userId
      )
    ];

    if (jummahDetails) {
      batchStatements.push(
        db.prepare(`
          INSERT INTO jummah_collections (
            id, transaction_id, collection_date, notes_50_count, notes_20_count,
            notes_10_count, notes_5_count, coins_total_pence, total_pence,
            counter_1_name, counter_2_name, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
          jummahDetails.id, txId, txDate, jummahDetails.notes_50_count,
          jummahDetails.notes_20_count, jummahDetails.notes_10_count,
          jummahDetails.notes_5_count, jummahDetails.coins_total_pence,
          totalPence, jummahDetails.counter_1_name, jummahDetails.counter_2_name,
          jummahDetails.notes
        )
      );
    }

    validatedSplits.forEach(s => {
      batchStatements.push(
        db.prepare(`
          INSERT INTO transaction_splits (id, transaction_id, fund_id, amount, is_voided, created_at)
          VALUES (?, ?, ?, ?, 0, datetime('now'))
        `).bind(s.id, txId, s.fund_id, s.amount_pence)
      );
    });

    await db.batch(batchStatements);
    invalidateBalanceCache();

    if (requiresApproval) {
      const notifId = `notif-${crypto.randomUUID().substring(0, 8)}`;
      await db.prepare(`
        INSERT INTO notifications (id, type, severity, message, transaction_id, created_at)
        VALUES (?, 'EXPENSE_PENDING_APPROVAL', 'WARNING', ?, ?, datetime('now'))
      `).bind(notifId, `Dual approval required for £${(totalPence / 100).toFixed(2)} expense (${refNote || category}). Requires review by another trustee.`, txId).run();
    }

    await this.logAudit('transactions', txId, 'INSERT', {
      type, total_amount: totalPence / 100, receipt_number: receiptNumber, is_jummah: isJummah, approval_status: approvalStatus
    });

    return await this.getTransaction(txId);
  }

  async reconcileTransaction(id, options = {}) {
    const bankStatementRef = typeof options === 'string' ? options : (options?.bankStatementRef || '');
    this.checkAdmin();
    if (!bankStatementRef || !bankStatementRef.trim()) {
      throw new Error('A valid bank statement reference is required for reconciliation.');
    }
    const db = await this.getDb();
    const tx = await db.prepare(`SELECT * FROM transactions WHERE id = ?`).bind(id).first();
    if (!tx) throw new Error(`Transaction not found with ID ${id}`);
    if (tx.status === 'VOIDED') throw new Error('Cannot reconcile a voided transaction.');
    if (tx.status === 'FAILED') throw new Error('Cannot reconcile a failed transaction.');
    if (tx.status === 'PENDING') throw new Error('Transaction must be banked or settled before it can be reconciled against a bank statement.');

    await db.prepare(`
      UPDATE transactions SET
        reconciled = 1,
        reconciled_at = datetime('now'),
        reconciled_by = ?,
        bank_statement_ref = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(this.userId, sanitizeText(bankStatementRef.trim()), id).run();

    await this.logAudit('transactions', id, 'RECONCILE', { bank_statement_ref: bankStatementRef });
    return await this.getTransaction(id);
  }

  async depositCash(id) {
    this.checkAdmin();
    const db = await this.getDb();
    const tx = await db.prepare(`SELECT * FROM transactions WHERE id = ?`).bind(id).first();
    if (!tx) throw new Error('Transaction not found');
    if (tx.reconciled) throw new Error('Cannot bank a transaction that is already reconciled and permanently locked.');
    if (tx.type !== 'INCOME') throw new Error('Only INCOME transactions can be banked as cash deposits.');
    if (tx.method !== 'CASH') throw new Error(`Only CASH income can be deposited into the bank (found ${tx.method}).`);
    if (tx.status !== 'PENDING') throw new Error('Only pending Cash on Hand can be banked.');

    await db.prepare(`
      UPDATE transactions SET status = 'BANKED', updated_at = datetime('now') WHERE id = ?
    `).bind(id).run();

    await this.logAudit('transactions', id, 'BANK_DEPOSIT', { previous_status: 'PENDING', new_status: 'BANKED' });
    return await this.getTransaction(id);
  }

  async voidTransaction(id, reason) {
    this.checkAdmin();
    if (!reason || !reason.trim() || reason.trim().length < 5) {
      throw new Error('A detailed void justification (min 5 characters) is required.');
    }
    const db = await this.getDb();
    const tx = await db.prepare(`SELECT * FROM transactions WHERE id = ?`).bind(id).first();
    if (!tx) throw new Error(`Transaction not found with ID ${id}`);
    if (tx.reconciled) throw new Error('Cannot void reconciled transaction.');
    if (tx.status === 'VOIDED') throw new Error('Transaction is already voided.');

    const batch = [
      db.prepare(`
        UPDATE transactions SET
          status = 'VOIDED',
          void_reason = ?,
          voided_at = datetime('now'),
          voided_by = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).bind(sanitizeText(reason), this.userId, id),
      db.prepare(`
        UPDATE transaction_splits SET
          is_voided = 1,
          voided_at = datetime('now')
        WHERE transaction_id = ?
      `).bind(id),
      db.prepare(`
        DELETE FROM asnaf_records WHERE transaction_id = ?
      `).bind(id)
    ];

    await db.batch(batch);
    invalidateBalanceCache();

    await this.logAudit('transactions', id, 'VOID', { reason });
    return await this.getTransaction(id);
  }

  async approveTransaction(id) {
    if (this.role !== 'ADMIN' && this.role !== 'REVIEWER') {
      throw new Error('Forbidden: Only Administrators or Reviewers can approve transactions.');
    }
    const db = await this.getDb();
    const tx = await db.prepare(`SELECT * FROM transactions WHERE id = ?`).bind(id).first();
    if (!tx) throw new Error(`Transaction not found with ID ${id}`);

    if (tx.status !== 'PENDING_APPROVAL') {
      throw new Error(`Transaction ${id} is not pending approval (current status: ${tx.status}).`);
    }

    // Strict No-Self-Approval rule
    if (tx.created_by === this.userId) {
      throw new Error('Strict Governance Violation: Approver cannot approve their own transaction (Maker-Checker rule violated). Self-approval is strictly prohibited.');
    }

    const nextStatus = (tx.method === 'CASH') ? 'PENDING' : 'BANKED';

    await db.prepare(`
      UPDATE transactions SET
        status = ?,
        approval_status = 'APPROVED',
        approved_by = ?,
        approved_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(nextStatus, this.userId, id).run();

    invalidateBalanceCache();

    await this.logAudit('transactions', id, 'APPROVE_TRANSACTION', {
      approved_by: this.userId,
      previous_status: 'PENDING_APPROVAL',
      new_status: nextStatus
    });

    return await this.getTransaction(id);
  }

  async rejectTransaction(id, reason) {
    if (this.role !== 'ADMIN' && this.role !== 'REVIEWER') {
      throw new Error('Forbidden: Only Administrators or Reviewers can reject transactions.');
    }
    if (!reason || !reason.trim() || reason.trim().length < 5) {
      throw new Error('A detailed rejection reason (minimum 5 characters / at least 5 characters) is required.');
    }

    const db = await this.getDb();
    const tx = await db.prepare(`SELECT * FROM transactions WHERE id = ?`).bind(id).first();
    if (!tx) throw new Error(`Transaction not found with ID ${id}`);

    if (tx.status !== 'PENDING_APPROVAL') {
      throw new Error(`Transaction ${id} is not pending approval (current status: ${tx.status}).`);
    }

    // Strict No-Self-Approval rule
    if (tx.created_by === this.userId) {
      throw new Error('Strict Governance Violation: Self-approval is prohibited. Transactions cannot be rejected or self-resolved by the creator.');
    }

    await db.prepare(`
      UPDATE transactions SET
        status = 'FAILED',
        approval_status = 'REJECTED',
        rejected_by = ?,
        rejected_at = datetime('now'),
        rejection_reason = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(this.userId, sanitizeText(reason.trim()), id).run();

    invalidateBalanceCache();

    await this.logAudit('transactions', id, 'REJECT_TRANSACTION', {
      rejected_by: this.userId,
      reason: reason.trim(),
      previous_status: 'PENDING_APPROVAL',
      new_status: 'FAILED'
    });

    return await this.getTransaction(id);
  }

  // -------------------------------------------------------------
  // BALANCES & AGGREGATIONS (Item #13)
  // -------------------------------------------------------------
  async getBalances() {
    const now = Date.now();
    if (balanceCache.data && now - balanceCache.timestamp < BALANCE_CACHE_TTL_MS) {
      return balanceCache.data;
    }

    const db = await this.getDb();
    const res = await db.prepare(`
      SELECT f.id, f.name, f.is_restricted,
             COALESCE(SUM(
               CASE 
                 WHEN t.id IS NULL THEN 0
                 WHEN t.type = 'INCOME' THEN s.amount 
                 ELSE -s.amount 
               END
             ), 0) as balance_pence
      FROM funds f
      LEFT JOIN transaction_splits s ON s.fund_id = f.id AND s.is_voided = 0
      LEFT JOIN transactions t ON t.id = s.transaction_id AND t.status NOT IN ('VOIDED', 'FAILED', 'PENDING_APPROVAL')
      WHERE f.is_archived = 0
      GROUP BY f.id, f.name, f.is_restricted
      ORDER BY f.name ASC
    `).all();

    const balances = (res.results || []).map(r => ({
      id: r.id,
      fundId: r.id,
      name: r.name,
      fundName: r.name,
      is_restricted: Boolean(r.is_restricted),
      isRestricted: Boolean(r.is_restricted),
      is_archived: false,
      isArchived: false,
      balance: r.balance_pence / 100,
      balance_pence: r.balance_pence
    }));

    balanceCache = { data: balances, timestamp: now };
    return balances;
  }

  // -------------------------------------------------------------
  // BUDGETS & TARGETS (Item #22)
  // -------------------------------------------------------------
  async getBudgets(fiscalYear) {
    const db = await this.getDb();
    let sql = `
      SELECT b.*, f.name as fund_name
      FROM budgets b
      JOIN funds f ON f.id = b.fund_id
    `;
    const args = [];
    if (fiscalYear) {
      sql += ` WHERE b.fiscal_year = ?`;
      args.push(parseInt(fiscalYear, 10));
    }
    sql += ` ORDER BY b.fiscal_year DESC, f.name ASC`;

    const res = await db.prepare(sql).bind(...args).all();
    return (res.results || []).map(b => ({
      ...b,
      target_amount: b.target_amount / 100,
      max_spend_limit: b.max_spend_limit ? b.max_spend_limit / 100 : null
    }));
  }

  async saveBudget({ fund_id, fiscal_year, target_amount, max_spend_limit, notes }) {
    this.checkAdmin();
    const db = await this.getDb();
    const budgetId = `bud-${crypto.randomUUID().substring(0, 8)}`;
    const year = parseInt(fiscal_year, 10);
    if (isNaN(year) || year < 2000 || year > 2100) {
      throw new Error('Valid fiscal year is required.');
    }
    const fund = await this.getFundById(fund_id);
    if (!fund) {
      throw new Error(`Fund not found with ID ${fund_id}`);
    }
    const targetPence = Math.round(parseFloat(target_amount || 0) * 100);
    if (isNaN(targetPence) || targetPence < 0) {
      throw new Error('Target amount cannot be negative.');
    }
    const maxSpendPence = max_spend_limit !== undefined && max_spend_limit !== null && max_spend_limit !== ''
      ? Math.round(parseFloat(max_spend_limit) * 100)
      : null;
    if (maxSpendPence !== null && (isNaN(maxSpendPence) || maxSpendPence < 0)) {
      throw new Error('Max spend limit cannot be negative.');
    }
    const cleanNotes = sanitizeText(notes || '');

    await db.prepare(`
      INSERT INTO budgets (id, fund_id, fiscal_year, target_amount, max_spend_limit, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(fund_id, fiscal_year) DO UPDATE SET
        target_amount = excluded.target_amount,
        max_spend_limit = excluded.max_spend_limit,
        notes = excluded.notes,
        updated_at = datetime('now')
    `).bind(budgetId, fund_id, year, targetPence, maxSpendPence, cleanNotes).run();

    await this.logAudit('budgets', `${fund_id}-${year}`, 'UPSERT', {
      fund_id, fiscal_year: year, target_amount: targetPence / 100, max_spend_limit: maxSpendPence ? maxSpendPence / 100 : null
    });

    const saved = await db.prepare(`SELECT * FROM budgets WHERE fund_id = ? AND fiscal_year = ?`).bind(fund_id, year).first();
    return {
      ...saved,
      target_amount: saved.target_amount / 100,
      max_spend_limit: saved.max_spend_limit ? saved.max_spend_limit / 100 : null
    };
  }

  // -------------------------------------------------------------
  // ASNAF DISBURSEMENTS (Items #8, #22)
  // -------------------------------------------------------------
  async getAsnafRecords(fiscalYearOrTxId) {
    const db = await this.getDb();
    let sql = `
      SELECT a.* 
      FROM asnaf_records a
      JOIN transactions t ON t.id = a.transaction_id
      WHERE t.status NOT IN ('VOIDED', 'FAILED')
    `;
    const args = [];

    if (fiscalYearOrTxId && typeof fiscalYearOrTxId === 'string' && fiscalYearOrTxId.startsWith('tx-')) {
      sql += ` AND a.transaction_id = ?`;
      args.push(fiscalYearOrTxId);
    } else if (fiscalYearOrTxId) {
      const year = String(fiscalYearOrTxId);
      sql += ` AND a.distribution_date LIKE ?`;
      args.push(`${year}%`);
    }

    sql += ` ORDER BY a.distribution_date DESC, a.created_at DESC`;
    const res = await db.prepare(sql).bind(...args).all();
    return (res.results || []).map(r => ({
      ...r,
      amount: r.amount / 100
    }));
  }

  async recordAsnafDisbursement({ transaction_id, beneficiary_name, asnaf_category, amount, distribution_date, witness_name, verification_notes }) {
    this.checkAdmin();
    const validCategories = ['FUQARA', 'MASAKEEN', 'AMILINA_ALAYHA', 'MUALLAFAT_QULUB', 'FIR_RIQAB', 'GHARIMEEN', 'FI_SABILILLAH', 'IBN_SABIL'];
    if (!validCategories.includes(asnaf_category)) {
      throw new Error(`Invalid Asnaf category: ${asnaf_category}`);
    }
    if (!beneficiary_name || !beneficiary_name.trim()) {
      throw new Error('Beneficiary name or pseudonym is required for Zakat audit trail.');
    }

    const amountPence = Math.round(parseFloat(amount || 0) * 100);
    if (isNaN(amountPence) || amountPence <= 0) {
      throw new Error('Asnaf disbursement amount must be greater than zero.');
    }

    const db = await this.getDb();

    // Item #8: Cross-reference verification of source transaction
    const tx = await db.prepare(`SELECT * FROM transactions WHERE id = ?`).bind(transaction_id).first();
    if (!tx) {
      throw new Error(`Source transaction '${transaction_id}' not found.`);
    }

    if (tx.type !== 'EXPENSE') {
      throw new Error(`Asnaf disbursements can only be linked to EXPENSE transactions (found ${tx.type}).`);
    }
    if (tx.status === 'VOIDED' || tx.status === 'FAILED') {
      throw new Error('Cannot link Asnaf disbursement to a VOIDED or FAILED transaction.');
    }

    // Verify source transaction splits include a restricted Islamic fund (Zakat/Fitrana)
    const splits = await db.prepare(`
      SELECT s.*, f.name, f.is_restricted
      FROM transaction_splits s
      JOIN funds f ON f.id = s.fund_id
      WHERE s.transaction_id = ? AND s.is_voided = 0
    `).bind(transaction_id).all();

    const eligibleSplits = (splits.results || []).filter(s =>
      s.is_restricted === 1 && (s.name?.toLowerCase().includes('zakat') || s.name?.toLowerCase().includes('fitrana'))
    );
    if (eligibleSplits.length === 0) {
      throw new Error('Asnaf disbursements must be linked to a transaction funded by a restricted Islamic fund (e.g. Zakat, Fitrana).');
    }

    const eligibleSplitTotalPence = eligibleSplits.reduce((sum, s) => sum + s.amount, 0);

    // Verify cumulative Asnaf disbursements <= eligible restricted split total
    const existingSum = await db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM asnaf_records WHERE transaction_id = ?
    `).bind(transaction_id).first('total');

    if ((existingSum + amountPence) > eligibleSplitTotalPence) {
      throw new Error(`Total Asnaf disbursements (£${((existingSum + amountPence) / 100).toFixed(2)}) cannot exceed eligible restricted Zakat/Fitrana fund allocation (£${(eligibleSplitTotalPence / 100).toFixed(2)}).`);
    }

    const asnafId = `asnaf-${crypto.randomUUID().substring(0, 8)}`;
    const distDate = distribution_date || new Date().toISOString().split('T')[0];

    await db.prepare(`
      INSERT INTO asnaf_records (
        id, transaction_id, beneficiary_name, asnaf_category, amount,
        distribution_date, witness_name, verification_notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      asnafId,
      transaction_id,
      sanitizeText(beneficiary_name),
      asnaf_category,
      amountPence,
      distDate,
      sanitizeText(witness_name || ''),
      sanitizeText(verification_notes || '')
    ).run();

    await this.logAudit('asnaf_records', asnafId, 'INSERT', {
      transaction_id, beneficiary_name, asnaf_category, amount: amountPence / 100
    });

    return {
      id: asnafId,
      transaction_id,
      beneficiary_name,
      asnaf_category,
      amount: amountPence / 100,
      distribution_date: distDate,
      witness_name,
      verification_notes,
      created_at: new Date().toISOString()
    };
  }


  // -------------------------------------------------------------
  // NOTIFICATIONS (Item #14)
  // -------------------------------------------------------------
  async createNotification({ type, severity = 'INFO', message, transaction_id = null }) {
    const db = await this.getDb();
    const id = `notif-${crypto.randomUUID().substring(0, 8)}`;
    await db.prepare(`
      INSERT INTO notifications (id, type, severity, message, transaction_id, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).bind(id, type, severity, message, transaction_id).run();
    return id;
  }

  async getNotifications(unreadOnly = false, limit = 50) {
    const db = await this.getDb();
    let sql = `SELECT * FROM notifications`;
    if (unreadOnly) {
      sql += ` WHERE read_at IS NULL`;
    }
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    const res = await db.prepare(sql).bind(limit).all();
    return res.results || [];
  }

  async markNotificationRead(id) {
    const db = await this.getDb();
    if (id === 'all') {
      await db.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE read_at IS NULL`).run();
    } else {
      await db.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE id = ?`).bind(id).run();
    }
    return true;
  }

  // -------------------------------------------------------------
  // BACKUP & RESTORE WITH SNAPSHOTS & DRY-RUN (Item #15)
  // -------------------------------------------------------------
  async exportBackup() {
    this.checkAdmin();
    const db = await this.getDb();

    const org = await this.getOrganisation();
    const users = (await db.prepare(`SELECT id, email, name, role, status, password_hash, created_at, updated_at FROM users`).all()).results || [];
    const funds = (await db.prepare(`SELECT * FROM funds`).all()).results || [];
    const donors = (await db.prepare(`SELECT * FROM donors`).all()).results || [];
    const transactions = (await db.prepare(`SELECT * FROM transactions`).all()).results || [];
    const splits = (await db.prepare(`SELECT * FROM transaction_splits`).all()).results || [];
    const audits = (await db.prepare(`SELECT * FROM audit_logs`).all()).results || [];
    const budgets = (await db.prepare(`SELECT * FROM budgets`).all()).results || [];
    const asnaf = (await db.prepare(`SELECT * FROM asnaf_records`).all()).results || [];
    const gaDecls = (await db.prepare(`SELECT * FROM gift_aid_declarations`).all()).results || [];
    const gaClaims = (await db.prepare(`SELECT * FROM gift_aid_claims`).all()).results || [];
    const gaItems = (await db.prepare(`SELECT * FROM gift_aid_claim_items`).all()).results || [];
    const jummahColls = (await db.prepare(`SELECT * FROM jummah_collections`).all()).results || [];

    return {
      version: '2.0-d1-integer-cents',
      exported_at: new Date().toISOString(),
      organisation: org,
      users,
      funds,
      donors,
      transactions,
      transaction_splits: splits,
      audit_logs: audits,
      budgets,
      asnaf_records: asnaf,
      gift_aid_declarations: gaDecls,
      gift_aid_claims: gaClaims,
      gift_aid_claim_items: gaItems,
      jummah_collections: jummahColls
    };
  }

  async createBackupSnapshot(description = 'Pre-restore safety snapshot') {
    const db = await this.getDb();
    const snapshotId = `snap-${crypto.randomUUID().substring(0, 8)}`;
    const fullDump = await this.exportBackup();

    await db.prepare(`
      INSERT INTO backup_snapshots (id, description, snapshot_data, created_by, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(snapshotId, description, JSON.stringify(fullDump), this.userId).run();

    return snapshotId;
  }

  async restoreBackup(backupData, dryRun = false) {
    this.checkAdmin();
    const db = await this.getDb();

    const diffSummary = {
      dryRun,
      organisation: Boolean(backupData.organisation),
      usersCount: backupData.users?.length || 0,
      fundsCount: backupData.funds?.length || 0,
      donorsCount: backupData.donors?.length || 0,
      transactionsCount: backupData.transactions?.length || 0,
      splitsCount: backupData.transaction_splits?.length || 0,
      budgetsCount: backupData.budgets?.length || 0,
      asnafCount: backupData.asnaf_records?.length || 0
    };

    if (dryRun) {
      return { success: true, dryRun: true, diff: diffSummary };
    }

    // Step 1: Create snapshot before executing destructive restore
    const snapshotId = await this.createBackupSnapshot('Automated snapshot before restore');

    // Step 2: Atomic restoration - respecting foreign keys
    const clearStatements = [
      db.prepare(`DELETE FROM notifications`),
      db.prepare(`DELETE FROM sessions`),
      db.prepare(`DELETE FROM gift_aid_claim_items`),
      db.prepare(`DELETE FROM gift_aid_claims`),
      db.prepare(`DELETE FROM gift_aid_declarations`),
      db.prepare(`DELETE FROM jummah_collections`),
      db.prepare(`DELETE FROM transaction_splits`),
      db.prepare(`DELETE FROM asnaf_records`),
      db.prepare(`DELETE FROM transactions`),
      db.prepare(`DELETE FROM budgets`),
      db.prepare(`DELETE FROM funds`),
      db.prepare(`DELETE FROM donors`),
      db.prepare(`DELETE FROM audit_logs`),
      db.prepare(`DELETE FROM users`)
    ];
    await db.batch(clearStatements);

    // Step 3: Populate from backup
    const isV2 = backupData.version === '2.0-d1-integer-cents';
    const toIntegerPence = (val) => {
      if (val === null || val === undefined) return 0;
      if (isV2 && typeof val === 'number' && Number.isInteger(val)) {
        return val;
      }
      return Math.round(parseFloat(val || 0) * 100);
    };

    const insertStatements = [];

    if (Array.isArray(backupData.users)) {
      backupData.users.forEach(u => {
        insertStatements.push(
          db.prepare(`INSERT INTO users (id, email, name, role, status, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
            u.id, u.email, u.name, u.role, u.status || 'ACTIVE', u.password_hash, u.created_at || new Date().toISOString()
          )
        );
      });
    }

    if (Array.isArray(backupData.funds)) {
      backupData.funds.forEach(f => {
        insertStatements.push(
          db.prepare(`INSERT INTO funds (id, name, is_restricted, description, is_archived, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(
            f.id, f.name, f.is_restricted ? 1 : 0, f.description || '', f.is_archived ? 1 : 0, f.created_at || new Date().toISOString()
          )
        );
      });
    }

    if (Array.isArray(backupData.donors)) {
      backupData.donors.forEach(d => {
        const { title, firstName, lastName } = splitDonorName(d.name || '');
        insertStatements.push(
          db.prepare(`
            INSERT INTO donors (
              id, name, title, first_name, last_name, email, phone, is_anonymous,
              gift_aid_eligible, gift_aid_declaration_date, address_line_1, address_line_2, city, postcode, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            d.id, d.name, d.title || title, d.first_name || firstName, d.last_name || lastName,
            d.email || '', d.phone || '', d.is_anonymous ? 1 : 0, d.gift_aid_eligible ? 1 : 0,
            d.gift_aid_declaration_date || null, d.address_line_1 || '', d.address_line_2 || '',
            d.city || '', d.postcode || '', d.notes || '', d.created_at || new Date().toISOString()
          )
        );
      });
    }

    if (Array.isArray(backupData.budgets)) {
      backupData.budgets.forEach(b => {
        const targetPence = toIntegerPence(b.target_amount);
        const maxSpendPence = b.max_spend_limit !== null && b.max_spend_limit !== undefined
          ? toIntegerPence(b.max_spend_limit)
          : null;

        insertStatements.push(
          db.prepare(`
            INSERT INTO budgets (id, fund_id, fiscal_year, target_amount, max_spend_limit, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            b.id || `bud-${crypto.randomUUID().substring(0, 8)}`,
            b.fund_id,
            parseInt(b.fiscal_year, 10),
            targetPence,
            maxSpendPence,
            b.notes || '',
            b.created_at || new Date().toISOString()
          )
        );
      });
    }

    if (Array.isArray(backupData.transactions)) {
      backupData.transactions.forEach(t => {
        const amountPence = toIntegerPence(t.total_amount);

        insertStatements.push(
          db.prepare(`
            INSERT INTO transactions (
              id, type, status, method, total_amount, transaction_date, donor_id,
              receipt_url, receipt_number, reference_note, category, gift_aid,
              notes, reconciled, is_jummah, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            t.id, t.type, t.status || 'PENDING', t.method || 'CASH', amountPence,
            t.transaction_date || t.date || new Date().toISOString().split('T')[0],
            t.donor_id || 'anonymous', t.receipt_url || '', t.receipt_number || '',
            t.reference_note || '', t.category || 'Donation', t.gift_aid ? 1 : 0,
            t.notes || '', t.reconciled ? 1 : 0, t.is_jummah ? 1 : 0,
            t.created_by || this.userId, t.created_at || new Date().toISOString(),
            t.updated_at || new Date().toISOString()
          )
        );
      });
    }

    if (Array.isArray(backupData.transaction_splits)) {
      backupData.transaction_splits.forEach(s => {
        const amountPence = toIntegerPence(s.amount);

        insertStatements.push(
          db.prepare(`INSERT INTO transaction_splits (id, transaction_id, fund_id, amount, is_voided, created_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(
            s.id, s.transaction_id, s.fund_id, amountPence, s.is_voided ? 1 : 0, s.created_at || new Date().toISOString()
          )
        );
      });
    }

    if (Array.isArray(backupData.asnaf_records)) {
      backupData.asnaf_records.forEach(a => {
        const amountPence = toIntegerPence(a.amount);

        insertStatements.push(
          db.prepare(`
            INSERT INTO asnaf_records (id, transaction_id, beneficiary_name, asnaf_category, amount, distribution_date, witness_name, verification_notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            a.id, a.transaction_id, a.beneficiary_name, a.asnaf_category, amountPence,
            a.distribution_date || new Date().toISOString().split('T')[0],
            a.witness_name || '', a.verification_notes || '', a.created_at || new Date().toISOString()
          )
        );
      });
    }

    if (Array.isArray(backupData.audit_logs)) {
      backupData.audit_logs.forEach(a => {
        insertStatements.push(
          db.prepare(`
            INSERT INTO audit_logs (id, table_name, record_id, action, user_id, user_email, user_name, metadata, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            a.id || `aud-${crypto.randomUUID()}`,
            a.table_name,
            a.record_id,
            a.action,
            a.user_id || null,
            a.user_email || null,
            a.user_name || null,
            typeof a.metadata === 'string' ? a.metadata : JSON.stringify(a.metadata || {}),
            a.timestamp || new Date().toISOString()
          )
        );
      });
    }

    if (backupData.organisation) {
      await this.updateOrganisation(backupData.organisation);
    }

    // Execute batch insertion
    if (insertStatements.length > 0) {
      await db.batch(insertStatements);
    }

    invalidateBalanceCache();
    await this.logAudit('database', 'all', 'RESTORE', { snapshotId, diff: diffSummary });

    return {
      success: true,
      snapshotId,
      diff: diffSummary
    };
  }

  async resetDatabase(keepUsers = true) {
    this.checkAdmin();
    const db = await this.getDb();

    // Preserve the current users
    const currentUsers = keepUsers
      ? (await db.prepare(`SELECT * FROM users`).all()).results || []
      : (await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(this.userId).all()).results || [];

    // Clear tables
    await db.batch([
      db.prepare(`DELETE FROM transaction_splits`),
      db.prepare(`DELETE FROM asnaf_records`),
      db.prepare(`DELETE FROM transactions`),
      db.prepare(`DELETE FROM donors`),
      db.prepare(`DELETE FROM funds`),
      db.prepare(`DELETE FROM budgets`),
      db.prepare(`DELETE FROM notifications`),
      db.prepare(`DELETE FROM users`)
    ]);

    // Restore users
    const userInserts = currentUsers.map(u =>
      db.prepare(`INSERT INTO users (id, email, name, role, status, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
        u.id, u.email, u.name, u.role, u.status || 'ACTIVE', u.password_hash, u.created_at || new Date().toISOString()
      )
    );

    // Default template funds
    const defaultFunds = [
      { id: "fund-lillah", name: "Lillah", is_restricted: 0, description: "General mosque operations and utility expenses" },
      { id: "fund-zakat", name: "Zakat", is_restricted: 1, description: "Obligatory alms strictly reserved for eligible poor/needy (Asnaf)" },
      { id: "fund-fitrana", name: "Fitrana", is_restricted: 1, description: "Zakat al-Fitr distributed prior to Eid prayer" },
      { id: "fund-sadaqah", name: "Sadaqah Jariyah", is_restricted: 0, description: "Continuous voluntary charity and projects" },
      { id: "fund-building", name: "Building Fund", is_restricted: 0, description: "Mosque expansion, construction, and capital maintenance" },
      { id: "fund-madrasah", name: "Madrasah Fees", is_restricted: 0, description: "Education, books, and Quran classes" },
      { id: "fund-riba", name: "Interest/Riba", is_restricted: 1, description: "Unlawful bank interest to be disposed of without intention of spiritual reward" }
    ];

    const fundInserts = defaultFunds.map(f =>
      db.prepare(`INSERT INTO funds (id, name, is_restricted, description, is_archived, created_at) VALUES (?, ?, ?, ?, 0, datetime('now'))`).bind(
        f.id, f.name, f.is_restricted, f.description
      )
    );

    // Default anonymous donor
    const donorInsert = db.prepare(`
      INSERT INTO donors (id, name, title, first_name, last_name, is_anonymous, gift_aid_eligible, created_at)
      VALUES ('anonymous', 'Anonymous Donor', '', 'Anonymous', 'Donor', 1, 0, datetime('now'))
    `);

    // Reset receipt counter to 1 in organisations
    const resetCounter = db.prepare(`UPDATE organisations SET receipt_counter = 1`);

    await db.batch([...userInserts, ...fundInserts, donorInsert, resetCounter]);

    invalidateBalanceCache();
    await this.logAudit('database', 'clean_reset', 'RESET', { keepUsers });

    return { reset: true };
  }
}


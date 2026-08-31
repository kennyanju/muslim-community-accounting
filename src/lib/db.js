import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { hashPassword, getSafeUser } from './auth.js';
import { validateBackupPayload } from './validation.js';
import { sanitizeText } from './sanitize.js';
import initialDBData from '../data/db.json' with { type: 'json' };

const dbPath = path.join(process.cwd(), 'src/data/db.json');

const DEFAULT_ORGANISATION = initialDBData?.organisation || {
  name: 'Bristol South Muslim Community',
  short_name: 'BSMC',
  tagline: 'Bristol South Mosque & Islamic Centre',
  charity_number: '1234567',
  address: '100 Mosque Road, Bristol, BS3 1AB',
  email: 'finance@bsmc.org.uk',
  phone: '0117 000 0000',
  currency_symbol: '£',
  country: 'United Kingdom'
};

const ALLOWED_ORG_FIELDS = [
  'name', 'short_name', 'tagline', 'charity_number', 'address', 'email', 'phone', 'currency_symbol', 'country'
];

export const DISPLAY_SAFE_ORG_FIELDS = [
  'name', 'short_name', 'tagline', 'currency_symbol'
];

let inMemoryDB = JSON.parse(JSON.stringify(initialDBData));

// Helper to read database with filesystem and serverless in-memory fallback
export function readDB() {
  try {
    if (typeof fs !== 'undefined' && typeof fs.readFileSync === 'function') {
      const raw = fs.readFileSync(dbPath, 'utf8');
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.users) && data.users.length > 0) {
        inMemoryDB = data;
        return data;
      }
    }
  } catch (err) {
    // In serverless / edge runtime where fs is not mapped to physical file, use bundled inMemoryDB
  }

  // Ensure default structures exist
  if (!inMemoryDB.users || inMemoryDB.users.length === 0) {
    inMemoryDB = JSON.parse(JSON.stringify(initialDBData));
  }

  return inMemoryDB;
}

// Helper to extract persisted organisation profile from request cookies / headers with field whitelisting (M4)
export function getOrganisationFromRequest(request) {
  let cookieVal = null;
  
  if (request) {
    if (typeof request.cookies?.get === 'function') {
      const c = request.cookies.get('masjid_org_pref');
      if (c?.value) cookieVal = c.value;
    }
    
    if (!cookieVal && typeof request.headers?.get === 'function') {
      const rawCookie = request.headers.get('cookie') || '';
      const match = rawCookie.match(/(?:^|;\s*)masjid_org_pref=([^;]+)/);
      if (match) {
        cookieVal = match[1];
      }
    }
  }

  const db = readDB();

  if (cookieVal) {
    try {
      const decoded = JSON.parse(decodeURIComponent(cookieVal));
      if (decoded && typeof decoded === 'object' && decoded.name) {
        // Whitelist only display-safe fields to prevent PII exposure in non-httpOnly cookies
        const sanitized = {};
        DISPLAY_SAFE_ORG_FIELDS.forEach(field => {
          if (decoded[field] !== undefined && typeof decoded[field] === 'string') {
            sanitized[field] = decoded[field].trim();
          }
        });

        db.organisation = {
          ...DEFAULT_ORGANISATION,
          ...(db.organisation || {}),
          ...sanitized
        };
        inMemoryDB.organisation = db.organisation;
        return db.organisation;
      }
    } catch (e) {
      // Ignore cookie parse error
    }
  }

  return db.organisation || DEFAULT_ORGANISATION;
}

// Helper to write database safely with in-memory caching and atomic file rename (M1)
export function writeDB(data) {
  inMemoryDB = data;
  try {
    if (typeof fs !== 'undefined' && typeof fs.writeFileSync === 'function') {
      const tempPath = `${dbPath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 6)}`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tempPath, dbPath);
    }
    return true;
  } catch (err) {
    // Graceful fallback for serverless
    return true;
  }
}

// Core DB operations mirroring PostgreSQL triggers, ACID operations, and audit rules
export class DatabaseController {
  constructor(userRole = 'ADMIN', userId = 'user-sec-1') {
    this.userRole = userRole; // ADMIN, REVIEWER, AUDITOR
    this.userId = userId;
  }

  // Check RBAC permissions for writing
  checkAdmin() {
    if (this.userRole !== 'ADMIN') {
      throw new Error("403 Forbidden: Only the Financial Secretary (ADMIN) has permissions to alter financial records.");
    }
  }

  // Helper for denormalized audit logging (L4)
  logAudit(table_name, record_id, action, db) {
    const user = (db.users || []).find(u => u.id === this.userId);
    db.audit_logs = db.audit_logs || [];
    db.audit_logs.unshift({
      id: `log-${crypto.randomUUID().substring(0, 8)}`,
      table_name,
      record_id,
      action,
      user_id: this.userId,
      user_email: user ? user.email : this.userId,
      user_name: user ? user.name : (user?.email?.split('@')[0] || this.userId),
      timestamp: new Date().toISOString()
    });
  }

  // -------------------------------------------------------------
  // ORGANISATION SETTINGS
  // -------------------------------------------------------------
  getOrganisation() {
    const db = readDB();
    return db.organisation || DEFAULT_ORGANISATION;
  }

  updateOrganisation(newOrgData) {
    this.checkAdmin();
    const db = readDB();
    
    // Sanitize incoming fields against XSS
    const sanitized = {};
    ALLOWED_ORG_FIELDS.forEach(field => {
      if (newOrgData[field] !== undefined && typeof newOrgData[field] === 'string') {
        sanitized[field] = sanitizeText(newOrgData[field]);
      }
    });

    db.organisation = {
      ...DEFAULT_ORGANISATION,
      ...(db.organisation || {}),
      ...sanitized
    };

    this.logAudit('organisation', 'settings', 'UPDATE', db);

    writeDB(db);
    return db.organisation;
  }

  // -------------------------------------------------------------
  // FUND MANAGEMENT
  // -------------------------------------------------------------
  getFunds() {
    const db = readDB();
    return db.funds;
  }

  createFund({ name, is_restricted, description = '' }) {
    this.checkAdmin();
    if (!name || !name.trim()) throw new Error("Fund name is required.");

    const sanitizedName = sanitizeText(name);
    const sanitizedDesc = sanitizeText(description);

    const db = readDB();
    const existing = db.funds.find(f => f.name.toLowerCase() === sanitizedName.toLowerCase());
    if (existing) {
      throw new Error(`A fund named "${sanitizedName}" already exists.`);
    }

    const fundId = `fund-${sanitizedName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')}-${crypto.randomUUID().substring(0, 4)}`;
    const newFund = {
      id: fundId,
      name: sanitizedName,
      is_restricted: !!is_restricted,
      description: sanitizedDesc,
      is_archived: false,
      created_at: new Date().toISOString()
    };

    db.funds.push(newFund);
    this.logAudit('funds', fundId, 'INSERT', db);

    writeDB(db);
    return newFund;
  }

  updateFund(id, { name, is_restricted, is_archived, description }) {
    this.checkAdmin();
    const db = readDB();
    const fund = db.funds.find(f => f.id === id);
    if (!fund) throw new Error("Fund not found");

    // Protect core Shariah-specific funds from dangerous reclassification
    if (fund.name === 'Interest/Riba' && is_restricted === false) {
      throw new Error("The Interest/Riba fund must remain classified as Restricted.");
    }
    if ((fund.name === 'Zakat' || fund.name === 'Fitrana') && is_restricted === false) {
      throw new Error("Zakat and Fitrana funds must remain classified as Restricted under Shariah compliance rules.");
    }

    // M2: Check non-zero balance before archiving
    if (is_archived === true) {
      const balances = this.getBalances();
      const fundBalance = balances.find(b => b.fundId === id);
      if (fundBalance && Math.abs(fundBalance.balance) > 0.001) {
        throw new Error(`Cannot archive fund "${fund.name}" with an active balance of £${fundBalance.balance.toFixed(2)}. Please disburse or reallocate remaining funds first.`);
      }
    }

    if (name && name.trim()) fund.name = sanitizeText(name);
    if (is_restricted !== undefined) fund.is_restricted = !!is_restricted;
    if (is_archived !== undefined) fund.is_archived = !!is_archived;
    if (description !== undefined) fund.description = sanitizeText(description);

    this.logAudit('funds', id, 'UPDATE', db);

    writeDB(db);
    return fund;
  }

  // -------------------------------------------------------------
  // USER MANAGEMENT
  // -------------------------------------------------------------
  getUsers() {
    const db = readDB();
    // Return safe users without exposing password hashes
    return (db.users || []).map(u => getSafeUser(u)).filter(Boolean);
  }

  createUser({ email, password, role, name }) {
    this.checkAdmin();
    if (!email || !email.trim()) throw new Error("User email is required.");
    if (!password || password.length < 6) throw new Error("Password must be at least 6 characters.");
    if (!['ADMIN', 'REVIEWER', 'AUDITOR'].includes(role)) throw new Error("Invalid role specified.");

    const db = readDB();
    const existing = db.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
    if (existing) throw new Error(`User with email "${email}" already exists.`);

    const userId = `user-${role.substring(0, 3).toLowerCase()}-${crypto.randomUUID().substring(0, 6)}`;
    const newUser = {
      id: userId,
      email: email.trim().toLowerCase(),
      name: (name && name.trim()) || email.split('@')[0],
      role,
      status: 'ACTIVE',
      password_hash: hashPassword(password),
      created_at: new Date().toISOString()
    };

    db.users.push(newUser);
    this.logAudit('users', userId, 'INSERT', db);

    writeDB(db);
    return getSafeUser(newUser);
  }

  updateUser(id, { name, role, status, password }) {
    this.checkAdmin();
    const db = readDB();
    const user = db.users.find(u => u.id === id);
    if (!user) throw new Error("User not found");

    // C2: Prevent demoting or deactivating the last active Admin, and prevent self-demotion
    const activeAdmins = db.users.filter(u => u.role === 'ADMIN' && u.status === 'ACTIVE');
    const isTargetActiveAdmin = user.role === 'ADMIN' && user.status === 'ACTIVE';
    const willLoseAdmin = (role && role !== 'ADMIN') || (status && status !== 'ACTIVE');

    if (isTargetActiveAdmin && willLoseAdmin) {
      if (activeAdmins.length <= 1) {
        throw new Error("Cannot demote or deactivate the last remaining active Administrator.");
      }
      if (this.userId === id) {
        throw new Error("Administrators cannot demote or deactivate their own active account.");
      }
    }

    if (name) user.name = name.trim();
    if (role && ['ADMIN', 'REVIEWER', 'AUDITOR'].includes(role)) user.role = role;
    if (status && ['ACTIVE', 'INACTIVE'].includes(status)) user.status = status;
    if (password && password.trim()) {
      if (password.length < 6) throw new Error("Password must be at least 6 characters.");
      user.password_hash = hashPassword(password);
    }

    this.logAudit('users', id, 'UPDATE', db);

    writeDB(db);
    return getSafeUser(user);
  }

  // -------------------------------------------------------------
  // FUND BALANCES VIEW (Optimized Single-Pass In-Memory Index Map: O(N + M))
  // -------------------------------------------------------------
  getBalances() {
    const db = readDB();
    const balancesMap = {};
    
    // Initialize fund balances to 0 in O(F)
    (db.funds || []).forEach(f => {
      balancesMap[f.id] = {
        fundId: f.id,
        fundName: f.name,
        isRestricted: f.is_restricted,
        isArchived: !!f.is_archived,
        balance: 0
      };
    });

    // Build O(1) index map of active transactions and their direction in O(N)
    const activeTxDirectionMap = new Map();
    (db.transactions || []).forEach(tx => {
      if (tx.status !== 'VOIDED' && tx.status !== 'FAILED') {
        activeTxDirectionMap.set(tx.id, tx.type === 'INCOME');
      }
    });

    // Single-pass accumulation over splits in O(M)
    (db.transaction_splits || []).forEach(split => {
      if (split.is_voided) return;
      const isIncome = activeTxDirectionMap.get(split.transaction_id);
      if (isIncome === undefined) return; // Transaction is voided or not active
      
      const fundBalance = balancesMap[split.fund_id];
      if (fundBalance) {
        const amt = parseFloat(split.amount) || 0;
        fundBalance.balance += isIncome ? amt : -amt;
      }
    });

    return Object.values(balancesMap);
  }

  // -------------------------------------------------------------
  // TRANSACTIONS
  // -------------------------------------------------------------
  createTransaction(payload) {
    this.checkAdmin();
    
    const db = readDB();
    const { 
      type, 
      status, 
      method, 
      totalAmount, 
      date, 
      donorId, 
      receiptUrl, 
      reference_note, 
      category, 
      splits, 
      giftAid, 
      notes 
    } = payload;
    
    if (!splits || !Array.isArray(splits) || splits.length === 0) {
      throw new Error("At least one fund split allocation is required.");
    }

    // H6: Precise integer cent arithmetic validation
    const splitTotalCents = splits.reduce((sum, split) => sum + Math.round(parseFloat(split.amount || 0) * 100), 0);
    const totalCents = Math.round(parseFloat(totalAmount || 0) * 100);

    if (splitTotalCents !== totalCents) {
      throw new Error(`Splits total (£${(splitTotalCents / 100).toFixed(2)}) does not match transaction total (£${(totalCents / 100).toFixed(2)})`);
    }

    // H1: Strict Shariah Compliance Rule (Restricted Funds Zakat / Fitrana can ONLY be spent on Charitable Payout)
    if (type === 'EXPENSE') {
      splits.forEach(split => {
        const fund = db.funds.find(f => f.id === split.fund_id);
        if (fund && fund.is_restricted && (fund.name === 'Zakat' || fund.name === 'Fitrana')) {
          if (category !== 'Charitable Payout') {
            throw new Error(`Strict Compliance Violation: Restricted funds (Zakat/Fitrana) can only be disbursed under the 'Charitable Payout' category to eligible beneficiaries (Asnaf). Found category: '${category}'.`);
          }
          if (!notes || !notes.trim()) {
            throw new Error("Zakat and Fitrana disbursements require detailed beneficiary (Asnaf) notes for auditing purposes.");
          }
        }
      });
    }

    // 2. Gift Aid Constraint (Rule 3)
    if (type === 'INCOME' && giftAid) {
      const donor = db.donors.find(d => d.id === donorId);
      if (!donor || !donor.gift_aid_eligible || !donor.address_line_1 || !donor.postcode) {
        throw new Error("Gift Aid can only be claimed if the donor profile has a signed declaration and a valid UK address.");
      }
    }

    // 3. Force interest (Riba) category to Interest/Riba fund (Rule 4)
    let finalSplits = [...splits];
    if (type === 'INCOME' && (reference_note === 'Interest' || category === 'Interest')) {
      const ribaFund = db.funds.find(f => f.name === 'Interest/Riba');
      if (ribaFund) {
        finalSplits = [{ fund_id: ribaFund.id, amount: (totalCents / 100) }];
      }
    }

    // C4 & H4: Atomic receipt number generation for Income transactions
    let receiptNum = '';
    if (type === 'INCOME') {
      const orgShort = (db.organisation?.short_name || 'MASJID').replace(/[^a-zA-Z0-9]/g, '') || 'MASJID';
      const counter = db.receipt_counter || 1;
      const txYear = new Date(date || Date.now()).getFullYear();
      receiptNum = `${orgShort}-${txYear}-${String(counter).padStart(4, '0')}`;
      db.receipt_counter = counter + 1;
    }

    // Generate Transaction ID
    const txId = `tx-${crypto.randomUUID().substring(0, 8)}`;
    
    const newTx = {
      id: txId,
      type: type.toUpperCase(),
      status: status || (method === 'CASH' ? 'PENDING' : 'BANKED'),
      method: (method || 'CASH').toUpperCase().replace(/\s+/g, '_'),
      total_amount: (totalCents / 100),
      transaction_date: date,
      donor_id: donorId || 'anonymous',
      receipt_url: receiptUrl || '',
      receipt_number: receiptNum,
      reference_note: sanitizeText(reference_note || 'Donation'),
      category: category || (type === 'INCOME' ? 'Donation' : 'Other'),
      created_by: this.userId,
      reconciled: false,
      notes: sanitizeText(notes || ''),
      giftAid: type === 'INCOME' ? !!giftAid : false
    };

    db.transactions.unshift(newTx);

    // Insert splits
    finalSplits.forEach(s => {
      db.transaction_splits.push({
        id: `split-${crypto.randomUUID().substring(0, 8)}`,
        transaction_id: txId,
        fund_id: s.fund_id,
        amount: parseFloat(s.amount),
        is_voided: false
      });
    });

    this.logAudit('transactions', txId, 'INSERT', db);

    writeDB(db);
    return txId;
  }

  // Void Transaction without destroying original reference_note (H3)
  voidTransaction(id, reason) {
    this.checkAdmin();
    if (!reason || !reason.trim()) {
      throw new Error("Void reason is mandatory.");
    }
    
    const db = readDB();
    const tx = db.transactions.find(t => t.id === id);
    if (!tx) {
      throw new Error(`Transaction ID ${id} not found.`);
    }

    if (tx.reconciled) {
      throw new Error("Cannot void a reconciled transaction. It is permanently locked.");
    }

    tx.status = 'VOIDED';
    tx.void_reason = sanitizeText(reason);
    tx.voided_at = new Date().toISOString();
    tx.voided_by = this.userId;

    // H3: Explicitly mark all splits as voided
    db.transaction_splits.forEach(s => {
      if (s.transaction_id === id) {
        s.is_voided = true;
        s.voided_at = tx.voided_at;
      }
    });

    this.logAudit('transactions', id, 'VOID', db);

    writeDB(db);
    return true;
  }

  // Bank Deposit cash collection (H5)
  depositCash(id) {
    this.checkAdmin();
    
    const db = readDB();
    const tx = db.transactions.find(t => t.id === id);
    if (!tx) throw new Error("Transaction not found");
    if (tx.reconciled) throw new Error("Cannot bank a transaction that is already reconciled and permanently locked.");
    if (tx.status !== 'PENDING') throw new Error("Only pending Cash on Hand can be banked.");
    
    tx.status = 'BANKED';
    this.logAudit('transactions', id, 'UPDATE', db);
    
    writeDB(db);
    return true;
  }

  // Reconcile/Lock transaction
  reconcileTransaction(id) {
    this.checkAdmin();
    
    const db = readDB();
    const tx = db.transactions.find(t => t.id === id);
    if (!tx) throw new Error("Transaction not found");
    
    tx.reconciled = true;
    if (tx.status === 'PENDING') tx.status = 'BANKED';
    
    this.logAudit('transactions', id, 'UPDATE', db);
    
    writeDB(db);
    return true;
  }

  // -------------------------------------------------------------
  // DONORS (M6)
  // -------------------------------------------------------------
  createDonor({ name, email, address, address_line_1, address_line_2, city, postcode, giftAidEligible }) {
    this.checkAdmin();
    if (!name || !name.trim()) throw new Error("Donor name is required.");
    
    const db = readDB();
    
    let line1 = address_line_1 || '';
    let pcode = postcode || '';
    let donorCity = city || '';

    // Legacy address parser if single string is provided
    if (!line1 && address && address.trim()) {
      const parts = address.split(',').map(p => p.trim());
      line1 = parts[0] || '';
      pcode = parts.length > 1 ? parts[parts.length - 1] : '';
      if (parts.length > 2) donorCity = parts[parts.length - 2];
    }

    if (giftAidEligible) {
      if (!line1 || !line1.trim()) {
        throw new Error("Address line 1 is required for Gift Aid eligible donors.");
      }
      if (!pcode || !pcode.trim()) {
        throw new Error("Postcode is required for Gift Aid eligible donors.");
      }
    }
    
    const dId = `don-${crypto.randomUUID().substring(0, 8)}`;
    const newDonor = {
      id: dId,
      name: sanitizeText(name),
      email: (email || '').trim().toLowerCase(),
      is_anonymous: false,
      gift_aid_eligible: !!giftAidEligible,
      address_line_1: sanitizeText(line1),
      address_line_2: sanitizeText(address_line_2 || ''),
      city: sanitizeText(donorCity),
      postcode: pcode.trim().toUpperCase(),
      created_at: new Date().toISOString()
    };

    db.donors.push(newDonor);
    this.logAudit('donors', dId, 'INSERT', db);
    
    writeDB(db);
    return dId;
  }

  // -------------------------------------------------------------
  // BACKUP & RESTORE (C3)
  // -------------------------------------------------------------
  exportBackup() {
    this.checkAdmin();
    const db = readDB();
    // C3: Strip raw password hashes from export to protect credentials
    const safeUsers = (db.users || []).map(({ password_hash, ...u }) => u);
    return {
      ...db,
      users: safeUsers
    };
  }

  restoreBackup(backupData) {
    this.checkAdmin();
    // Deep schema validation before restore
    validateBackupPayload(backupData);

    const currentDb = readDB();

    // Preserve current active credentials when merging users from backup
    const mergedUsers = (backupData.users || []).map(bu => {
      const existing = currentDb.users.find(u => u.id === bu.id || u.email.toLowerCase() === bu.email.toLowerCase());
      return {
        ...bu,
        password_hash: existing ? existing.password_hash : hashPassword('ChangeMe123!')
      };
    });

    // Ensure acting admin account is never deleted during restore
    if (!mergedUsers.some(u => u.id === this.userId)) {
      const currentAdmin = currentDb.users.find(u => u.id === this.userId);
      if (currentAdmin) mergedUsers.push(currentAdmin);
    }

    const restoredDb = {
      ...backupData,
      users: mergedUsers.length > 0 ? mergedUsers : currentDb.users,
      audit_logs: Array.isArray(backupData.audit_logs) ? backupData.audit_logs : []
    };

    writeDB(restoredDb);

    const db = readDB();
    this.logAudit('database', 'full_restore', 'RESTORE', db);
    writeDB(db);
    return true;
  }

  // Reset database to clean template (drops sample transactions, splits, donors)
  resetDatabase(keepUsers = true) {
    this.checkAdmin();
    const db = readDB();
    
    const freshDb = {
      organisation: db.organisation || DEFAULT_ORGANISATION,
      users: keepUsers ? db.users : db.users.filter(u => u.id === this.userId),
      funds: [
        { id: "fund-lillah", name: "Lillah", is_restricted: false, description: "General mosque operations and utility expenses", is_archived: false },
        { id: "fund-zakat", name: "Zakat", is_restricted: true, description: "Obligatory alms strictly reserved for eligible poor/needy (Asnaf)", is_archived: false },
        { id: "fund-fitrana", name: "Fitrana", is_restricted: true, description: "Zakat al-Fitr distributed prior to Eid prayer", is_archived: false },
        { id: "fund-sadaqah", name: "Sadaqah Jariyah", is_restricted: false, description: "Continuous voluntary charity and projects", is_archived: false },
        { id: "fund-building", name: "Building Fund", is_restricted: false, description: "Mosque expansion, construction, and capital maintenance", is_archived: false },
        { id: "fund-madrasah", name: "Madrasah Fees", is_restricted: false, description: "Education, books, and Quran classes", is_archived: false },
        { id: "fund-riba", name: "Interest/Riba", is_restricted: true, description: "Unlawful bank interest to be disposed of without intention of spiritual reward", is_archived: false }
      ],
      donors: [
        { id: "anonymous", name: "Anonymous Donor", email: "", is_anonymous: true, gift_aid_eligible: false, address_line_1: "", address_line_2: "", city: "", postcode: "" }
      ],
      transactions: [],
      transaction_splits: [],
      audit_logs: [],
      receipt_counter: db.receipt_counter || 1
    };

    this.logAudit('database', 'clean_reset', 'RESET', freshDb);

    writeDB(freshDb);
    return freshDb;
  }

  // Next receipt number
  getNextReceiptNumber(orgShortName = null) {
    const db = readDB();
    const orgShort = orgShortName || db.organisation?.short_name || 'MASJID';
    const counter = db.receipt_counter || 1;
    const year = new Date().getFullYear();
    const formattedNum = `${orgShort}-${year}-${String(counter).padStart(4, '0')}`;
    db.receipt_counter = counter + 1;
    writeDB(db);
    return formattedNum;
  }
}

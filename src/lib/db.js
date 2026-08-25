import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { hashPassword } from './auth.js';
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

// Helper to extract persisted organisation profile from request cookies / headers
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
        db.organisation = {
          ...DEFAULT_ORGANISATION,
          ...(db.organisation || {}),
          ...decoded
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

// Helper to write database safely with in-memory caching and optional file sync
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
    
    db.organisation = {
      ...DEFAULT_ORGANISATION,
      ...(db.organisation || {}),
      ...newOrgData
    };

    db.audit_logs.unshift({
      id: `log-${crypto.randomUUID().substring(0, 8)}`,
      table_name: 'organisation',
      record_id: 'settings',
      action: 'UPDATE',
      user_id: this.userId,
      timestamp: new Date().toISOString()
    });

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

    const db = readDB();
    const existing = db.funds.find(f => f.name.toLowerCase() === name.trim().toLowerCase());
    if (existing) {
      throw new Error(`A fund named "${name}" already exists.`);
    }

    const fundId = `fund-${name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-')}-${crypto.randomUUID().substring(0, 4)}`;
    const newFund = {
      id: fundId,
      name: name.trim(),
      is_restricted: !!is_restricted,
      description: description.trim(),
      is_archived: false,
      created_at: new Date().toISOString()
    };

    db.funds.push(newFund);

    db.audit_logs.unshift({
      id: `log-${crypto.randomUUID().substring(0, 8)}`,
      table_name: 'funds',
      record_id: fundId,
      action: 'INSERT',
      user_id: this.userId,
      timestamp: new Date().toISOString()
    });

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

    if (name && name.trim()) fund.name = name.trim();
    if (is_restricted !== undefined) fund.is_restricted = !!is_restricted;
    if (is_archived !== undefined) fund.is_archived = !!is_archived;
    if (description !== undefined) fund.description = description.trim();

    db.audit_logs.unshift({
      id: `log-${crypto.randomUUID().substring(0, 8)}`,
      table_name: 'funds',
      record_id: id,
      action: 'UPDATE',
      user_id: this.userId,
      timestamp: new Date().toISOString()
    });

    writeDB(db);
    return fund;
  }

  // -------------------------------------------------------------
  // USER MANAGEMENT
  // -------------------------------------------------------------
  getUsers() {
    const db = readDB();
    // Return users without exposing password hashes
    return db.users.map(({ password_hash, ...rest }) => rest);
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

    db.audit_logs.unshift({
      id: `log-${crypto.randomUUID().substring(0, 8)}`,
      table_name: 'users',
      record_id: userId,
      action: 'INSERT',
      user_id: this.userId,
      timestamp: new Date().toISOString()
    });

    writeDB(db);
    const { password_hash, ...safeUser } = newUser;
    return safeUser;
  }

  updateUser(id, { name, role, status, password }) {
    this.checkAdmin();
    const db = readDB();
    const user = db.users.find(u => u.id === id);
    if (!user) throw new Error("User not found");

    if (name) user.name = name.trim();
    if (role && ['ADMIN', 'REVIEWER', 'AUDITOR'].includes(role)) user.role = role;
    if (status && ['ACTIVE', 'INACTIVE'].includes(status)) user.status = status;
    if (password && password.trim()) {
      if (password.length < 6) throw new Error("Password must be at least 6 characters.");
      user.password_hash = hashPassword(password);
    }

    db.audit_logs.unshift({
      id: `log-${crypto.randomUUID().substring(0, 8)}`,
      table_name: 'users',
      record_id: id,
      action: 'UPDATE',
      user_id: this.userId,
      timestamp: new Date().toISOString()
    });

    writeDB(db);
    const { password_hash, ...safeUser } = user;
    return safeUser;
  }

  // -------------------------------------------------------------
  // FUND BALANCES VIEW
  // -------------------------------------------------------------
  getBalances() {
    const db = readDB();
    const balancesMap = {};
    
    // Initialize fund balances to 0
    db.funds.forEach(f => {
      balancesMap[f.id] = {
        fundId: f.id,
        fundName: f.name,
        isRestricted: f.is_restricted,
        isArchived: !!f.is_archived,
        balance: 0
      };
    });

    // Sum up splits of active transactions
    db.transactions.forEach(tx => {
      if (tx.status === 'VOIDED' || tx.status === 'FAILED') return;
      
      const isIncome = tx.type === 'INCOME';
      const splits = db.transaction_splits.filter(s => s.transaction_id === tx.id);
      
      splits.forEach(split => {
        if (balancesMap[split.fund_id]) {
          const change = isIncome ? parseFloat(split.amount) : -parseFloat(split.amount);
          balancesMap[split.fund_id].balance += change;
        }
      });
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
    
    const splitTotal = splits.reduce((sum, split) => sum + parseFloat(split.amount), 0);
    if (Math.abs(splitTotal - parseFloat(totalAmount)) > 0.01) {
      throw new Error(`Splits total (${splitTotal.toFixed(2)}) does not match transaction total (${parseFloat(totalAmount).toFixed(2)})`);
    }

    // 1. Database Trigger: check_restricted_fund_usage() (Rule 1)
    if (type === 'EXPENSE') {
      const isOpExpense = (
        (reference_note && (
          reference_note.toLowerCase().includes('utility') || 
          reference_note.toLowerCase().includes('maintenance') || 
          reference_note.toLowerCase().includes('bill') ||
          reference_note.toLowerCase().includes('salary')
        )) ||
        (category && (
          category.toLowerCase().includes('utilities') ||
          category.toLowerCase().includes('salaries') ||
          category.toLowerCase().includes('maintenance') ||
          category.toLowerCase().includes('office')
        ))
      );
      
      splits.forEach(split => {
        const fund = db.funds.find(f => f.id === split.fund_id);
        if (fund && fund.is_restricted && (fund.name === 'Zakat' || fund.name === 'Fitrana')) {
          if (isOpExpense) {
            throw new Error(`Strict Compliance Violation: Cannot use restricted funds (Zakat/Fitrana) for operational expenses (${reference_note || category}).`);
          }
        }
      });

      // Ensure notes exist for Zakat payouts
      splits.forEach(split => {
        const fund = db.funds.find(f => f.id === split.fund_id);
        if (fund && fund.name === 'Zakat' && (!notes || !notes.trim())) {
          throw new Error("Zakat disbursements require detailed beneficiary (Asnaf) notes for auditing purposes.");
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
        finalSplits = [{ fund_id: ribaFund.id, amount: parseFloat(totalAmount) }];
      }
    }

    // Generate Transaction ID
    const txId = `tx-${crypto.randomUUID().substring(0, 8)}`;
    
    const newTx = {
      id: txId,
      type: type.toUpperCase(),
      status: status || (method === 'CASH' ? 'PENDING' : 'BANKED'),
      method,
      total_amount: parseFloat(totalAmount),
      transaction_date: date,
      donor_id: donorId || 'anonymous',
      receipt_url: receiptUrl || '',
      reference_note: reference_note || 'Donation',
      category: category || (type === 'INCOME' ? 'Donation' : 'Other'),
      created_by: this.userId,
      reconciled: false,
      notes: notes || '',
      giftAid: type === 'INCOME' ? !!giftAid : false
    };

    db.transactions.unshift(newTx);

    // Insert splits
    finalSplits.forEach(s => {
      db.transaction_splits.push({
        id: `split-${crypto.randomUUID().substring(0, 8)}`,
        transaction_id: txId,
        fund_id: s.fund_id,
        amount: parseFloat(s.amount)
      });
    });

    // Insert to Audit Logs
    db.audit_logs.unshift({
      id: `log-${crypto.randomUUID().substring(0, 8)}`,
      table_name: 'transactions',
      record_id: txId,
      action: 'INSERT',
      user_id: this.userId,
      timestamp: new Date().toISOString()
    });

    writeDB(db);
    return txId;
  }

  // Void Transaction without destroying original reference_note
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
    tx.void_reason = reason.trim();
    tx.voided_at = new Date().toISOString();
    tx.voided_by = this.userId;

    db.audit_logs.unshift({
      id: `log-${crypto.randomUUID().substring(0, 8)}`,
      table_name: 'transactions',
      record_id: id,
      action: 'VOID',
      user_id: this.userId,
      timestamp: new Date().toISOString()
    });

    writeDB(db);
    return true;
  }

  // Bank Deposit cash collection
  depositCash(id) {
    this.checkAdmin();
    
    const db = readDB();
    const tx = db.transactions.find(t => t.id === id);
    if (!tx) throw new Error("Transaction not found");
    if (tx.status !== 'PENDING') throw new Error("Only pending Cash on Hand can be banked.");
    
    tx.status = 'BANKED';
    
    db.audit_logs.unshift({
      id: `log-${crypto.randomUUID().substring(0, 8)}`,
      table_name: 'transactions',
      record_id: id,
      action: 'UPDATE',
      user_id: this.userId,
      timestamp: new Date().toISOString()
    });
    
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
    
    db.audit_logs.unshift({
      id: `log-${crypto.randomUUID().substring(0, 8)}`,
      table_name: 'transactions',
      record_id: id,
      action: 'UPDATE',
      user_id: this.userId,
      timestamp: new Date().toISOString()
    });
    
    writeDB(db);
    return true;
  }

  // -------------------------------------------------------------
  // DONORS
  // -------------------------------------------------------------
  createDonor({ name, address, address_line_1, address_line_2, city, postcode, giftAidEligible }) {
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
      name: name.trim(),
      is_anonymous: false,
      gift_aid_eligible: !!giftAidEligible,
      address_line_1: line1.trim(),
      address_line_2: (address_line_2 || '').trim(),
      city: donorCity.trim(),
      postcode: pcode.trim().toUpperCase(),
      created_at: new Date().toISOString()
    };

    db.donors.push(newDonor);
    
    db.audit_logs.unshift({
      id: `log-${crypto.randomUUID().substring(0, 8)}`,
      table_name: 'donors',
      record_id: dId,
      action: 'INSERT',
      user_id: this.userId,
      timestamp: new Date().toISOString()
    });
    
    writeDB(db);
    return dId;
  }

  // -------------------------------------------------------------
  // BACKUP & RESTORE
  // -------------------------------------------------------------
  exportBackup() {
    this.checkAdmin();
    const db = readDB();
    return db;
  }

  restoreBackup(backupData) {
    this.checkAdmin();
    if (!backupData || typeof backupData !== 'object') {
      throw new Error("Invalid backup data format.");
    }
    if (!Array.isArray(backupData.funds) || !Array.isArray(backupData.transactions)) {
      throw new Error("Backup file is missing core tables (funds, transactions).");
    }

    writeDB(backupData);

    const db = readDB();
    db.audit_logs.unshift({
      id: `log-${crypto.randomUUID().substring(0, 8)}`,
      table_name: 'database',
      record_id: 'full_restore',
      action: 'RESTORE',
      user_id: this.userId,
      timestamp: new Date().toISOString()
    });
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
        { id: "anonymous", name: "Anonymous Donor", is_anonymous: true, gift_aid_eligible: false, address_line_1: "", address_line_2: "", city: "", postcode: "" }
      ],
      transactions: [],
      transaction_splits: [],
      audit_logs: [
        {
          id: `log-${crypto.randomUUID().substring(0, 8)}`,
          table_name: 'database',
          record_id: 'clean_reset',
          action: 'RESET',
          user_id: this.userId,
          timestamp: new Date().toISOString()
        }
      ],
      receipt_counter: 1
    };

    writeDB(freshDb);
    return freshDb;
  }

  // Next receipt number
  getNextReceiptNumber(orgShortName = 'MASJID') {
    const db = readDB();
    const counter = db.receipt_counter || 1;
    const year = new Date().getFullYear();
    const formattedNum = `${orgShortName}-${year}-${String(counter).padStart(4, '0')}`;
    db.receipt_counter = counter + 1;
    writeDB(db);
    return formattedNum;
  }
}

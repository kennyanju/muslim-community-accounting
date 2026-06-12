import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const dbPath = path.join(process.cwd(), 'src/data/db.json');

// Helper to read database
export function readDB() {
  try {
    const raw = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error("Failed to read JSON db, returning empty state:", err);
    return { users: [], funds: [], donors: [], transactions: [], transaction_splits: [], audit_logs: [] };
  }
}

// Helper to write database
export function writeDB(data) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error("Failed to write to JSON db:", err);
    return false;
  }
}

// Core DB operations mirroring Supabase PostgreSQL Triggers and RPCs
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

  // Get fund balances (SQL View: fund_balances)
  getBalances() {
    const db = readDB();
    const balancesMap = {};
    
    // Initialize fund balances to 0
    db.funds.forEach(f => {
      balancesMap[f.id] = {
        fundId: f.id,
        fundName: f.name,
        isRestricted: f.is_restricted,
        balance: 0
      };
    });

    // Sum up splits of active transactions
    db.transactions.forEach(tx => {
      if (tx.status === 'VOIDED' || tx.status === 'FAILED') return;
      
      const isIncome = tx.type === 'INCOME';
      
      // Get splits for this transaction
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

  // Atomic PostgreSQL Transaction creation (BFF Wrapper for RPC: create_full_transaction)
  createTransaction(payload) {
    this.checkAdmin();
    
    const db = readDB();
    const { type, status, method, totalAmount, date, donorId, receiptUrl, reference_note, splits, giftAid, notes } = payload;
    
    const splitTotal = splits.reduce((sum, split) => sum + parseFloat(split.amount), 0);
    if (Math.abs(splitTotal - parseFloat(totalAmount)) > 0.01) {
      throw new Error(`Splits total (${splitTotal}) does not match transaction total (${totalAmount})`);
    }

    // 1. Database Trigger: check_restricted_fund_usage()
    if (type === 'EXPENSE') {
      const isOpExpense = (
        reference_note.toLowerCase().includes('utility') || 
        reference_note.toLowerCase().includes('maintenance') || 
        reference_note.toLowerCase().includes('salary')
      );
      
      splits.forEach(split => {
        const fund = db.funds.find(f => f.id === split.fund_id);
        if (fund && fund.is_restricted && (fund.name === 'Zakat' || fund.name === 'Fitrana')) {
          if (isOpExpense) {
            throw new Error(`Strict Compliance Violation: Cannot use restricted funds (Zakat/Fitrana) for operational expenses (${reference_note}).`);
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

    // 2. Gift Aid Constraint: Rule 3
    if (type === 'INCOME' && giftAid) {
      const donor = db.donors.find(d => d.id === donorId);
      if (!donor || !donor.gift_aid_eligible || !donor.address_line_1 || !donor.postcode) {
        throw new Error("Gift Aid can only be claimed if the donor profile has a signed declaration and a valid UK address.");
      }
    }

    // 3. Force interest (Riba) category to Interest/Riba fund: Rule 4
    let finalSplits = [...splits];
    if (type === 'INCOME' && reference_note === 'Interest') {
      const ribaFund = db.funds.find(f => f.name === 'Interest/Riba');
      if (ribaFund) {
        finalSplits = [{ fund_id: ribaFund.id, amount: totalAmount }];
      }
    }

    // Generate UUID
    const txId = `tx-${crypto.randomUUID().substring(0, 8)}`;
    
    // Insert parent transaction
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

  // Void Transaction
  voidTransaction(id, reason) {
    this.checkAdmin();
    
    const db = readDB();
    const tx = db.transactions.find(t => t.id === id);
    if (!tx) {
      throw new Error(`Transaction ID ${id} not found.`);
    }

    if (tx.reconciled) {
      throw new Error("Cannot void a reconciled transaction. It is permanently locked.");
    }

    tx.status = 'VOIDED';
    tx.reference_note = `VOIDED: ${reason}`;

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
    if (tx.status === 'PENDING') tx.status = 'BANKED'; // Auto banked
    
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

  // Create Donor profile
  createDonor(name, address, giftAidEligible) {
    this.checkAdmin();
    
    const db = readDB();
    
    let house = "";
    let postcode = "";
    if (giftAidEligible) {
      if (!address || !address.trim()) {
        throw new Error("Address is required for Gift Aid eligible donors.");
      }
      const addressParts = address.split(',');
      house = addressParts[0].trim();
      postcode = addressParts.pop().trim();
      if (!postcode) throw new Error("Postcode is required for Gift Aid eligible donors.");
    }
    
    const dId = `don-${crypto.randomUUID().substring(0, 8)}`;
    db.donors.push({
      id: dId,
      name,
      is_anonymous: false,
      gift_aid_eligible: !!giftAidEligible,
      address_line_1: house || address,
      postcode: postcode || ""
    });
    
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
}

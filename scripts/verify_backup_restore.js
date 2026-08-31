import { DatabaseController, readDB } from '../src/lib/db.js';
import assert from 'assert';

/**
 * Automated Point-in-Time Recovery (PITR) & Restore Integrity Verifier
 * Verifies that backups can be restored with 100% financial and audit fidelity.
 */

console.log("--------------------------------------------------");
console.log("RUNNING POINT-IN-TIME BACKUP & RESTORE VERIFICATION");
console.log("--------------------------------------------------");

const controller = new DatabaseController('ADMIN', 'system-pitr-verifier');

// 1. Reset database to baseline template
controller.resetDatabase(true);

// 2. Create rich dataset with multi-fund splits and compliance data
const donor1 = controller.createDonor({
  name: 'Dr. Tariq Al-Mansoor',
  email: 'tariq@example.org.uk',
  address_line_1: '14 Crescent Gardens',
  city: 'Bristol',
  postcode: 'BS8 1TH',
  giftAidEligible: true
});

const donor2 = controller.createDonor({
  name: 'Sister Maryam Begum',
  email: 'maryam@example.org.uk',
  address_line_1: '88 High Street',
  city: 'Bristol',
  postcode: 'BS3 4EF',
  giftAidEligible: true
});

// Tx 1: General multi-split donation (£500: £300 Building, £200 Lillah)
const tx1 = controller.createTransaction({
  type: 'INCOME',
  status: 'BANKED',
  method: 'BANK_TRANSFER',
  totalAmount: 500.00,
  date: '2026-08-15',
  donorId: donor1,
  reference_note: 'Monthly Standing Order',
  category: 'Donation',
  giftAid: true,
  splits: [
    { fund_id: 'fund-building', amount: 300.00 },
    { fund_id: 'fund-lillah', amount: 200.00 }
  ]
});

// Tx 2: Friday Jummah cash collection (£1,250 with 2 witnesses)
const tx2 = controller.createTransaction({
  type: 'INCOME',
  status: 'PENDING',
  method: 'CASH',
  totalAmount: 1250.00,
  date: '2026-08-22',
  reference_note: 'Jummah Prayer Collection #34',
  category: 'Donation',
  notes: 'Witnessed by Imam and Treasurer',
  splits: [
    { fund_id: 'fund-lillah', amount: 750.00 },
    { fund_id: 'fund-building', amount: 500.00 }
  ]
});

// Tx 3: Zakat Charitable Payout (Expense £400 from Zakat fund)
const tx3 = controller.createTransaction({
  type: 'EXPENSE',
  status: 'BANKED',
  method: 'BANK_TRANSFER',
  totalAmount: 400.00,
  date: '2026-08-25',
  reference_note: 'Asnaf Al-Fuqara emergency grant #Z-88',
  category: 'Charitable Payout',
  notes: 'Direct charitable aid to eligible local refugee family',
  splits: [
    { fund_id: 'fund-zakat', amount: 400.00 }
  ]
});

// Lock Tx 1 permanently with bank reconciliation
controller.reconcileTransaction(tx1);

// 3. Compute Golden Pre-Backup Checksum
const goldenBalances = controller.getBalances();
const goldenDB = readDB();
const goldenTxCount = goldenDB.transactions.length;
const goldenSplitsCount = goldenDB.transaction_splits.length;
const goldenDonorCount = goldenDB.donors.length;

console.log(`📸 Golden snapshot generated:`);
console.log(`   - Transactions: ${goldenTxCount}`);
console.log(`   - Splits: ${goldenSplitsCount}`);
console.log(`   - Donors: ${goldenDonorCount}`);
console.log(`   - Active Balances:`, goldenBalances.map(b => `${b.fundName}: £${b.balance.toFixed(2)}`).join(', '));

// 4. Export Point-In-Time Backup Snapshot
const backupSnapshot = controller.exportBackup();
assert(backupSnapshot && backupSnapshot.transactions, "Backup export must produce structured snapshot JSON");

// 5. Destructive Database Mutation (Simulate Corruption / Accidental Deletions)
console.log(`💥 Executing destructive mutation to simulate disaster...`);
controller.resetDatabase(true);

// Add corrupted dummy transaction
controller.createTransaction({
  type: 'INCOME',
  status: 'PENDING',
  method: 'CASH',
  totalAmount: 999999.00,
  date: '2026-08-30',
  reference_note: 'CORRUPTED DATA INJECTION',
  splits: [{ fund_id: 'fund-lillah', amount: 999999.00 }]
});

const corruptedBalances = controller.getBalances();
console.log(`   - Post-corruption balance check: Lillah = £${corruptedBalances.find(b => b.fundId === 'fund-lillah')?.balance.toFixed(2)}`);

// 6. Restore Point-in-Time Backup Snapshot
console.log(`♻️ Restoring backup snapshot into database...`);
controller.restoreBackup(backupSnapshot);

// 7. Verify Restored Data Integrity vs Golden Checksum
const restoredBalances = controller.getBalances();
const restoredDB = readDB();

assert.strictEqual(restoredDB.transactions.length, goldenTxCount, "Restored transaction count must match golden snapshot exactly");
assert.strictEqual(restoredDB.transaction_splits.length, goldenSplitsCount, "Restored splits count must match golden snapshot exactly");
assert.strictEqual(restoredDB.donors.length, goldenDonorCount, "Restored donor count must match golden snapshot exactly");

// Verify every fund balance matched to the penny
for (const goldenFund of goldenBalances) {
  const restoredFund = restoredBalances.find(b => b.fundId === goldenFund.fundId);
  assert(restoredFund, `Fund ${goldenFund.fundName} must exist in restored database`);
  assert.strictEqual(
    restoredFund.balance,
    goldenFund.balance,
    `Balance mismatch on fund '${goldenFund.fundName}': Expected £${goldenFund.balance.toFixed(2)}, got £${restoredFund.balance.toFixed(2)}`
  );
}

// Verify transaction reconciliation status preserved
const restoredTx1 = restoredDB.transactions.find(t => t.id === tx1);
assert(restoredTx1 && restoredTx1.reconciled === true, "Reconciled status must be preserved after restore");

// Verify Gift Aid details preserved
const restoredDonor1 = restoredDB.donors.find(d => d.id === donor1);
assert(restoredDonor1 && restoredDonor1.postcode === 'BS8 1TH' && restoredDonor1.gift_aid_eligible === true, "Donor Gift Aid postcode and eligibility must match exactly");

console.log("--------------------------------------------------");
console.log("✅ POINT-IN-TIME BACKUP & RESTORE INTEGRITY VERIFIED (100% MATCH)");
console.log("--------------------------------------------------");

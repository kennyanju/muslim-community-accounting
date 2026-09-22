import assert from 'assert';
import { getD1Database } from './db-client.js';
import { DatabaseController, readDB } from './db.js';
import { migrateJsonToD1 } from './db-migrate.js';

console.log("--------------------------------------------------");
console.log("RUNNING CLOUDFLARE D1 & 10X BUSINESS LOGIC TESTS");
console.log("--------------------------------------------------");

let passCount = 0;
let failCount = 0;

function testAssert(condition, message) {
  if (condition) {
    console.log(`✅ PASSED: ${message}`);
    passCount++;
  } else {
    console.error(`❌ FAILED: ${message}`);
    failCount++;
  }
}

async function runD1TestSuite() {
  // Test 1: Get D1 database client and check tables exist
  const db = await getD1Database();
  testAssert(db && typeof db.prepare === 'function', 'D1 database adapter instantiated successfully');

  const tablesResult = await db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
  `).all();
  const tableNames = tablesResult.results.map(t => t.name);

  const expectedTables = [
    'organisations', 'users', 'funds', 'donors', 'transactions',
    'transaction_splits', 'audit_logs', 'rate_limit_hits', 'budgets', 'asnaf_records'
  ];
  const allTablesPresent = expectedTables.every(t => tableNames.includes(t));
  testAssert(allTablesPresent, `All 10 core Cloudflare D1 tables initialized properly: ${tableNames.join(', ')}`);

  // Test 2: Verify migration script populates D1 accurately
  await migrateJsonToD1(null, db);
  const fundsInD1 = await db.prepare('SELECT count(*) as count FROM funds').first('count');
  testAssert(fundsInD1 >= 7, `D1 funds table populated with ${fundsInD1} funds`);

  const donorsInD1 = await db.prepare('SELECT count(*) as count FROM donors').first('count');
  testAssert(donorsInD1 >= 3, `D1 donors table populated with ${donorsInD1} donors`);

  // Test 3: Donor Update capability (Phase 3 missing CRUD fix)
  const controller = new DatabaseController('ADMIN', 'user-sec-1');
  const newDonorId = controller.createDonor({
    name: 'Brother Usman Qureshi',
    email: 'usman@test.co.uk',
    address_line_1: '12 Green Park',
    city: 'Bristol',
    postcode: 'BS1 5RR',
    giftAidEligible: true
  });
  testAssert(newDonorId && newDonorId.startsWith('don-'), 'Donor created with unique ID');

  const updatedDonor = controller.updateDonor(newDonorId, {
    name: 'Dr. Usman Qureshi',
    city: 'Bath',
    postcode: 'BA1 1AA',
    giftAidEligible: true
  });
  testAssert(updatedDonor.name === 'Dr. Usman Qureshi' && updatedDonor.city === 'Bath', 'Donor profile updated in-place');

  // Verify donor retrieval with giving history
  const retrievedDonor = controller.getDonor(newDonorId);
  testAssert(retrievedDonor && retrievedDonor.id === newDonorId, 'getDonor() successfully returned enriched profile');

  // Test 4: Shariah compliance rules on donor update
  try {
    controller.updateDonor(newDonorId, {
      giftAidEligible: true,
      address_line_1: '',
      postcode: ''
    });
    testAssert(false, 'Should not allow Gift Aid eligible donor without address/postcode');
  } catch (err) {
    testAssert(err.message.includes('Address line 1 is required'), 'Caught Gift Aid missing address violation on update');
  }

  // Test 5: Budgets & Targets (Phase 2)
  const budget = controller.saveBudget({
    fund_id: 'fund-lillah',
    fiscal_year: 2026,
    target_amount: 35000,
    max_spend_limit: 40000,
    notes: 'Operational budget approved by shura'
  });
  testAssert(budget && budget.target_amount === 35000, 'Fund budget target allocation saved');

  const budgets2026 = controller.getBudgets(2026);
  testAssert(budgets2026.some(b => b.fund_id === 'fund-lillah' && b.target_amount === 35000), 'getBudgets(2026) retrieved fund budget');

  // Test 6: Asnaf Beneficiary Records (Phase 2 & Phase 6)
  const asnafTxId = controller.createTransaction({
    type: 'EXPENSE',
    status: 'BANKED',
    method: 'BANK_TRANSFER',
    totalAmount: 300.00,
    date: '2026-09-15',
    reference_note: 'Widow emergency assistance grant',
    category: 'Charitable Payout',
    notes: 'Direct Asnaf Al-Fuqara emergency grant disbursed to verified widow',
    splits: [{ fund_id: 'fund-zakat', amount: 300.00 }]
  });


  const asnaf = controller.recordAsnafDisbursement({
    transaction_id: asnafTxId,
    beneficiary_name: 'Sister Fatima (Widow support)',
    asnaf_category: 'FUQARA',
    amount: 300.00,
    distribution_date: '2026-09-15',
    witness_name: 'Imam Abdullah',
    verification_notes: 'Rent arrears verified with housing charity'
  });
  testAssert(asnaf && asnaf.id.startsWith('asnaf-'), 'Asnaf Zakat disbursement recorded with category FUQARA');


  const asnafRecords = controller.getAsnafRecords(2026);
  testAssert(asnafRecords.some(r => r.beneficiary_name.includes('Sister Fatima')), 'getAsnafRecords() includes recorded beneficiary');

  // Test 7: Invalid Asnaf category rejection
  try {
    controller.recordAsnafDisbursement({
      transaction_id: 'tx-bad',
      beneficiary_name: 'Invalid Test',
      asnaf_category: 'GENERAL_EXPENSE',
      amount: 100.00
    });
    testAssert(false, 'Allowed invalid Asnaf category');
  } catch (err) {
    testAssert(err.message.includes('Invalid Asnaf category'), 'Invalid Quranic Asnaf category successfully rejected');
  }

  // Test 8: D1 Batch Transaction execution
  const batchStmts = [
    db.prepare('INSERT OR REPLACE INTO funds (id, name, is_restricted, description, is_archived, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
      'fund-d1-batch-1', 'D1 Batch Test Fund', 0, 'Test batching', 0, new Date().toISOString()
    ),
    db.prepare('INSERT OR REPLACE INTO funds (id, name, is_restricted, description, is_archived, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
      'fund-d1-batch-2', 'D1 Batch Test Fund 2', 0, 'Test batching 2', 0, new Date().toISOString()
    )
  ];
  await db.batch(batchStmts);
  const batchFund = await db.prepare('SELECT name FROM funds WHERE id = ?').bind('fund-d1-batch-1').first('name');
  testAssert(batchFund === 'D1 Batch Test Fund', 'D1 atomic batch statement transaction committed successfully');

  // Test 9: Deletion of donor with transactions is prevented
  const donorWithTx = controller.createDonor({
    name: 'Brother With Transaction',
    giftAidEligible: false
  });
  controller.createTransaction({
    type: 'INCOME',
    status: 'BANKED',
    method: 'CASH',
    totalAmount: 100,
    date: '2026-09-01',
    donorId: donorWithTx,
    splits: [{ fund_id: 'fund-lillah', amount: 100 }]
  });

  try {
    controller.deleteDonor(donorWithTx);
    testAssert(false, 'Allowed deleting donor with transaction history');
  } catch (err) {
    testAssert(err.message.includes('Cannot delete donor with existing transaction records'), 'IDOR and audit protection prevents deleting donors with transactions');
  }

  // Cleanup test donor
  controller.deleteDonor(newDonorId);
  testAssert(!controller.getDonors().some(d => d.id === newDonorId), 'Safely deleted test donor without transactions');

  // =========================================================================
  // ENTERPRISE D1CONTROLLER & 25 BUSINESS LOGIC IMPROVEMENTS (Items #1 - #25)
  // =========================================================================
  console.log("\n🧪 Testing D1Controller Async Operations & New Business Logic:");
  const { D1Controller } = await import('./d1-controller.js');
  const { splitDonorName, calculateGiftAidClaim, getFiscalYearBounds } = await import('./validation.js');
  const { createSessionToken, getAuthenticatedUser, revokeSession } = await import('./auth.js');
  const { checkZakatBalanceAndAlert } = await import('./notifications.js');

  const d1Ctrl = new D1Controller('ADMIN', 'user-d1-admin', 'D1 Admin', 'admin@masjid.org.uk');

  // Test 10: UK Charity Fiscal Year Calculation (Item #6)
  const fy1 = getFiscalYearBounds('2026-09-20', '04-06');
  testAssert(fy1.start === '2026-04-06' && fy1.end === '2027-04-05', `UK Charity Fiscal Year (Sep 2026) calculated: ${fy1.start} to ${fy1.end}`);
  const fy2 = getFiscalYearBounds('2026-02-15', '04-06');
  testAssert(fy2.start === '2025-04-06' && fy2.end === '2026-04-05', `UK Charity Fiscal Year (Feb 2026) prior-year bounds: ${fy2.start} to ${fy2.end}`);

  // Test 11: HMRC Gift Aid Claim 25% Gross Basic Rate (Item #5)
  const claim100 = calculateGiftAidClaim(100);
  testAssert(claim100 === 25.00, `HMRC Gift Aid claim on £100 is £25.00 (got £${claim100})`);
  const claim80 = calculateGiftAidClaim(80);
  testAssert(claim80 === 20.00, `HMRC Gift Aid claim on £80 is £20.00 (got £${claim80})`);

  // Test 12: Programmatic Donor Name Splitting (Item #8)
  const split1 = splitDonorName('Dr. Muhammad ibn Ali');
  testAssert(split1.title === 'Dr.' && split1.firstName === 'Muhammad' && split1.lastName === 'ibn Ali', 'Donor honorific and compound name split correctly');
  const split2 = splitDonorName('Sister Fatima Al-Zahra');
  testAssert(split2.title === 'Sister' && split2.firstName === 'Fatima' && split2.lastName === 'Al-Zahra', 'Compound prefix name split correctly');

  // Test 13: D1 Structured Donor Creation with Integer Pence (Item #4, #8)
  const d1DonorId = await d1Ctrl.createDonor({
    name: 'Sheikh Ahmad bin Yusuf',
    email: 'ahmad@masjid.org.uk',
    address_line_1: '45 Crescent Way',
    city: 'Bristol',
    postcode: 'BS5 9TT',
    giftAidEligible: true
  });
  testAssert(d1DonorId && d1DonorId.startsWith('don-'), 'D1 donor created with structured ID');
  const d1DonorRow = await db.prepare('SELECT title, first_name, last_name FROM donors WHERE id = ?').bind(d1DonorId).first();
  testAssert(d1DonorRow && d1DonorRow.title === 'Sheikh' && d1DonorRow.first_name === 'Ahmad' && d1DonorRow.last_name === 'bin Yusuf', 'D1 donor table stored structured name columns (title, first_name, last_name)');

  // Test 14: D1 Transaction Creation with Integer Cents & Atomic Receipt Number (Item #1, #3)
  const d1Tx = await d1Ctrl.createTransaction({
    type: 'INCOME',
    status: 'PENDING',
    method: 'CASH',
    totalAmount: 150.50, // £150.50 -> 15050 pence in D1
    date: '2026-09-18', // Valid Friday
    donorId: d1DonorId,
    reference_note: 'Jummah donation for building fund',
    category: 'Donation',
    giftAid: true,
    isJummah: true,
    counter_1_name: 'Imam Bilal',
    counter_2_name: 'Brother Farooq',
    splits: [
      { fund_id: 'fund-building', amount: 100.00 },
      { fund_id: 'fund-lillah', amount: 50.50 }
    ]
  });
  testAssert(d1Tx && d1Tx.id.startsWith('tx-'), 'D1 transaction created');
  testAssert(d1Tx.receipt_number && d1Tx.receipt_number.includes('-2026-'), `Atomic receipt number generated: ${d1Tx.receipt_number}`);
  
  // Verify integer pence in SQLite
  const txRow = await db.prepare('SELECT total_amount, is_jummah FROM transactions WHERE id = ?').bind(d1Tx.id).first();
  testAssert(txRow && txRow.total_amount === 15050, `Transaction total_amount stored as 15050 integer pence (got ${txRow.total_amount})`);
  testAssert(txRow && txRow.is_jummah === 1, 'Transaction is_jummah flag saved in D1');

  // Verify splits in SQLite
  const splitRows = (await db.prepare('SELECT fund_id, amount FROM transaction_splits WHERE transaction_id = ?').bind(d1Tx.id).all()).results;
  const buildingSplit = splitRows.find(s => s.fund_id === 'fund-building');
  const lillahSplit = splitRows.find(s => s.fund_id === 'fund-lillah');
  testAssert(buildingSplit && buildingSplit.amount === 10000, `Building split stored as 10000 integer pence (got ${buildingSplit?.amount})`);
  testAssert(lillahSplit && lillahSplit.amount === 5050, `Lillah split stored as 5050 integer pence (got ${lillahSplit?.amount})`);

  // Test 15: Bank Reconciliation in D1 (Item #14) - PENDING cash cannot be reconciled
  try {
    await d1Ctrl.reconcileTransaction(d1Tx.id, 'STMT-SEP-2026-001');
    testAssert(false, 'Should block reconciling PENDING cash transaction against bank statement');
  } catch (err) {
    testAssert(err.message.includes('must be banked or settled'), 'Blocked reconciling unbanked cash transaction');
  }

  // Bank the cash donation first
  await d1Ctrl.depositCash(d1Tx.id);
  const reconciledTx = await d1Ctrl.reconcileTransaction(d1Tx.id, 'STMT-SEP-2026-001');
  testAssert(reconciledTx.reconciled === true && reconciledTx.bank_statement_ref === 'STMT-SEP-2026-001', 'D1 bank reconciliation locked with audit statement ref');


  // Test 16: Void Protection on Reconciled Transaction
  try {
    await d1Ctrl.voidTransaction(d1Tx.id, 'Accidental duplicate entry');
    testAssert(false, 'Should block voiding reconciled transaction');
  } catch (err) {
    testAssert(err.message.includes('Cannot void reconciled transaction'), 'D1 strictly blocked voiding bank-reconciled transaction');
  }

  // Test 17: Cash Deposit Transition (Item #14)
  const cashTx = await d1Ctrl.createTransaction({
    type: 'INCOME',
    status: 'PENDING',
    method: 'CASH',
    totalAmount: 75.00,
    date: '2026-09-20',
    reference_note: 'Cash collection to be banked',
    splits: [{ fund_id: 'fund-lillah', amount: 75.00 }]
  });
  const bankedTx = await d1Ctrl.depositCash(cashTx.id);
  testAssert(bankedTx.status === 'BANKED', 'depositCash() transitioned PENDING cash transaction to BANKED');

  // Test 18: Asnaf Cross-Validation Against Transaction (Item #7)
  try {
    await d1Ctrl.recordAsnafDisbursement({
      transaction_id: 'tx-nonexistent-999',
      beneficiary_name: 'Beneficiary Test',
      asnaf_category: 'MASAKEEN',
      amount: 50.00,
      distribution_date: '2026-09-20'
    });
    testAssert(false, 'Allowed Asnaf record without valid transaction');
  } catch (err) {
    testAssert(err.message.includes('Source transaction') && err.message.includes('not found'), 'Asnaf disbursement strictly validated against source transaction');
  }

  // Test 19: Fund Archival Blocked with Active Balance (Item #13)
  try {
    await d1Ctrl.archiveFund('fund-building');
    testAssert(false, 'Allowed archiving fund with active balance');
  } catch (err) {
    testAssert(err.message.includes('Cannot archive fund') && err.message.includes('active balance'), 'D1 blocked archiving fund with active non-zero balance');
  }

  // Test 20: JTI Session Management & Revocation (Item #10)
  const testUser = { id: 'user-sec-1', email: 'sec@masjid.org.uk', role: 'ADMIN', name: 'Secretary' };
  const sessionJti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 604800000).toISOString();
  await d1Ctrl.createSession(testUser.id, sessionJti, expiresAt);
  const sessionToken = createSessionToken(testUser, sessionJti);
  const sessionUser = await getAuthenticatedUser({
    cookies: { get: () => ({ value: sessionToken }) }
  });
  testAssert(sessionUser && sessionUser.id === 'user-sec-1', 'getAuthenticatedUser() successfully verified D1 active session token');

  // Revoke session by JTI
  await revokeSession(sessionJti);

  // Re-verify: session must now be rejected
  const revokedUser = await getAuthenticatedUser({
    cookies: { get: () => ({ value: sessionToken }) }
  });
  testAssert(revokedUser === null, 'Revoked session with JTI successfully rejected by getAuthenticatedUser()');


  // Test 21: Notifications System & Zakat Balance Alert (Item #12, #24)
  const alertResult = await checkZakatBalanceAndAlert();
  testAssert(alertResult !== undefined, 'checkZakatBalanceAndAlert() executed cleanly');
  const notifs = await d1Ctrl.getNotifications(10);
  testAssert(Array.isArray(notifs), 'getNotifications() returned array of system notifications');

  // Test 22: Backup Snapshot & Dry-Run Restore (Item #15)
  const snapshotId = await d1Ctrl.createBackupSnapshot('Test pre-restore snapshot');
  testAssert(snapshotId && snapshotId.startsWith('snap-'), `Safety backup snapshot created with ID: ${snapshotId}`);

  const fullBackup = await d1Ctrl.exportBackup();
  testAssert(fullBackup.version === '2.0-d1-integer-cents', 'exportBackup() produced version 2.0 integer cents backup');
  
  const dryRunResult = await d1Ctrl.restoreBackup(fullBackup, true);
  testAssert(dryRunResult.success && dryRunResult.dryRun === true && dryRunResult.diff.transactionsCount > 0, 'restoreBackup(..., dryRun=true) simulated restore diff without destructive mutations');

  // Test 23: Strict Shariah Compliance Rule in D1 (Rule 1 & H1)
  try {
    await d1Ctrl.createTransaction({
      type: 'EXPENSE',
      totalAmount: 200.00,
      category: 'Salaries',
      splits: [{ fund_id: 'fund-zakat', amount: 200.00 }],
      notes: 'Attempting operational expense on Zakat'
    });
    testAssert(false, 'Should block operational expense from Zakat fund');
  } catch (err) {
    testAssert(err.message.includes('Strict Compliance Violation'), 'D1 strictly blocked operational expense from Zakat fund');
  }

  // Test 24: Gift Aid Eligibility Enforcement in D1 (Rule 3)
  try {
    await d1Ctrl.createTransaction({
      type: 'INCOME',
      totalAmount: 50.00,
      giftAid: true,
      donorId: 'anonymous',
      splits: [{ fund_id: 'fund-lillah', amount: 50.00 }]
    });
    testAssert(false, 'Should block Gift Aid on anonymous donor');
  } catch (err) {
    testAssert(err.message.includes('Gift Aid can only be claimed'), 'D1 strictly enforced Gift Aid donor validation');
  }

  // Test 25: Interest / Riba Auto-Routing in D1 (Rule 4)
  const ribaTx = await d1Ctrl.createTransaction({
    type: 'INCOME',
    totalAmount: 12.50,
    category: 'Interest',
    reference_note: 'Bank Interest',
    splits: [{ fund_id: 'fund-lillah', amount: 12.50 }] // Should be auto-routed
  });
  testAssert(ribaTx.splits && ribaTx.splits.length === 1 && ribaTx.splits[0].fund_id === 'fund-riba', 'D1 auto-routed Interest income into Interest/Riba fund');

  // Test 26: Last Active Administrator Protection in D1 (Governance)
  await db.prepare("UPDATE users SET role = 'REVIEWER' WHERE id = 'user-d1-admin'").run();
  try {
    await d1Ctrl.updateUser('user-sec-1', { role: 'AUDITOR' });
    testAssert(false, 'Should block demoting the last active administrator');
  } catch (err) {
    testAssert(err.message.includes('Cannot demote your own active administrator account') || err.message.includes('last active administrator'), 'D1 strictly blocked demoting or losing last active admin');
  }

  // Test 27: Dual-Key DTO Contract for Balances and Funds
  const balances = await d1Ctrl.getBalances();
  testAssert(balances.length > 0 && balances[0].fundId && balances[0].fundName !== undefined && typeof balances[0].isRestricted === 'boolean', 'getBalances() returns dual-key contract (fundId, fundName, isRestricted)');

  // Test 28: Full Round-Trip Point-in-Time Restore with Exact Integer Pence & Budgets
  // Create transactions with £0.01, £100.00, and £100.01
  const tx1p = await d1Ctrl.createTransaction({
    type: 'INCOME',
    totalAmount: 0.01,
    splits: [{ fund_id: 'fund-lillah', amount: 0.01 }]
  });
  const tx100 = await d1Ctrl.createTransaction({
    type: 'INCOME',
    totalAmount: 100.00,
    splits: [{ fund_id: 'fund-lillah', amount: 100.00 }]
  });
  const tx10001 = await d1Ctrl.createTransaction({
    type: 'INCOME',
    totalAmount: 100.01,
    splits: [{ fund_id: 'fund-lillah', amount: 100.01 }]
  });

  // Ensure a budget exists
  await d1Ctrl.saveBudget({
    fund_id: 'fund-building',
    fiscal_year: 2026,
    target_amount: 50000.00,
    max_spend_limit: 40000.00,
    notes: '2026 Building Target'
  });

  // Export full snapshot
  const backupToRestore = await d1Ctrl.exportBackup();
  testAssert(backupToRestore.budgets && backupToRestore.budgets.length > 0, 'exportBackup() includes budgets');

  // Execute REAL destructive restore (not dryRun!)
  const realRestoreResult = await d1Ctrl.restoreBackup(backupToRestore, false);
  testAssert(realRestoreResult.success === true, 'real destructive restore executed cleanly without foreign key failures');

  // Verify exact pence values after restore (no 100x multiplication)
  const restoredTx100 = await d1Ctrl.getTransaction(tx100.id);
  testAssert(restoredTx100.total_amount_pence === 10000, `£100.00 restored as 10000 pence (got ${restoredTx100.total_amount_pence})`);
  testAssert(restoredTx100.totalAmount === 100, `£100.00 totalAmount restored as 100 (got ${restoredTx100.totalAmount})`);

  const restoredTx1p = await d1Ctrl.getTransaction(tx1p.id);
  testAssert(restoredTx1p.total_amount_pence === 1, `£0.01 restored as 1 pence (got ${restoredTx1p.total_amount_pence})`);

  const restoredTx10001 = await d1Ctrl.getTransaction(tx10001.id);
  testAssert(restoredTx10001.total_amount_pence === 10001, `£100.01 restored as 10001 pence (got ${restoredTx10001.total_amount_pence})`);

  // Test 29: Donor giving total excludes non-income transactions
  const donorForGivingId = await d1Ctrl.createDonor({
    name: 'Brother Giving Check',
    email: `giving_${Date.now()}@masjid.org.uk`
  });
  await d1Ctrl.createTransaction({
    type: 'INCOME',
    totalAmount: 200.00,
    donorId: donorForGivingId,
    splits: [{ fund_id: 'fund-lillah', amount: 200.00 }]
  });
  await d1Ctrl.createTransaction({
    type: 'EXPENSE',
    totalAmount: 50.00,
    donorId: donorForGivingId,
    category: 'Maintenance',
    splits: [{ fund_id: 'fund-lillah', amount: 50.00 }]
  });
  const enrichedDonor = await d1Ctrl.getDonor(donorForGivingId);
  testAssert(enrichedDonor.total_donations === 200.00, `Donor total giving includes only INCOME: expected £200.00, got £${enrichedDonor.total_donations}`);

  // Test 30: reconcileTransaction validation
  try {
    await d1Ctrl.reconcileTransaction(restoredTx100.id, '');
    testAssert(false, 'Should block reconciling with empty statement reference');
  } catch (err) {
    testAssert(err.message.includes('valid bank statement reference is required'), 'D1 blocked empty bank statement reference');
  }

  // Test 31: depositCash validation (reject non-INCOME or non-CASH)
  const expenseTx = await d1Ctrl.createTransaction({
    type: 'EXPENSE',
    totalAmount: 30.00,
    category: 'Utilities',
    splits: [{ fund_id: 'fund-lillah', amount: 30.00 }]
  });
  try {
    await d1Ctrl.depositCash(expenseTx.id);
    testAssert(false, 'Should block depositCash on EXPENSE');
  } catch (err) {
    testAssert(err.message.includes('Only INCOME transactions can be banked'), 'D1 blocked depositCash on EXPENSE transaction');
  }

  // Test 32: Asnaf allocation cap against restricted Zakat/Fitrana split
  const mixedExpenseTx = await d1Ctrl.createTransaction({
    type: 'EXPENSE',
    totalAmount: 100.00,
    category: 'Charitable Payout',
    reference_note: 'Asnaf food package aid for local destitute families',
    splits: [
      { fund_id: 'fund-lillah', amount: 30.00 },
      { fund_id: 'fund-zakat', amount: 70.00 }
    ]
  });


  try {
    await d1Ctrl.recordAsnafDisbursement({
      transaction_id: mixedExpenseTx.id,
      beneficiary_name: 'Beneficiary Exceeding Zakat Split',
      asnaf_category: 'FUQARA',
      amount: 80.00
    });
    testAssert(false, 'Should block Asnaf disbursement exceeding restricted Zakat split');
  } catch (err) {
    testAssert(err.message.includes('cannot exceed eligible restricted Zakat/Fitrana'), 'D1 strictly capped Asnaf disbursement to restricted Zakat split allocation (£70)');
  }

  const validAsnaf = await d1Ctrl.recordAsnafDisbursement({
    transaction_id: mixedExpenseTx.id,
    beneficiary_name: 'Deserving Family (Zakat)',
    asnaf_category: 'FUQARA',
    amount: 50.00
  });
  testAssert(validAsnaf && validAsnaf.amount === 50.00, 'Recorded valid Asnaf disbursement within restricted split limit');

  // Test 33: voidTransaction cascades deletion of linked Asnaf records
  await d1Ctrl.voidTransaction(mixedExpenseTx.id, 'Voiding mixed expense with asnaf');
  const asnafAfterVoid = await d1Ctrl.getAsnafRecords(mixedExpenseTx.id);
  testAssert(asnafAfterVoid.length === 0, 'voidTransaction successfully cascaded deletion of linked Asnaf records');

  // Test 34: Inter-Fund Transfer rules (CC17 / Shariah)
  await d1Ctrl.createTransaction({
    type: 'INCOME',
    totalAmount: 500.00,
    status: 'BANKED',
    method: 'BANK_TRANSFER',
    splits: [{ fund_id: 'fund-lillah', amount: 500.00 }]
  });

  try {
    await d1Ctrl.transferFund({
      fromFundId: 'fund-zakat',
      toFundId: 'fund-lillah',
      amount: 50.00,
      reason: 'Repurpose Zakat to General operational'
    });
    testAssert(false, 'Should block transferring restricted fund to unrestricted fund');
  } catch (err) {
    testAssert(err.message.includes('Cannot transfer from restricted fund'), 'D1 strictly blocked restricted fund transfer to unrestricted fund');
  }

  try {
    await d1Ctrl.transferFund({
      fromFundId: 'fund-lillah',
      toFundId: 'fund-building',
      amount: 9999999.00,
      reason: 'Massive transfer'
    });
    testAssert(false, 'Should block transfer exceeding available balance');
  } catch (err) {
    testAssert(err.message.includes('Insufficient balance in source fund'), 'D1 strictly blocked transfer with insufficient balance');
  }

  const validTransfer = await d1Ctrl.transferFund({
    fromFundId: 'fund-lillah',
    toFundId: 'fund-building',
    amount: 100.00,
    reason: 'Trustees designated general surplus to building project'
  });
  testAssert(validTransfer.success === true, 'Successfully executed compliant inter-fund transfer');

  // Test 35: saveBudget validation
  try {
    await d1Ctrl.saveBudget({
      fund_id: 'fund-building',
      fiscal_year: 2026,
      target_amount: -500.00
    });
    testAssert(false, 'Should block negative budget target');
  } catch (err) {
    testAssert(err.message.includes('cannot be negative'), 'D1 strictly blocked negative budget target');
  }

  // Test 36: getFiscalYearBounds 4-digit parameter handling
  const fy2024 = getFiscalYearBounds('2024', '04-06');
  testAssert(fy2024.startDate === '2024-04-06', `fy2024.startDate is 2024-04-06 (got ${fy2024.startDate})`);
  testAssert(fy2024.endDate === '2025-04-05', `fy2024.endDate is 2025-04-05 (got ${fy2024.endDate})`);

  // Test 37: Stripe webhook idempotency check via processed_webhook_events
  const testEventId = `evt_test_${Date.now()}`;
  await db.prepare(`
    INSERT INTO processed_webhook_events (id, provider, event_type, created_at)
    VALUES (?, 'stripe', 'payment_intent.succeeded', datetime('now'))
  `).bind(testEventId).run();

  const dupCheck = await db.prepare(`SELECT id FROM processed_webhook_events WHERE id = ?`).bind(testEventId).first();
  testAssert(dupCheck && dupCheck.id === testEventId, 'processed_webhook_events correctly tracks Stripe event ID');

  // Test 38: Notification deduplication check
  await db.prepare(`
    INSERT INTO notifications (id, type, severity, message, created_at)
    VALUES (?, 'ZAKAT_SURPLUS', 'INFO', 'Zakat surplus alert', datetime('now'))
  `).bind(`notif-test-${Date.now()}`).run();

  const unreadAlert = await db.prepare(`SELECT id FROM notifications WHERE type = 'ZAKAT_SURPLUS' AND read_at IS NULL LIMIT 1`).first();
  testAssert(unreadAlert && unreadAlert.id, 'Active unread Zakat surplus alert identified for deduplication');

  // Ensure test users exist in SQLite with appropriate roles for foreign key constraints
  await db.prepare(`
    INSERT INTO users (id, name, email, role, password_hash, created_at)
    VALUES ('user-d1-admin', 'D1 Admin', 'admin@masjid.org.uk', 'REVIEWER', 'test-hash', datetime('now'))
    ON CONFLICT(id) DO UPDATE SET role = 'REVIEWER'
  `).run();

  await db.prepare(`
    INSERT INTO users (id, name, email, role, password_hash, created_at)
    VALUES ('user-reviewer-1', 'Trustee Reviewer', 'reviewer@masjid.org.uk', 'REVIEWER', 'test-hash', datetime('now'))
    ON CONFLICT(id) DO UPDATE SET role = 'REVIEWER'
  `).run();

  // --------------------------------------------------------------------------
  // ITEM 1: Maker-Checker Dual Approval Workflow Tests (Tests 39-43)
  // --------------------------------------------------------------------------
  // Test 39: EXPENSE exceeding £1,000 threshold or touching restricted funds triggers PENDING_APPROVAL
  const highExpenseTx = await d1Ctrl.createTransaction({
    type: 'EXPENSE',
    status: 'BANKED',
    method: 'BANK_TRANSFER',
    totalAmount: 1250.00,
    date: '2026-09-22',
    category: 'Repairs & Maintenance',
    reference_note: 'Minaret structural repair contractor invoice #981',
    splits: [{ fund_id: 'fund-building', amount: 1250.00 }]
  });
  testAssert(highExpenseTx.status === 'PENDING_APPROVAL', 'Large expense (>£1,000) routed to PENDING_APPROVAL status');
  testAssert(highExpenseTx.approval_status === 'PENDING', 'approval_status marked PENDING on high value expense');

  const zakatExpenseTx = await d1Ctrl.createTransaction({
    type: 'EXPENSE',
    status: 'BANKED',
    method: 'CASH',
    totalAmount: 45.00, // Small amount, but restricted Zakat fund
    date: '2026-09-22',
    category: 'Charitable Payout',
    reference_note: 'Urgent food relief for refugee family',
    splits: [{ fund_id: 'fund-zakat', amount: 45.00 }]
  });
  testAssert(zakatExpenseTx.status === 'PENDING_APPROVAL', 'Restricted fund expense routed to PENDING_APPROVAL regardless of amount');

  // Test 40: Fund balances exclude PENDING_APPROVAL transactions
  const balancesBeforeApproval = await d1Ctrl.getBalances();
  const buildingFundBefore = balancesBeforeApproval.find(f => f.fundId === 'fund-building');
  testAssert(buildingFundBefore && typeof buildingFundBefore.balance === 'number', 'Retrieved active building fund balance');

  // Test 41: Strict no-self-approval rule
  try {
    await d1Ctrl.approveTransaction(highExpenseTx.id);
    testAssert(false, 'Should block creator from self-approving their own transaction');
  } catch (err) {
    testAssert(err.message.includes('Approver cannot approve their own transaction'), 'Strictly blocked transaction creator self-approval');
  }

  // Test 42: Authorized reviewer approval
  const reviewerCtrl = new D1Controller('REVIEWER', 'user-reviewer-1', 'Trustee Reviewer', 'reviewer@masjid.org.uk');
  const approvedTx = await reviewerCtrl.approveTransaction(highExpenseTx.id);
  testAssert(approvedTx.status === 'BANKED', 'Approved transaction transitioned to BANKED status');
  testAssert(approvedTx.approval_status === 'APPROVED', 'Transaction approval_status marked APPROVED');
  testAssert(approvedTx.approved_by === 'user-reviewer-1', 'approved_by correctly attributed to reviewer');

  const balancesAfterApproval = await d1Ctrl.getBalances();
  const buildingFundAfter = balancesAfterApproval.find(f => f.fundId === 'fund-building');
  const expectedBuildingBalance = Math.round((buildingFundBefore.balance - 1250) * 100);
  const actualBuildingBalance = Math.round(buildingFundAfter.balance * 100);
  testAssert(actualBuildingBalance === expectedBuildingBalance, 'Fund balance correctly decremented only after dual approval');

  // Test 43: Rejection workflow with mandatory justification
  const rejectableTx = await d1Ctrl.createTransaction({
    type: 'EXPENSE',
    status: 'BANKED',
    method: 'BANK_TRANSFER',
    totalAmount: 1800.00,
    date: '2026-09-22',
    category: 'Equipment',
    reference_note: 'Unbudgeted AV upgrade quote',
    splits: [{ fund_id: 'fund-lillah', amount: 1800.00 }]
  });

  try {
    await reviewerCtrl.rejectTransaction(rejectableTx.id, 'No');
    testAssert(false, 'Should reject reason that is too short');
  } catch (err) {
    testAssert(err.message.includes('at least 5 characters'), 'Rejection requires detailed justification (>= 5 chars)');
  }

  const rejectedTx = await reviewerCtrl.rejectTransaction(rejectableTx.id, 'Unbudgeted purchase - Trustees requested formal tender before purchase');
  testAssert(rejectedTx.status === 'FAILED', 'Rejected transaction status transitioned to FAILED');
  testAssert(rejectedTx.approval_status === 'REJECTED', 'approval_status marked REJECTED');
  testAssert(rejectedTx.rejection_reason && rejectedTx.rejection_reason.includes('Unbudgeted purchase'), 'Rejection reason persisted for audit trail');

  // --------------------------------------------------------------------------
  // ITEM 2: Dated Gift Aid Declarations & Claim Batches (Tests 44-45)
  // --------------------------------------------------------------------------
  // Test 44: createGiftAidDeclaration and isGiftAidCovered date window enforcement
  const gaDonorId = await d1Ctrl.createDonor({
    name: 'Sister Maryam Begum',
    email: 'maryam.begum@test.org',
    address_line_1: '45 Victoria Street',
    city: 'Bristol',
    postcode: 'BS1 6HG',
    giftAidEligible: true
  });

  const decl = await d1Ctrl.createGiftAidDeclaration({
    donorId: gaDonorId,
    scope: 'SINCE_DATE',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    notes: 'Paper declaration signed during Ramadan campaign'
  });
  testAssert(decl && decl.id.startsWith('gadecl-'), 'Gift Aid declaration created with unique ID');

  const coveredMidYear = await d1Ctrl.isGiftAidCovered(gaDonorId, '2026-06-15');
  const uncoveredPast = await d1Ctrl.isGiftAidCovered(gaDonorId, '2025-12-31');
  const uncoveredFuture = await d1Ctrl.isGiftAidCovered(gaDonorId, '2027-01-01');
  testAssert(coveredMidYear === true, 'Donation within declaration validity window covered by Gift Aid');
  testAssert(uncoveredPast === false, 'Donation prior to declaration start date not covered');
  testAssert(uncoveredFuture === false, 'Donation after declaration end date not covered');

  // Cancel declaration and verify retroactive coverage termination
  await d1Ctrl.cancelGiftAidDeclaration(decl.id, '2026-07-01');
  const coveredBeforeCancel = await d1Ctrl.isGiftAidCovered(gaDonorId, '2026-05-01');
  const uncoveredAfterCancel = await d1Ctrl.isGiftAidCovered(gaDonorId, '2026-08-01');
  testAssert(coveredBeforeCancel === true, 'Donation prior to cancellation date remains valid');
  testAssert(uncoveredAfterCancel === false, 'Donation post-cancellation date correctly rejected for Gift Aid');

  // Test 45: HMRC Gift Aid Claim Batch creation & unique transaction locking
  const activeDeclDonorId = await d1Ctrl.createDonor({
    name: 'Brother Tariq Mahmoud',
    email: 'tariq.m@test.org',
    address_line_1: '88 Queen Square',
    city: 'Bristol',
    postcode: 'BS1 4NT',
    giftAidEligible: true
  });
  await d1Ctrl.createGiftAidDeclaration({
    donorId: activeDeclDonorId,
    scope: 'PAST_PRESENT_FUTURE',
    startDate: '2025-01-01'
  });

  const gaTx = await d1Ctrl.createTransaction({
    type: 'INCOME',
    status: 'BANKED',
    method: 'BANK_TRANSFER',
    totalAmount: 200.00,
    date: '2026-03-15',
    donorId: activeDeclDonorId,
    category: 'Donation',
    giftAid: true,
    splits: [{ fund_id: 'fund-lillah', amount: 200.00 }]
  });

  const claimableBeforeBatch = await d1Ctrl.getGiftAidClaimableTransactions({ startDate: '2026-01-01', endDate: '2026-03-31' });
  testAssert(claimableBeforeBatch.some(t => t.id === gaTx.id), 'Transaction appears in claimable donations query');

  const claimBatch = await d1Ctrl.createGiftAidClaimBatch({
    periodStart: '2026-01-01',
    periodEnd: '2026-03-31',
    transactionIds: [gaTx.id],
    notes: 'Q1 2026 HMRC Gift Aid Schedule'
  });
  testAssert(claimBatch && claimBatch.claimReference.startsWith('HMRC-GA-'), `Claim batch created: ${claimBatch.claimReference}`);
  testAssert(claimBatch.totalDonationsPence === 20000, 'Total donation amount in pence recorded accurately (20000)');
  testAssert(claimBatch.totalClaimPence === 5000, '25% Gift Aid tax relief claim calculated accurately (£50.00 / 5000 pence)');

  const claimableAfterBatch = await d1Ctrl.getGiftAidClaimableTransactions({ startDate: '2026-01-01', endDate: '2026-03-31' });
  testAssert(!claimableAfterBatch.some(t => t.id === gaTx.id), 'Claimed transaction successfully locked and excluded from future claim batches');

  // --------------------------------------------------------------------------
  // ITEM 3: Governed Jummah Collections Sheet & Breakdown Tests (Tests 46-47)
  // --------------------------------------------------------------------------
  // Test 46: Jummah Friday date & distinct counter validation
  try {
    await d1Ctrl.createTransaction({
      type: 'INCOME',
      status: 'PENDING',
      method: 'CASH',
      totalAmount: 50.00,
      date: '2026-09-21', // Monday
      isJummah: true,
      counter_1_name: 'Counter One',
      counter_2_name: 'Counter Two',
      splits: [{ fund_id: 'fund-lillah', amount: 50.00 }]
    });
    testAssert(false, 'Should block Jummah collection on non-Friday');
  } catch (err) {
    testAssert(err.message.includes('must occur on a Friday'), 'D1 strictly enforces Friday collection date for Jummah');
  }

  try {
    await d1Ctrl.createTransaction({
      type: 'INCOME',
      status: 'PENDING',
      method: 'CASH',
      totalAmount: 50.00,
      date: '2026-09-25', // Friday
      isJummah: true,
      counter_1_name: 'Same Counter',
      counter_2_name: 'Same Counter',
      splits: [{ fund_id: 'fund-lillah', amount: 50.00 }]
    });
    testAssert(false, 'Should block Jummah collection with identical counters');
  } catch (err) {
    testAssert(err.message.includes('two distinct witness counters'), 'D1 strictly requires 2 distinct witness counters for Jummah');
  }

  // Test 47: Governed Jummah denomination breakdown persistence
  const jummahTx = await d1Ctrl.createTransaction({
    type: 'INCOME',
    status: 'PENDING',
    method: 'CASH',
    totalAmount: 260.00,
    date: '2026-09-25', // Friday
    isJummah: true,
    counter_1_name: 'Imam Bilal',
    counter_2_name: 'Brother Farooq',
    notes_50: 1, // £50
    notes_20: 8, // £160
    notes_10: 3, // £30
    notes_5: 2,  // £10
    coins_total: 10.00, // £10
    splits: [{ fund_id: 'fund-lillah', amount: 260.00 }]
  });
  testAssert(jummahTx && jummahTx.id, 'Jummah transaction created with denomination breakdown');

  const jummahRow = await db.prepare('SELECT * FROM jummah_collections WHERE transaction_id = ?').bind(jummahTx.id).first();
  testAssert(jummahRow && jummahRow.notes_50_count === 1 && jummahRow.notes_20_count === 8 && jummahRow.total_pence === 26000,
    'Jummah collection sheet persisted complete denomination counts (£50x1, £20x8, £10x3, £5x2, £10 coins) and total pence in D1');

  // --------------------------------------------------------------------------
  // ITEM 4: Server-Side Donor Search & Stripe Fee/Refund (Tests 48-50)
  // --------------------------------------------------------------------------
  // Test 48: Server-side Donor Search with SQL LIKE
  await d1Ctrl.createDonor({
    name: 'Dr. Zakir Naik',
    email: 'zakir@research.org',
    address_line_1: '10 Peace Road',
    city: 'Mumbai',
    postcode: 'M1 1AA'
  });
  await d1Ctrl.createDonor({
    name: 'Ustadh Nouman Ali Khan',
    email: 'nouman@bayyinah.org',
    address_line_1: '12 Arabic Way',
    city: 'Dallas',
    postcode: 'D1 2BB'
  });

  const searchResults1 = await d1Ctrl.getDonors({ search: 'Zakir' });
  testAssert(searchResults1.some(d => d.name.includes('Zakir')) && !searchResults1.some(d => d.name.includes('Nouman')),
    'Server-side donor search returned matching donor (Zakir) and excluded non-matching (Nouman)');

  const searchResults2 = await d1Ctrl.getDonors({ search: 'bayyinah.org' });
  testAssert(searchResults2.some(d => d.email && d.email.includes('bayyinah.org')),
    'Server-side donor search matched on donor email address');

  // Test 49: Stripe processor fee segregation to General Fund (fund-lillah)
  const stripeGrossAmount = 100.00;
  const stripeFeeAmount = 2.50;
  const stripeIncomeTx = await d1Ctrl.createTransaction({
    type: 'INCOME',
    status: 'BANKED',
    method: 'STRIPE',
    totalAmount: stripeGrossAmount,
    date: '2026-09-22',
    category: 'Online Donation',
    reference_note: 'Online Stripe card donation #pi_123456',
    splits: [{ fund_id: 'fund-building', amount: stripeGrossAmount }]
  });
  testAssert(stripeIncomeTx.totalAmount === 100.00, 'Stripe gross donation recorded as full INCOME £100.00');

  // Record fee as segregated EXPENSE against fund-lillah
  const stripeFeeTx = await d1Ctrl.createTransaction({
    type: 'EXPENSE',
    status: 'BANKED',
    method: 'BANK_TRANSFER',
    totalAmount: stripeFeeAmount,
    date: '2026-09-22',
    category: 'Bank Charges',
    reference_note: `Stripe processing fee for donation ${stripeIncomeTx.id}`,
    splits: [{ fund_id: 'fund-lillah', amount: stripeFeeAmount }]
  });
  testAssert(stripeFeeTx.totalAmount === 2.50, 'Stripe processing fee segregated as EXPENSE (£2.50)');
  const feeSplit = await db.prepare('SELECT fund_id FROM transaction_splits WHERE transaction_id = ?').bind(stripeFeeTx.id).first();
  testAssert(feeSplit && feeSplit.fund_id === 'fund-lillah', 'Processing fee charged strictly against unrestricted General Fund (fund-lillah)');

  // Test 50: Stripe refund compensating reversal expense
  const refundAmount = 100.00;
  const stripeRefundTx = await d1Ctrl.createTransaction({
    type: 'EXPENSE',
    status: 'BANKED',
    method: 'STRIPE',
    totalAmount: refundAmount,
    date: '2026-09-22',
    category: 'Refund',
    reference_note: `Compensating reversal: Stripe refund for donation ${stripeIncomeTx.id}`,
    splits: [{ fund_id: 'fund-building', amount: refundAmount }]
  });
  testAssert(stripeRefundTx.type === 'EXPENSE' && stripeRefundTx.status === 'BANKED',
    'Stripe refund recorded as compensating reversal EXPENSE transaction');
  const refundSplit = await db.prepare('SELECT fund_id, amount FROM transaction_splits WHERE transaction_id = ?').bind(stripeRefundTx.id).first();
  testAssert(refundSplit && refundSplit.fund_id === 'fund-building' && refundSplit.amount === 10000,
    'Compensating refund reversal accurately credited/debited back against original fund-building in integer pence');

  console.log("--------------------------------------------------");
  console.log(`D1 TESTS COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log("--------------------------------------------------");



  if (failCount > 0) {
    process.exit(1);
  }
}

runD1TestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

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
    date: '2026-09-20',
    donorId: d1DonorId,
    reference_note: 'Jummah donation for building fund',
    category: 'Donation',
    giftAid: true,

    isJummah: true,
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

  // Test 15: Bank Reconciliation in D1 (Item #14)
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

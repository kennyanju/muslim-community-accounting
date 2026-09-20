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
  const asnaf = controller.recordAsnafDisbursement({
    transaction_id: 'tx-test-asnaf',
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

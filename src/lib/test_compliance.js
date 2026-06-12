import { DatabaseController, readDB } from './db.js';

console.log("--------------------------------------------------");
console.log("RUNNING AUTOMATED COMPLIANCE TRIGGER TESTS");
console.log("--------------------------------------------------");

// Test case 1: Validate operational expense trigger under Zakat (Rule 1)
try {
  const controller = new DatabaseController('ADMIN', 'user-sec-1');
  controller.createTransaction({
    type: 'EXPENSE',
    status: 'BANKED',
    method: 'BANK_TRANSFER',
    totalAmount: 150.00,
    date: '2026-06-12',
    donorId: 'anonymous',
    receiptUrl: '',
    reference_note: 'Mosque Maintenance Bill', // Operational category
    splits: [{ fund_id: 'fund-zakat', amount: 150.00 }], // Draw from restricted fund
    notes: 'Try to spend Zakat on repairs'
  });
  console.log("❌ TEST 1 FAILED: Allowed operational expense to draw from Zakat!");
} catch (err) {
  if (err.message.includes("Strict Compliance Violation")) {
    console.log("✅ TEST 1 PASSED: Restricted fund operating expense trigger successfully blocked.");
  } else {
    console.log("❌ TEST 1 FAILED with unexpected error:", err.message);
  }
}

// Test case 2: Validate interest automatic routing to Interest/Riba fund (Rule 4)
try {
  const controller = new DatabaseController('ADMIN', 'user-sec-1');
  const txId = controller.createTransaction({
    type: 'INCOME',
    status: 'BANKED',
    method: 'BANK_TRANSFER',
    totalAmount: 45.00,
    date: '2026-06-12',
    donorId: 'anonymous',
    receiptUrl: '',
    reference_note: 'Interest', // Interest category
    splits: [{ fund_id: 'fund-lillah', amount: 45.00 }] // Try to allocate to Lillah
  });

  // Verify split in database
  const db = readDB();
  const splits = db.transaction_splits.filter(s => s.transaction_id === txId);
  const ribaFund = db.funds.find(f => f.name === 'Interest/Riba');
  
  if (splits.length === 1 && splits[0].fund_id === ribaFund.id) {
    console.log("✅ TEST 2 PASSED: Bank interest income automatically routed to Interest/Riba restricted fund.");
  } else {
    console.log("❌ TEST 2 FAILED: Split did not route to Riba fund. Result splits:", splits);
  }
} catch (err) {
  console.log("❌ TEST 2 FAILED with error:", err.message);
}

// Test case 3: Validate Trustee / Auditor RBAC blocking (RLS checks)
try {
  const controller = new DatabaseController('REVIEWER', 'user-tru-2'); // Reviewer role
  controller.createTransaction({
    type: 'INCOME',
    status: 'BANKED',
    method: 'CARD',
    totalAmount: 10.00,
    date: '2026-06-12',
    donorId: 'anonymous',
    splits: [{ fund_id: 'fund-lillah', amount: 10.00 }]
  });
  console.log("❌ TEST 3 FAILED: Reviewer/Trustee was allowed to create a transaction!");
} catch (err) {
  if (err.message.includes("403 Forbidden")) {
    console.log("✅ TEST 3 PASSED: Non-admin write operations blocked via RBAC triggers.");
  } else {
    console.log("❌ TEST 3 FAILED with unexpected error:", err.message);
  }
}

console.log("--------------------------------------------------");
console.log("COMPLIANCE TESTS COMPLETE");
console.log("--------------------------------------------------");

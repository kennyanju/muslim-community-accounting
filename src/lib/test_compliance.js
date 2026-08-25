import { DatabaseController, readDB } from './db.js';
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken } from './auth.js';

console.log("--------------------------------------------------");
console.log("RUNNING AUTOMATED COMPLIANCE & SECURITY TESTS");
console.log("--------------------------------------------------");

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASSED: ${message}`);
    passCount++;
  } else {
    console.error(`❌ FAILED: ${message}`);
    failCount++;
  }
}

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
    reference_note: 'Mosque Maintenance Bill',
    category: 'Maintenance',
    splits: [{ fund_id: 'fund-zakat', amount: 150.00 }],
    notes: 'Try to spend Zakat on repairs'
  });
  assert(false, "Allowed operational expense to draw from Zakat");
} catch (err) {
  assert(
    err.message.includes("Strict Compliance Violation"),
    "Restricted fund operating expense trigger successfully blocked"
  );
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
    reference_note: 'Interest',
    category: 'Interest',
    splits: [{ fund_id: 'fund-lillah', amount: 45.00 }]
  });

  const db = readDB();
  const splits = db.transaction_splits.filter(s => s.transaction_id === txId);
  const ribaFund = db.funds.find(f => f.name === 'Interest/Riba');
  
  assert(
    splits.length === 1 && splits[0].fund_id === ribaFund.id,
    "Bank interest income automatically routed to Interest/Riba restricted fund"
  );
} catch (err) {
  assert(false, `Interest routing failed with error: ${err.message}`);
}

// Test case 3: Validate Trustee / Auditor RBAC blocking
try {
  const controller = new DatabaseController('REVIEWER', 'user-tru-2');
  controller.createTransaction({
    type: 'INCOME',
    status: 'BANKED',
    method: 'CARD',
    totalAmount: 10.00,
    date: '2026-06-12',
    donorId: 'anonymous',
    splits: [{ fund_id: 'fund-lillah', amount: 10.00 }]
  });
  assert(false, "Reviewer/Trustee was allowed to create a transaction!");
} catch (err) {
  assert(
    err.message.includes("403 Forbidden"),
    "Non-admin write operations blocked via RBAC triggers"
  );
}

// Test case 4: Password Hashing and Verification
try {
  const pwd = "TestSecurePassword2026!";
  const hash = hashPassword(pwd);
  assert(verifyPassword(pwd, hash), "Password hashing and verification with scrypt");
  assert(!verifyPassword("WrongPassword", hash), "Password verification rejects incorrect password");
} catch (err) {
  assert(false, `Password hashing test failed: ${err.message}`);
}

// Test case 5: Cryptographic Session Token Generation & Verification
try {
  const mockUser = { id: 'user-sec-1', email: 'secretary@bsmc.org.uk', role: 'ADMIN', name: 'Secretary' };
  const token = createSessionToken(mockUser);
  const verified = verifySessionToken(token);
  assert(
    verified && verified.id === mockUser.id && verified.role === mockUser.role,
    "Session token creation and cryptographic HMAC verification"
  );
  
  // Tampered token test
  const tamperedToken = token.substring(0, token.length - 4) + 'abcd';
  assert(verifySessionToken(tamperedToken) === null, "Tampered session token correctly rejected");
} catch (err) {
  assert(false, `Session token test failed: ${err.message}`);
}

// Test case 6: Voiding preserves original reference note
try {
  const controller = new DatabaseController('ADMIN', 'user-sec-1');
  const txId = controller.createTransaction({
    type: 'INCOME',
    status: 'BANKED',
    method: 'BANK_TRANSFER',
    totalAmount: 50.00,
    date: '2026-06-12',
    donorId: 'anonymous',
    reference_note: 'Original Clean Water Donation',
    category: 'Donation',
    splits: [{ fund_id: 'fund-lillah', amount: 50.00 }]
  });

  controller.voidTransaction(txId, 'Donor requested refund due to duplicate transfer');

  const db = readDB();
  const tx = db.transactions.find(t => t.id === txId);
  assert(
    tx && tx.status === 'VOIDED' && 
    tx.reference_note === 'Original Clean Water Donation' && 
    tx.void_reason === 'Donor requested refund due to duplicate transfer',
    "Voiding preserves original reference note and stores void reason & timestamp"
  );
} catch (err) {
  assert(false, `Void preservation test failed: ${err.message}`);
}

// Test case 7: Shariah fund restriction protection
try {
  const controller = new DatabaseController('ADMIN', 'user-sec-1');
  const db = readDB();
  const zakatFund = db.funds.find(f => f.name === 'Zakat');
  controller.updateFund(zakatFund.id, { is_restricted: false });
  assert(false, "Allowed Zakat fund to be reclassified as unrestricted!");
} catch (err) {
  assert(
    err.message.includes("Shariah compliance rules"),
    "Protected Zakat/Fitrana from being reclassified as unrestricted"
  );
}

console.log("--------------------------------------------------");
console.log(`TESTS COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
console.log("--------------------------------------------------");

if (failCount > 0) {
  process.exit(1);
}

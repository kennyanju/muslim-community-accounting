import { DatabaseController, readDB, getOrganisationFromRequest } from './db.js';
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken, getAuthenticatedUser } from './auth.js';

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

// Test case 1: Validate strict operational expense trigger under Zakat (Rule 1 & H1)
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
    reference_note: 'Staff Payment',
    category: 'Salaries',
    splits: [{ fund_id: 'fund-zakat', amount: 150.00 }],
    notes: 'Try to spend Zakat on salaries'
  });
  assert(false, "Allowed operational expense to draw from Zakat");
} catch (err) {
  assert(
    err.message.includes("Strict Compliance Violation"),
    "Restricted fund operating expense trigger successfully blocked"
  );
}

// Test case 1b: Valid Zakat charitable disbursement with notes succeeds
try {
  const controller = new DatabaseController('ADMIN', 'user-sec-1');
  const zakatTxId = controller.createTransaction({
    type: 'EXPENSE',
    status: 'BANKED',
    method: 'BANK_TRANSFER',
    totalAmount: 200.00,
    date: '2026-06-12',
    donorId: 'anonymous',
    receiptUrl: '',
    reference_note: 'Emergency Food Support Payout',
    category: 'Charitable Payout',
    splits: [{ fund_id: 'fund-zakat', amount: 200.00 }],
    notes: 'Asnaf (Faqir) verified voucher disbursement #402'
  });
  assert(zakatTxId.startsWith('tx-'), "Legitimate Zakat Charitable Payout with Asnaf notes permitted");
} catch (err) {
  assert(false, `Valid Zakat disbursement failed: ${err.message}`);
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
  assert(verifyPassword(pwd, hash), "Password hashing and verification with scrypt/PBKDF2");
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

// Test case 6: Voiding preserves original reference note and marks splits as voided (H3)
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
  const splits = db.transaction_splits.filter(s => s.transaction_id === txId);

  assert(
    tx && tx.status === 'VOIDED' && 
    tx.reference_note === 'Original Clean Water Donation' && 
    tx.void_reason === 'Donor requested refund due to duplicate transfer',
    "Voiding preserves original reference note and stores void reason & timestamp"
  );
  assert(
    splits.every(s => s.is_voided === true),
    "Voiding transaction marks all child splits as is_voided: true"
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

// Test case 8: Admin self-demotion / last admin lockout guard (C2)
try {
  const controller = new DatabaseController('ADMIN', 'user-sec-1');
  // Attempt to demote own account when only one admin
  controller.updateUser('user-sec-1', { role: 'AUDITOR' });
  assert(false, "Allowed the last active Admin to demote themselves!");
} catch (err) {
  assert(
    err.message.includes("Administrator"),
    "Last Admin / Self-demotion guard successfully triggered"
  );
}

// Test case 9: Non-zero balance fund archiving prevention (M2)
try {
  const controller = new DatabaseController('ADMIN', 'user-sec-1');
  controller.createTransaction({
    type: 'INCOME',
    status: 'BANKED',
    method: 'CARD',
    totalAmount: 100.00,
    date: '2026-06-12',
    donorId: 'anonymous',
    reference_note: 'Lillah Fund Active Balance Test',
    category: 'Donation',
    splits: [{ fund_id: 'fund-lillah', amount: 100.00 }]
  });

  controller.updateFund('fund-lillah', { is_archived: true });
  assert(false, "Allowed fund with active balance to be archived!");
} catch (err) {
  assert(
    err.message.includes("Cannot archive fund") && err.message.includes("active balance"),
    "Fund archiving blocked when active non-zero balance exists"
  );
}

// Test case 10: Atomic receipt number generation (C4 & H4)
try {
  const controller = new DatabaseController('ADMIN', 'user-sec-1');
  const txId = controller.createTransaction({
    type: 'INCOME',
    status: 'BANKED',
    method: 'CARD',
    totalAmount: 120.00,
    date: '2026-06-12',
    donorId: 'anonymous',
    reference_note: 'Madrasah Term Book Fee',
    category: 'Madrasah Fees',
    splits: [{ fund_id: 'fund-madrasah', amount: 120.00 }]
  });

  const db = readDB();
  const tx = db.transactions.find(t => t.id === txId);
  assert(
    tx && tx.receipt_number && tx.receipt_number.includes('-2026-'),
    `Atomic receipt number properly generated and saved on transaction (${tx?.receipt_number})`
  );
} catch (err) {
  assert(false, `Receipt generation failed: ${err.message}`);
}

// Test case 11: Reconciled transaction cannot be banked or voided (H5)
try {
  const controller = new DatabaseController('ADMIN', 'user-sec-1');
  const txId = controller.createTransaction({
    type: 'INCOME',
    status: 'PENDING',
    method: 'CASH',
    totalAmount: 35.00,
    date: '2026-06-12',
    donorId: 'anonymous',
    reference_note: 'Cash Box Collection',
    category: 'Donation',
    splits: [{ fund_id: 'fund-lillah', amount: 35.00 }]
  });

  controller.reconcileTransaction(txId);

  let voidBlocked = false;
  try {
    controller.voidTransaction(txId, "Try to void locked tx");
  } catch (e) {
    voidBlocked = true;
  }

  let bankBlocked = false;
  try {
    controller.depositCash(txId);
  } catch (e) {
    bankBlocked = true;
  }

  assert(voidBlocked && bankBlocked, "Reconciled & locked transaction cannot be voided or banked");
} catch (err) {
  assert(false, `Reconcile lock test failed: ${err.message}`);
}

// Test case 12: Split total cent precision validation (H6)
try {
  const controller = new DatabaseController('ADMIN', 'user-sec-1');
  controller.createTransaction({
    type: 'INCOME',
    status: 'BANKED',
    method: 'CARD',
    totalAmount: 100.00,
    date: '2026-06-12',
    donorId: 'anonymous',
    splits: [
      { fund_id: 'fund-lillah', amount: 50.00 },
      { fund_id: 'fund-sadaqah', amount: 49.95 }
    ]
  });
  assert(false, "Allowed mismatched split total to pass validation!");
} catch (err) {
  assert(
    err.message.includes("Splits total") && err.message.includes("does not match"),
    "Precise cent split validation correctly caught £0.05 mismatch"
  );
}

// Test case 13: Whitelisted organization cookie parsing (M4)
try {
  const mockReq = {
    cookies: {
      get: (name) => name === 'masjid_org_pref' ? { value: encodeURIComponent(JSON.stringify({ name: 'Clean Mosque', evilField: '<script>alert(1)</script>' })) } : null
    }
  };
  const org = getOrganisationFromRequest(mockReq);
  assert(
    org.name === 'Clean Mosque' && org.evilField === undefined,
    "Organisation cookie parsing strictly whitelists safe fields and strips malicious injections"
  );
} catch (err) {
  assert(false, `Org cookie sanitization failed: ${err.message}`);
}

// Test case 14: Donor creation with optional email (M6)
try {
  const controller = new DatabaseController('ADMIN', 'user-sec-1');
  const dId = controller.createDonor({
    name: 'Brother Ahmad',
    email: 'ahmad@example.com',
    address_line_1: '12 Green Lane',
    postcode: 'BS5 9TT',
    giftAidEligible: true
  });
  const db = readDB();
  const donor = db.donors.find(d => d.id === dId);
  assert(
    donor && donor.email === 'ahmad@example.com' && donor.postcode === 'BS5 9TT',
    "Donor registered with optional email and structured address"
  );
} catch (err) {
  assert(false, `Donor creation failed: ${err.message}`);
}

console.log("--------------------------------------------------");
console.log(`TESTS COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
console.log("--------------------------------------------------");

if (failCount > 0) {
  process.exit(1);
}

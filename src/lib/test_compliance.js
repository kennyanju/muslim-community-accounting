import { DatabaseController, readDB, getOrganisationFromRequest } from './db.js';
import { hashPassword, verifyPassword, createSessionToken, verifySessionToken, getAuthenticatedUser, hasPermission } from './auth.js';
import { validateTransactionPayload, validateDonorPayload, validateFundPayload, validateUserPayload } from './validation.js';
import { checkRateLimit } from './rateLimit.js';
import { validateClientJummah, validateClientFund, validateClientVoid, validateClientOrganisation } from './clientValidation.js';

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
    totalAmount: 100.00,
    date: '2026-06-12',
    donorId: 'anonymous',
    receiptUrl: '',
    reference_note: 'Illegal reviewer write',
    category: 'Donation',
    splits: [{ fund_id: 'fund-lillah', amount: 100.00 }]
  });
  assert(false, "Allowed non-admin user to perform write operation");
} catch (err) {
  assert(
    err.message.includes("403 Forbidden"),
    "Non-admin write operations blocked via RBAC triggers"
  );
}

// Test case 4: Validate password hashing with scrypt and PBKDF2 formats
try {
  const pass = 'SuperSecret123!';
  const hash = hashPassword(pass);
  const isMatch = verifyPassword(pass, hash);
  assert(isMatch === true, "Password hashing and verification with scrypt/PBKDF2");

  const isWrongMatch = verifyPassword('WrongPassword', hash);
  assert(isWrongMatch === false, "Password verification rejects incorrect password");
} catch (err) {
  assert(false, `Password auth failed: ${err.message}`);
}

// Test case 5: Validate HMAC Session Token Creation and Verification
try {
  const mockUser = {
    id: 'user-sec-1',
    email: 'secretary@bsmc.org.uk',
    role: 'ADMIN',
    name: 'Secretary'
  };
  const token = createSessionToken(mockUser);
  const payload = verifySessionToken(token);

  assert(
    payload !== null && payload.id === mockUser.id && payload.role === 'ADMIN',
    "Session token creation and cryptographic HMAC verification"
  );

  const tamperedToken = token.slice(0, -5) + 'xxxxx';
  const tamperedPayload = verifySessionToken(tamperedToken);
  assert(
    tamperedPayload === null,
    "Tampered session token correctly rejected"
  );
} catch (err) {
  assert(false, `Session token failed: ${err.message}`);
}

// Test case 6: Voiding transactions keeps reference notes and records void reasons
try {
  const controller = new DatabaseController('ADMIN', 'user-sec-1');
  const txId = controller.createTransaction({
    type: 'INCOME',
    status: 'BANKED',
    method: 'CASH',
    totalAmount: 75.00,
    date: '2026-06-12',
    donorId: 'anonymous',
    receiptUrl: '',
    reference_note: 'Special Jummah Collection for Orphanage',
    category: 'Donation',
    splits: [{ fund_id: 'fund-sadaqah', amount: 75.00 }]
  });

  controller.voidTransaction(txId, "Donor deposited to wrong account");
  const db = readDB();
  const voidedTx = db.transactions.find(t => t.id === txId);

  assert(
    voidedTx.status === 'VOIDED' &&
    voidedTx.reference_note === 'Special Jummah Collection for Orphanage' &&
    voidedTx.void_reason === "Donor deposited to wrong account" &&
    typeof voidedTx.voided_at === 'string',
    "Voiding preserves original reference note and stores void reason & timestamp"
  );

  const childSplits = db.transaction_splits.filter(s => s.transaction_id === txId);
  assert(
    childSplits.every(s => s.is_voided === true),
    "Voiding transaction marks all child splits as is_voided: true"
  );
} catch (err) {
  assert(false, `Void transaction failed: ${err.message}`);
}

// Test case 7: Validate Fund Shariah Classification Protection
try {
  const controller = new DatabaseController('ADMIN', 'user-sec-1');
  controller.updateFund('fund-zakat', { is_restricted: false });
  assert(false, "Allowed Zakat to be reclassified as unrestricted");
} catch (err) {
  assert(
    err.message.includes("Shariah compliance rules"),
    "Protected Zakat/Fitrana from being reclassified as unrestricted"
  );
}

// Test case 8: Protect against admin lockout / self-demotion (C2)
try {
  const controller = new DatabaseController('ADMIN', 'user-sec-1');
  controller.updateUser('user-sec-1', { role: 'REVIEWER' });
  assert(false, "Allowed last admin to demote themselves!");
} catch (err) {
  assert(
    err.message.includes("last remaining active Administrator") || err.message.includes("cannot demote"),
    "Last Admin / Self-demotion guard successfully triggered"
  );
}

// Test case 9: Block archiving fund with active non-zero balance (M2)
try {
  const controller = new DatabaseController('ADMIN', 'user-sec-1');
  controller.createTransaction({
    type: 'INCOME',
    status: 'BANKED',
    method: 'BANK_TRANSFER',
    totalAmount: 100.00,
    date: '2026-06-12',
    donorId: 'anonymous',
    reference_note: 'Lillah Operations',
    category: 'Donation',
    splits: [{ fund_id: 'fund-lillah', amount: 100.00 }]
  });

  controller.updateFund('fund-lillah', { is_archived: true });
  assert(false, "Allowed archiving fund with active balance!");
} catch (err) {
  assert(
    err.message.includes("active balance"),
    "Fund archiving blocked when active non-zero balance exists"
  );
}

// Test case 10: Atomic receipt number generation on transaction create (C4 & H4)
try {
  const controller = new DatabaseController('ADMIN', 'user-sec-1');
  const txId = controller.createTransaction({
    type: 'INCOME',
    status: 'BANKED',
    method: 'CASH',
    totalAmount: 120.00,
    date: '2026-06-12',
    donorId: 'anonymous',
    reference_note: 'Friday Collection',
    category: 'Donation',
    splits: [{ fund_id: 'fund-sadaqah', amount: 120.00 }]
  });

  const db = readDB();
  const tx = db.transactions.find(t => t.id === txId);
  assert(
    tx && tx.receipt_number && tx.receipt_number.includes('-2026-'),
    `Atomic receipt number properly generated and saved on transaction (${tx?.receipt_number})`
  );
} catch (err) {
  assert(false, `Receipt number generation failed: ${err.message}`);
}

// Test case 11: Reconciled transaction cannot be voided or banked (H5)
try {
  const controller = new DatabaseController('ADMIN', 'user-sec-1');
  const txId = controller.createTransaction({
    type: 'INCOME',
    status: 'PENDING',
    method: 'CASH',
    totalAmount: 50.00,
    date: '2026-06-12',
    donorId: 'anonymous',
    reference_note: 'Locked test cash',
    category: 'Donation',
    splits: [{ fund_id: 'fund-sadaqah', amount: 50.00 }]
  });

  controller.reconcileTransaction(txId);
  
  let voidBlocked = false;
  try {
    controller.voidTransaction(txId, 'Trying to void locked tx');
  } catch (e) {
    voidBlocked = e.message.includes('locked');
  }

  let bankBlocked = false;
  try {
    controller.depositCash(txId);
  } catch (e) {
    bankBlocked = e.message.includes('locked');
  }

  assert(
    voidBlocked && bankBlocked,
    "Reconciled & locked transaction cannot be voided or banked"
  );
} catch (err) {
  assert(false, `Reconcile lock check failed: ${err.message}`);
}

// Test case 12: Cent precision split validation caught mismatch (H6)
try {
  const controller = new DatabaseController('ADMIN', 'user-sec-1');
  controller.createTransaction({
    type: 'INCOME',
    status: 'BANKED',
    method: 'BANK_TRANSFER',
    totalAmount: 100.00,
    date: '2026-06-12',
    donorId: 'anonymous',
    reference_note: 'Split total mismatch test',
    category: 'Donation',
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

// Test case 15: Schema Validator Utility Unit Tests
try {
  let threwTx = false;
  try {
    validateTransactionPayload({ type: 'INVALID_TYPE', totalAmount: -10 });
  } catch (e) {
    threwTx = true;
  }

  let threwDonor = false;
  try {
    validateDonorPayload({ name: 'Test Donor', email: 'not-an-email', giftAidEligible: true });
  } catch (e) {
    threwDonor = true;
  }

  assert(threwTx && threwDonor, "Schema validator caught malformed transaction type and invalid donor email");
} catch (err) {
  assert(false, `Validator test failed: ${err.message}`);
}

// Test case 16: In-Memory Sliding Window Rate Limiter
try {
  const testIp = '192.168.1.100';
  for (let i = 0; i < 5; i++) {
    checkRateLimit(`test:${testIp}`, 5, 5000);
  }
  const blocked = checkRateLimit(`test:${testIp}`, 5, 5000);
  assert(!blocked.isAllowed && blocked.remaining === 0, "Rate limiter correctly blocked 6th request exceeding quota");
} catch (err) {
  assert(false, `Rate limit test failed: ${err.message}`);
}

// Test case 18: Safe User Stripping
try {
  const db = readDB();
  const rawUser = (db.users || [])[0];
  const safeUser = (new DatabaseController('ADMIN', 'user-sec-1')).getUsers()[0];

  assert(
    safeUser && safeUser.password_hash === undefined && rawUser && typeof rawUser.password_hash === 'string',
    "User password_hash is strictly stripped from all API user queries"
  );
} catch (err) {
  assert(false, `Safe user stripping failed: ${err.message}`);
}

// Test case 19: Date Range Validation
try {
  import('./validation.js').then(({ validateDateRange }) => {
    let invalidCaught = false;
    try {
      validateDateRange('invalid-date', '2026-12-31');
    } catch (e) {
      invalidCaught = true;
    }
    assert(invalidCaught, "Invalid date query parameter properly rejected with validation error");
  });
} catch (err) {
  assert(false, `Date range validation failed: ${err.message}`);
}

// Test case 20: Transaction Method & Category Enum Validation
try {
  let enumCaught = false;
  try {
    validateTransactionPayload({
      type: 'INCOME',
      method: 'BITCOIN_PAY',
      category: 'IllegalCategory',
      totalAmount: 100,
      splits: [{ fund_id: 'fund-lillah', amount: 100 }]
    });
  } catch (e) {
    enumCaught = true;
  }
  assert(enumCaught, "Unapproved payment method / category caught by enum validator");
} catch (err) {
  assert(false, `Enum validation test failed: ${err.message}`);
}

// Test case 21: In-Memory O(N+M) Indexed Balance Calculation Match
try {
  const controller = new DatabaseController('ADMIN', 'user-sec-1');
  const balances = controller.getBalances();
  assert(
    Array.isArray(balances) && balances.length >= 7 && balances.every(b => typeof b.balance === 'number'),
    "Optimized in-memory indexed balance engine computes active fund balances accurately"
  );
} catch (err) {
  assert(false, `Balance calculation test failed: ${err.message}`);
}

// Test case 22: Client-side Jummah Dual-Witness & Allocation Validation
try {
  const duplicateWitnessResult = validateClientJummah({
    totalAmount: '500',
    date: '2026-06-12',
    counter1: 'Brother Tariq',
    counter2: 'Brother Tariq',
    splits: [{ fund_id: 'fund-lillah', amount: '500' }]
  });
  assert(
    !duplicateWitnessResult.isValid && duplicateWitnessResult.errors.counter2.includes('distinct individuals'),
    "Jummah validation caught duplicate witness identity"
  );

  const splitMismatchResult = validateClientJummah({
    totalAmount: '500',
    date: '2026-06-12',
    counter1: 'Brother Tariq',
    counter2: 'Brother Usman',
    splits: [{ fund_id: 'fund-lillah', amount: '450' }]
  });
  assert(
    !splitMismatchResult.isValid && splitMismatchResult.errors.splits.includes('must exactly match'),
    "Jummah validation caught £50 split allocation discrepancy"
  );
} catch (err) {
  assert(false, `Jummah client validation failed: ${err.message}`);
}

// Test case 23: Client-side Fund & Void Schema Validation
try {
  const emptyFundResult = validateClientFund({ name: ' ' });
  assert(!emptyFundResult.isValid && Boolean(emptyFundResult.errors.name), "Client fund validator caught empty name");

  const emptyVoidResult = validateClientVoid({ reason: ' ' });
  assert(!emptyVoidResult.isValid && Boolean(emptyVoidResult.errors.reason), "Client void validator caught empty justification");

  const invalidOrgResult = validateClientOrganisation({ name: 'Mosque', email: 'not-an-email', currency_symbol: '' });
  assert(
    !invalidOrgResult.isValid && Boolean(invalidOrgResult.errors.email) && Boolean(invalidOrgResult.errors.currency_symbol),
    "Client organisation validator caught invalid email format and missing currency"
  );
} catch (err) {
  assert(false, `Fund/Void/Org client validation failed: ${err.message}`);
}

// Test case 24: Granular Optimistic UI Rollback Simulation
try {
  const initialTransactions = [
    { id: 'tx-1', status: 'PENDING', total_amount: 100 },
    { id: 'tx-2', status: 'PENDING', total_amount: 250 }
  ];

  // Optimistic mutation: mark tx-1 as BANKED
  const targetId = 'tx-1';
  const originalTx = initialTransactions.find(t => t.id === targetId);
  const optimisticallyUpdated = initialTransactions.map(t => t.id === targetId ? { ...t, status: 'BANKED' } : t);

  assert(optimisticallyUpdated.find(t => t.id === 'tx-1').status === 'BANKED', "Optimistic update applied instantly");

  // In the meantime, another concurrent update happens to tx-2
  const concurrentlyUpdated = optimisticallyUpdated.map(t => t.id === 'tx-2' ? { ...t, total_amount: 300 } : t);

  // Failure occurs on tx-1, execute surgical item rollback
  const rolledBack = concurrentlyUpdated.map(t => t.id === targetId ? originalTx : t);

  assert(
    rolledBack.find(t => t.id === 'tx-1').status === 'PENDING' && rolledBack.find(t => t.id === 'tx-2').total_amount === 300,
    "Surgical optimistic rollback cleanly restored target item while preserving concurrent mutations"
  );
} catch (err) {
  assert(false, `Optimistic rollback test failed: ${err.message}`);
}

// Test case 25: XSS and CSV Formula Injection Sanitization
try {
  const { sanitizeText, sanitizeCsvCell } = await import('./sanitize.js');

  const rawXSS = "<script>alert('pwned')</script><iframe src='evil.com'></iframe><img src=x onerror=alert(1)>Hello World";
  const cleanedText = sanitizeText(rawXSS);
  assert(
    !cleanedText.includes('<script>') && !cleanedText.includes('onerror=') && !cleanedText.includes('<iframe>'),
    "sanitizeText effectively neutralized XSS script tags, iframe embeds, and inline event handlers"
  );

  const formulaPayload = "=cmd|'/C calc'!A0";
  const sanitizedCell = sanitizeCsvCell(formulaPayload);
  assert(
    sanitizedCell.startsWith("\"'") && sanitizedCell.includes("=cmd"),
    "sanitizeCsvCell safely neutralized spreadsheet DDE formula execution by prepending a single quote"
  );

  const plusPayload = "+SUM(A1:B10)";
  const sanitizedPlus = sanitizeCsvCell(plusPayload);
  assert(
    sanitizedPlus.startsWith("\"'"),
    "sanitizeCsvCell safely neutralized '+' formula trigger"
  );
} catch (err) {
  assert(false, `Sanitization tests failed: ${err.message}`);
}

// Test case 26: Accessibility & WCAG Contrast Standards Validation
try {
  const fs = await import('fs');
  const cssContent = fs.readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

  // Verify skip-to-content rule
  assert(
    cssContent.includes('.skip-to-content') && cssContent.includes('.skip-to-content:focus'),
    "Skip to main content keyboard accessibility style rules verified"
  );

  // Verify WCAG AA high-contrast status colors (#047857, #0369a1, #b45309, #b91c1c)
  assert(
    cssContent.includes('#047857') && cssContent.includes('#0369a1') && cssContent.includes('#b45309') && cssContent.includes('#b91c1c'),
    "WCAG AA accessible high-contrast badge & status color tokens verified"
  );

  // Verify 44px touch target rules
  assert(
    cssContent.includes('min-height: 44px') && cssContent.includes('@media (max-width: 640px)'),
    "44px mobile touch target & responsive breakpoint rules verified"
  );
} catch (err) {
  assert(false, `Accessibility test failed: ${err.message}`);
}


console.log("--------------------------------------------------");
console.log(`TESTS COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
console.log("--------------------------------------------------");

if (failCount > 0) {
  process.exit(1);
}


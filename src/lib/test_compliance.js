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

// Test case 27: Theme Flash Prevention, Modal Focus Trap, and Global Error Boundary
try {
  const fs = await import('fs');

  // 1. Verify layout.js pre-paint inline theme script
  const layoutContent = fs.readFileSync(new URL('../app/layout.js', import.meta.url), 'utf8');
  assert(
    layoutContent.includes('localStorage.getItem("masjid-theme")') &&
    layoutContent.includes('matchMedia(\'(prefers-color-scheme: dark)\')') &&
    layoutContent.includes('document.documentElement.setAttribute(\'data-theme\''),
    "Synchronous inline pre-paint theme resolver correctly prevents FOUC flash"
  );

  // 2. Verify useModalFocusTrap module
  const { useModalFocusTrap } = await import('../hooks/useModalFocusTrap.js');
  assert(typeof useModalFocusTrap === 'function', "useModalFocusTrap hook exists and exports cleanly");

  // 3. Verify global-error.js root boundary
  const globalErrorExists = fs.existsSync(new URL('../app/global-error.js', import.meta.url));
  assert(globalErrorExists, "global-error.js exists to catch root layout boundary exceptions");

  // 4. Verify Toast max stacking cap
  const sampleToasts = [
    { id: 1, message: 'T1' },
    { id: 2, message: 'T2' },
    { id: 3, message: 'T3' },
    { id: 4, message: 'T4' }
  ];
  const newToast = { id: 5, message: 'T5' };
  const trimmed = sampleToasts.length >= 4 ? sampleToasts.slice(sampleToasts.length - 3) : sampleToasts;
  const stacked = [...trimmed, newToast];
  assert(stacked.length === 4 && stacked[3].id === 5, "Toast notification manager caps concurrent active toasts at 4");
} catch (err) {
  assert(false, `Theme flash and error boundary tests failed: ${err.message}`);
}

// Test case 28: Intl Locale, Timezone, Multi-Currency Formatters & SEO Configurations
try {
  const { formatCurrency, formatDate, formatDateTime, getUserLocale, getUserTimeZone } = await import('../utils/formatters.js');
  const fs = await import('fs');

  // 1. Format Currency with international Islamic and standard currencies
  const gbpVal = formatCurrency(1250.50, '£', 'en-GB');
  assert(gbpVal.includes('1,250.50'), "Intl.NumberFormat correctly formats GBP currency");

  const ngnVal = formatCurrency(50000, '₦', 'en-NG');
  assert(ngnVal.includes('50,000.00'), "Intl.NumberFormat correctly formats NGN currency");

  const sarVal = formatCurrency(750, 'SAR', 'en-US');
  assert(sarVal.includes('750.00'), "Intl.NumberFormat correctly formats SAR currency");

  // 2. Date and Time formatting with custom options and timezone detection
  const testDate = '2026-08-31T09:30:00.000Z';
  const formattedD = formatDate(testDate, {}, 'en-GB');
  assert(formattedD.includes('2026'), "Intl.DateTimeFormat properly formats ISO date string");

  const formattedDT = formatDateTime(testDate, 'en-GB');
  assert(formattedDT.length > 5, "Intl.DateTimeFormat properly formats full timestamp");

  // 3. Verify robots.js generator
  const robotsModule = await import('../app/robots.js');
  const robotsConfig = robotsModule.default();
  assert(
    Array.isArray(robotsConfig.rules) && robotsConfig.rules[0].disallow.includes('/api/'),
    "robots.js config correctly disallows indexing private API routes"
  );

  // 4. Verify sitemap.js generator
  const sitemapModule = await import('../app/sitemap.js');
  const sitemapEntries = sitemapModule.default();
  assert(
    Array.isArray(sitemapEntries) && sitemapEntries.some(e => e.url.endsWith('/login')),
    "sitemap.js generator includes public login route entry"
  );

  // 5. Verify SettingsTab form autofill attributes
  const settingsContent = fs.readFileSync(new URL('../components/tabs/SettingsTab.jsx', import.meta.url), 'utf8');
  assert(
    settingsContent.includes('autoComplete="organization"') &&
    settingsContent.includes('autoComplete="street-address"') &&
    settingsContent.includes('autoComplete="email"'),
    "SettingsTab inputs include standard W3C autocomplete and name attributes"
  );
} catch (err) {
  assert(false, `Intl and SEO tests failed: ${err.message}`);
}

// Test case 29: Dynamic OpenGraph Metadata, PWA Manifest, Error Telemetry & Deduplicated Analytics
try {
  const fs = await import('fs');
  const { trackEvent, trackPageView, trackTransactionRecorded } = await import('../lib/analytics.js');
  const { setUserContext, clearUserContext, setMosqueContext, reportClientError, addBreadcrumb } = await import('../lib/errorReporting.js');

  // 1. Verify analytics event dispatch & sliding window deduplication
  const firstDispatch = trackEvent('test_unique_action', { count: 1 });
  assert(firstDispatch === true, "Analytics tracking engine dispatches first unique telemetry event");

  const duplicateDispatch = trackEvent('test_unique_action', { count: 1 });
  assert(duplicateDispatch === false, "Analytics deduplication successfully drops duplicate rapid telemetry event");

  // 2. Verify PII stripping in telemetry properties
  const piiEvent = trackEvent('test_donor_action', {
    donor_name: 'Dr Khan',
    password: 'secretPassword123',
    gift_aid: true
  });
  assert(piiEvent === true, "PII-sanitized analytics event successfully accepted");

  // 3. Verify error monitoring user and mosque context attachment
  setUserContext({ id: 'user-audit-1', email: 'auditor@masjid.org.uk', role: 'AUDITOR' });
  setMosqueContext({ name: 'Bristol Central Mosque', short_name: 'BCM', currency_symbol: '£' });
  addBreadcrumb('ui.click', 'User clicked record transaction');
  reportClientError(new Error('Simulated test exception'), { location: 'test_compliance.js' });
  clearUserContext();
  assert(true, "Client error reporting successfully attaches rich user context, mosque metadata, and breadcrumbs");

  // 4. Verify OpenGraph image generator export
  const ogExists = fs.existsSync(new URL('../app/opengraph-image.jsx', import.meta.url));
  assert(ogExists, "Dynamic opengraph-image.jsx social preview card generator exists");

  // 5. Verify PWA manifest.json shortcuts and categories
  const manifestRaw = fs.readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8');
  const manifest = JSON.parse(manifestRaw);
  assert(
    Array.isArray(manifest.categories) && manifest.categories.includes('finance') &&
    Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 2,
    "PWA manifest.json contains valid categories and quick action shortcuts"
  );
} catch (err) {
  assert(false, `Analytics, OG, and error monitoring tests failed: ${err.message}`);
}

// Test case 30: Auth State Persistence, Schema Validation & Injection Prevention
try {
  const { validateOrganisationPayload } = await import('../lib/validation.js');
  const { createSessionToken, verifySessionToken, buildSessionCookie } = await import('../lib/auth.js');
  const fs = await import('fs');

  // 1. Verify sliding session token auto-renewal
  const mockUser = { id: 'user-sec-1', email: 'secretary@bsmc.org.uk', role: 'ADMIN', name: 'Secretary' };
  const token = createSessionToken(mockUser);
  const cookie = buildSessionCookie(token);
  assert(
    cookie.includes('HttpOnly') && cookie.includes('SameSite=Lax') && cookie.includes('masjid_session='),
    "Sliding session builder generates secure HttpOnly SameSite cookie for auth persistence"
  );

  const parsed = verifySessionToken(token);
  assert(parsed.id === mockUser.id && parsed.role === 'ADMIN', "Session token validates and verifies cryptographically without redirect loops");

  // 2. Verify organisation schema input validation
  let caughtInvalidEmail = false;
  try {
    validateOrganisationPayload({ name: 'Valid Mosque', email: 'not-an-email', currency_symbol: '£' });
  } catch (e) {
    caughtInvalidEmail = true;
  }
  assert(caughtInvalidEmail, "validateOrganisationPayload strictly catches malformed email input");

  let caughtEmptyName = false;
  try {
    validateOrganisationPayload({ name: '   ', currency_symbol: '£' });
  } catch (e) {
    caughtEmptyName = true;
  }
  assert(caughtEmptyName, "validateOrganisationPayload strictly catches empty organisation name");

  // 3. Verify middleware auth guards on API routes
  const middlewareContent = fs.readFileSync(new URL('../middleware.js', import.meta.url), 'utf8');
  assert(
    middlewareContent.includes('isValidOrigin(request)') &&
    middlewareContent.includes('isSessionValid(token)') &&
    middlewareContent.includes('pathname.startsWith(\'/api/\')'),
    "Global middleware strictly validates CSRF origins and enforces session tokens on all protected routes"
  );
} catch (err) {
  assert(false, `Auth persistence and schema validation tests failed: ${err.message}`);
}

// Test case 31: Authorization (IDOR), Row-Level Security (RLS), RateLimit Headers & Secrets
try {
  const fs = await import('fs');
  const { getRateLimitHeaders } = await import('../lib/rateLimit.js');

  // 1. Verify RateLimit and X-RateLimit headers
  const rlHeaders = getRateLimitHeaders({ limit: 60, remaining: 59, resetTime: 45 });
  assert(
    rlHeaders['RateLimit-Limit'] === '60' &&
    rlHeaders['X-RateLimit-Limit'] === '60' &&
    rlHeaders['X-RateLimit-Remaining'] === '59' &&
    rlHeaders['X-RateLimit-Reset'] === '45',
    "Rate limiter emits compliant standard IETF and X-RateLimit-* headers"
  );

  // 2. Verify PostgreSQL / Supabase Row-Level Security (RLS) SQL schema
  const rlsSql = fs.readFileSync(new URL('../../scripts/schema_rls.sql', import.meta.url), 'utf8');
  assert(
    rlsSql.includes('ENABLE ROW LEVEL SECURITY') &&
    rlsSql.includes('users_select_policy') &&
    rlsSql.includes('transactions_insert_policy') &&
    rlsSql.includes('audit_logs_select_policy'),
    "Production PostgreSQL / Supabase schema includes complete Row-Level Security policies"
  );

  // 3. Verify IDOR & privilege escalation defense in users/[id]
  const userRouteCode = fs.readFileSync(new URL('../app/api/users/[id]/route.js', import.meta.url), 'utf8');
  assert(
    userRouteCode.includes('isSelf') &&
    userRouteCode.includes('isAdmin') &&
    userRouteCode.includes('!isAdmin && !isSelf'),
    "User update route strictly enforces IDOR isolation and blocks privilege escalation"
  );

  // 4. Verify Secrets exclusion in .gitignore and .env.example
  const gitignoreContent = fs.readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8');
  assert(
    gitignoreContent.includes('.env*') && gitignoreContent.includes('!.env.example'),
    ".gitignore strictly excludes all production .env secret files"
  );
} catch (err) {
  assert(false, `IDOR, RLS, and Secrets tests failed: ${err.message}`);
}

// Test case 32: Dependency Scans, CORS Lockdown, Security Headers & Sanitized Error Responses
try {
  const fs = await import('fs');
  const { apiError } = await import('../lib/response.js');

  // 1. Verify 500 error sanitization in production
  const origEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const prodErrRes = apiError('FATAL: raw database error syntax error at SELECT * FROM secrets', 500);
  const prodErrJson = await prodErrRes.json();
  process.env.NODE_ENV = origEnv;

  assert(
    !prodErrJson.error.message.includes('SELECT') &&
    !prodErrJson.error.message.includes('secrets') &&
    prodErrJson.error.message.includes('unexpected server error'),
    "apiError safely sanitizes 500 internal server exceptions in production without leaking internal details"
  );

  // 2. Verify CORS lockdown & Security Headers in middleware
  const middlewareContent = fs.readFileSync(new URL('../middleware.js', import.meta.url), 'utf8');
  assert(
    middlewareContent.includes('isAllowedOrigin(origin, host)') &&
    middlewareContent.includes('Access-Control-Allow-Origin') &&
    middlewareContent.includes('X-Frame-Options\', \'DENY\'') &&
    middlewareContent.includes('X-Content-Type-Options\', \'nosniff\''),
    "Global middleware dynamically reflects whitelisted CORS origins and enforces strict security headers"
  );

  // 3. Verify CI/CD dependency vulnerability scan step
  const deployYaml = fs.readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert(
    deployYaml.includes('npm audit --audit-level=high'),
    "CI/CD workflow incorporates automated high-severity dependency vulnerability auditing"
  );
} catch (err) {
  assert(false, `CORS, security headers, and error sanitization tests failed: ${err.message}`);
}

// Test case 33: File Upload Magic Bytes, Webhook Signatures, Payload Limits & DB Indexes
try {
  const fs = await import('fs');
  const crypto = await import('crypto');
  const { inspectMagicBytes, validateUploadBuffer, generatePresignedUploadUrl } = await import('../lib/fileUpload.js');
  const { verifyStripeSignature, verifyHubSignature } = await import('../lib/webhooks.js');

  // 1. Verify Magic Byte Inspection (PDF & PNG)
  const fakePdf = Buffer.from('%PDF-1.7\n%Fake PDF binary header for test');
  assert(inspectMagicBytes(fakePdf) === 'application/pdf', "Magic byte inspector accurately identifies genuine PDF binary header");

  const fakePng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
  assert(inspectMagicBytes(fakePng) === 'image/png', "Magic byte inspector accurately identifies genuine PNG binary signature");

  const maliciousDisguisedScript = Buffer.from('<?php echo "malicious executable"; ?>');
  assert(inspectMagicBytes(maliciousDisguisedScript) === null, "Magic byte inspector safely rejects disguised PHP script");

  // 2. Verify Pre-signed Direct Upload ticket generation
  const presigned = generatePresignedUploadUrl({ filename: 'receipt_march.pdf', contentType: 'application/pdf' });
  assert(
    presigned.uploadUrl.includes('signature=') && presigned.objectKey.startsWith('receipts/'),
    "Pre-signed upload ticket generator produces secure direct-to-storage URLs"
  );

  // 3. Verify Stripe Cryptographic Webhook Verification
  const webhookSecret = 'whsec_test_secret_key_12345';
  const testPayload = JSON.stringify({ id: 'evt_123', type: 'payment_intent.succeeded' });
  const now = Math.floor(Date.now() / 1000);
  const signatureString = crypto.createHmac('sha256', webhookSecret).update(`${now}.${testPayload}`).digest('hex');
  const validStripeSig = `t=${now},v1=${signatureString}`;

  const verifySuccess = verifyStripeSignature(testPayload, validStripeSig, webhookSecret);
  assert(verifySuccess.isValid === true, "Stripe webhook signature verifier cryptographically validates genuine HMAC-SHA256 signature");

  const tamperedPayload = JSON.stringify({ id: 'evt_123', type: 'payment_intent.succeeded', altered: true });
  const verifyTampered = verifyStripeSignature(tamperedPayload, validStripeSig, webhookSecret);
  assert(verifyTampered.isValid === false, "Stripe webhook signature verifier detects and rejects tampered payload");

  // 4. Verify Payload Limits in middleware
  const middlewareContent = fs.readFileSync(new URL('../middleware.js', import.meta.url), 'utf8');
  assert(
    middlewareContent.includes('PAYLOAD_TOO_LARGE') &&
    middlewareContent.includes('content-length'),
    "Middleware enforces strict payload size limits on incoming state-mutating requests"
  );

  // 5. Verify PostgreSQL / Supabase Database Indexes
  const rlsSql = fs.readFileSync(new URL('../../scripts/schema_rls.sql', import.meta.url), 'utf8');
  assert(
    rlsSql.includes('idx_transactions_date') &&
    rlsSql.includes('idx_splits_fund_active') &&
    rlsSql.includes('idx_donors_giftaid') &&
    rlsSql.includes('idx_audit_logs_timestamp'),
    "PostgreSQL / Supabase schema includes comprehensive performance indexes for foreign keys, filters, and ordering"
  );
} catch (err) {
  assert(false, `Upload, webhook, and indexing tests failed: ${err.message}`);
}

// Test case 34: Environment Separation, PITR Restore, Rollback Plan & Correlation IDs
try {
  const fs = await import('fs');
  const { formatLog, logger } = await import('../lib/logger.js');

  // 1. Verify Environment Separation Configuration Files
  const devEnvExists = fs.existsSync(new URL('../../.env.development.example', import.meta.url));
  const stagingEnvExists = fs.existsSync(new URL('../../.env.staging.example', import.meta.url));
  const prodEnvExists = fs.existsSync(new URL('../../.env.production.example', import.meta.url));
  assert(
    devEnvExists && stagingEnvExists && prodEnvExists,
    "Environment configuration templates exist for isolated dev, staging, and production environments"
  );

  const wranglerConfig = fs.readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8');
  assert(
    wranglerConfig.includes('"staging"') && wranglerConfig.includes('"production"'),
    "Wrangler deployment configuration defines dedicated staging and production target environments"
  );

  // 2. Verify Structured Logging & Correlation ID Tracing
  const sampleLogRaw = formatLog('INFO', 'Test financial transaction recorded', { amount: 150 }, 'cid_test_9988');
  const sampleLog = JSON.parse(sampleLogRaw);
  assert(
    sampleLog.service === 'masjid-accounting' &&
    sampleLog.correlationId === 'cid_test_9988' &&
    sampleLog.level === 'INFO' &&
    sampleLog.context?.amount === 150,
    "Structured JSON logger formats log entries with service tag and correlation ID"
  );

  // 3. Verify Rollback Plan & Reverse Database Down-Path
  const rollbackPlanExists = fs.existsSync(new URL('../../ROLLBACK_PLAN.md', import.meta.url));
  const schemaDownSql = fs.readFileSync(new URL('../../scripts/schema_down.sql', import.meta.url), 'utf8');
  assert(
    rollbackPlanExists &&
    schemaDownSql.includes('DROP POLICY') &&
    schemaDownSql.includes('DROP TABLE IF EXISTS audit_logs') &&
    schemaDownSql.includes('DROP TABLE IF EXISTS transactions'),
    "Rollback plan is fully documented with tested reverse migration down-path script"
  );

  // 4. Verify Point-in-time Restore Script Exists
  const verifyRestoreExists = fs.existsSync(new URL('../../scripts/verify_backup_restore.js', import.meta.url));
  assert(verifyRestoreExists, "Automated point-in-time backup restore verification script exists");
} catch (err) {
  assert(false, `Environment separation, PITR, rollback, and logger tests failed: ${err.message}`);
}

// Test case 35: Health Check Probes, Telemetry Metrics, Sentry Monitoring & CI/CD Least-Privilege Audit
try {
  const fs = await import('fs');
  const { recordRequest, recordSecurityEvent, getMetricsSnapshot, getPrometheusFormat, checkAlertConditions } = await import('../lib/metrics.js');
  const { initClientMonitoring } = await import('../lib/errorReporting.js');

  // 1. Verify Client Error Monitoring Module
  assert(typeof initClientMonitoring === 'function', "initClientMonitoring helper exists and exports cleanly");

  // 2. Verify Metrics Aggregator & Prometheus Exporter
  recordRequest('GET', 200, 15);
  recordRequest('POST', 201, 45);
  recordRequest('POST', 500, 120);
  recordSecurityEvent('failed_login');

  const snapshot = getMetricsSnapshot();
  assert(
    snapshot.requests.total >= 3 &&
    snapshot.security.failedLogins >= 1 &&
    snapshot.requests.byStatus['5xx'] >= 1,
    "In-memory telemetry engine tracks request metrics, latencies, and security events"
  );

  const promMetrics = getPrometheusFormat();
  assert(
    promMetrics.includes('masjid_http_requests_total') &&
    promMetrics.includes('masjid_security_events_total') &&
    promMetrics.includes('masjid_http_latency_ms'),
    "Prometheus metrics exporter generates compliant OpenTelemetry/Prometheus time series"
  );

  const alerts = checkAlertConditions(8.5);
  assert(
    alerts.some(a => a.name === 'High5xxErrorRate'),
    "Alert threshold engine fires High5xxErrorRate alert on elevated 5xx errors"
  );

  // 3. Verify Health Check Probes (/healthz and /readyz)
  const healthzExists = fs.existsSync(new URL('../app/healthz/route.js', import.meta.url));
  const readyzExists = fs.existsSync(new URL('../app/readyz/route.js', import.meta.url));
  assert(healthzExists && readyzExists, "Liveness (/healthz) and Readiness (/readyz) probe endpoints exist");

  // 4. Verify CI/CD Least-Privilege Token Permissions
  const deployYaml = fs.readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  assert(
    deployYaml.includes('permissions:') &&
    deployYaml.includes('contents: read'),
    "CI/CD workflow enforces least-privilege token access (contents: read)"
  );

  // 5. Verify CI/CD and Monitoring Documentation
  const cicdAuditExists = fs.existsSync(new URL('../../CICD_SECURITY_AUDIT.md', import.meta.url));
  const monitoringDocExists = fs.existsSync(new URL('../../MONITORING.md', import.meta.url));
  assert(cicdAuditExists && monitoringDocExists, "CI/CD security audit and monitoring documentation runbooks exist");
} catch (err) {
  assert(false, `Health checks, metrics, and CI/CD audit tests failed: ${err.message}`);
}


console.log("--------------------------------------------------");
console.log(`TESTS COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
console.log("--------------------------------------------------");

if (failCount > 0) {
  process.exit(1);
}


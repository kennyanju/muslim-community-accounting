/**
 * Realistic Demonstration & Independent Audit Dataset for UK Mosques
 * Mosque: Bristol Central Mosque & Islamic Centre (UK Registered Charity No. 1189420)
 * 
 * Usage:
 *   node scripts/seed_demo_data.js
 */

import { getD1Database } from '../src/lib/db-client.js';
import { D1Controller } from '../src/lib/d1-controller.js';

console.log("==================================================================");
console.log("SEEDING DEMONSTRATION & AUDIT DATASET: BRISTOL CENTRAL MOSQUE");
console.log("==================================================================");

async function seed() {
  const db = await getD1Database();
  const sqlite = db.getRawDb();
  const adminCtrl = new D1Controller('ADMIN', 'user-sec-1', 'Financial Secretary', 'secretary@bsmc.org.uk', db);

  // 1. Organisation Profile
  console.log("🏛️ 1. Updating Organisation Profile...");
  sqlite.prepare(`
    INSERT INTO organisations (
      id, name, short_name, charity_number, address, currency_symbol,
      country, fiscal_year_start, approval_threshold_pence,
      closed_until_date, receipt_counter, updated_at
    ) VALUES (
      'main',
      'Bristol Central Mosque & Islamic Centre',
      'BSMC',
      '1189420',
      '123-125 St Marks Road, Easton, Bristol, BS5 6HX',
      '£',
      'United Kingdom',
      '04-06',
      100000,
      '2025-04-05',
      1520,
      datetime('now')
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      short_name = excluded.short_name,
      charity_number = excluded.charity_number,
      address = excluded.address,
      currency_symbol = excluded.currency_symbol,
      country = excluded.country,
      fiscal_year_start = excluded.fiscal_year_start,
      approval_threshold_pence = excluded.approval_threshold_pence,
      closed_until_date = excluded.closed_until_date,
      updated_at = datetime('now');
  `).run();

  // 2. Users (Admin, Reviewer, Auditor)
  console.log("👥 2. Seeding Governance Users...");
  const users = [
    { id: 'user-sec-1', name: 'Br. Farooq Patel', email: 'secretary@bsmc.org.uk', role: 'ADMIN', status: 'ACTIVE', password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyz012345' },
    { id: 'user-rev-1', name: 'Dr. Tariq Mahmood', email: 'reviewer@bsmc.org.uk', role: 'REVIEWER', status: 'ACTIVE', password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyz012345' },
    { id: 'user-aud-1', name: 'Sister Aisha Khan (FCCA)', email: 'auditor@bsmc.org.uk', role: 'AUDITOR', status: 'ACTIVE', password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyz012345' }
  ];

  for (const u of users) {
    sqlite.prepare(`
      INSERT INTO users (id, name, email, role, status, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(email) DO UPDATE SET
        name = excluded.name,
        role = excluded.role,
        status = excluded.status,
        password_hash = excluded.password_hash;
    `).run(u.id, u.name, u.email, u.role, u.status, u.password_hash);
  }

  // 3. Standard 7 Islamic Funds
  console.log("💰 3. Initializing 7 Standard Islamic Funds...");
  const funds = [
    { id: 'fund-lillah', name: 'General Lillah Fund', description: 'Unrestricted general mosque operations, utility bills, maintenance', is_restricted: 0 },
    { id: 'fund-building', name: 'Building & Expansion Fund', description: 'Restricted capital donations for prayer hall extension and wudu area renovation', is_restricted: 1 },
    { id: 'fund-zakat', name: 'Zakat Fund', description: 'Strictly restricted obligatory charity disbursed exclusively to eligible Quranic Asnaf', is_restricted: 1 },
    { id: 'fund-fitrana', name: 'Fitrana (Zakat al-Fitr)', description: 'Strictly restricted Ramadan food assistance distributed prior to Eid prayer', is_restricted: 1 },
    { id: 'fund-sadaqah', name: 'Sadaqah Jariyah Fund', description: 'Restricted continuous charity endowments (water wells, Islamic library)', is_restricted: 1 },
    { id: 'fund-madrasah', name: 'Madrasah & Education Fund', description: 'Evening Quranic academy fees, teacher stipends, and syllabus books', is_restricted: 0 },
    { id: 'fund-riba', name: 'Interest/Riba Segregated Fund', description: 'Strictly segregated bank interest purged into public sanitation and community welfare', is_restricted: 1 }
  ];

  for (const f of funds) {
    const existing = sqlite.prepare("SELECT id FROM funds WHERE id = ? OR name = ?").get(f.id, f.name);
    if (existing) {
      sqlite.prepare("UPDATE funds SET name = ?, description = ?, is_restricted = ?, is_archived = 0 WHERE id = ?")
        .run(f.name, f.description, f.is_restricted, existing.id);
    } else {
      sqlite.prepare("INSERT INTO funds (id, name, description, is_restricted, is_archived, created_at) VALUES (?, ?, ?, ?, 0, datetime('now'))")
        .run(f.id, f.name, f.description, f.is_restricted);
    }
  }

  // 4. Donors with UK Gift Aid Declarations
  console.log("📝 4. Seeding Bristol Community Donors & Gift Aid Declarations...");
  const donors = [
    { id: 'donor-1', title: 'Dr.', first_name: 'Zakir', last_name: 'Naik', email: 'zakir.naik@bristol.ac.uk', phone: '07700900101', addr: '42 Greenbank Road', city: 'Bristol', pcode: 'BS5 6EZ', ga: 1 },
    { id: 'donor-2', title: 'Mr.', first_name: 'Mohammed', last_name: 'Iqbal', email: 'm.iqbal@eastonbristol.co.uk', phone: '07700900102', addr: '18 Robertson Road', city: 'Bristol', pcode: 'BS5 6JY', ga: 1 },
    { id: 'donor-3', title: 'Mrs.', first_name: 'Fatima', last_name: 'Al-Mansoor', email: 'fatima.almansoor@nhs.net', phone: '07700900103', addr: '9 Bellevue Road', city: 'Bristol', pcode: 'BS5 6PF', ga: 1 },
    { id: 'donor-4', title: 'Mr.', first_name: 'Usman', last_name: 'Ghani', email: 'usman.ghani@consultant.com', phone: '07700900104', addr: '74 Fishponds Road', city: 'Bristol', pcode: 'BS5 6SA', ga: 1 },
    { id: 'donor-5', title: 'Prof.', first_name: 'Harun', last_name: 'Al-Rashid', email: 'harun.rashid@uwe.ac.uk', phone: '07700900105', addr: '112 Ashley Road', city: 'Bristol', pcode: 'BS6 5NL', ga: 1 },
    { id: 'donor-6', title: 'Sister', first_name: 'Maryam', last_name: 'Siddiqui', email: 'maryam.sid@gmail.com', phone: '07700900106', addr: '25 St Marks Road', city: 'Bristol', pcode: 'BS5 6HX', ga: 1 },
    { id: 'donor-7', title: 'Mr.', first_name: 'Bilal', last_name: 'Habashi', email: 'bilal.habashi@freemail.co.uk', phone: '07700900107', addr: '5 Tudor Road', city: 'Bristol', pcode: 'BS5 6SN', ga: 1 },
    { id: 'donor-8', title: 'Dr.', first_name: 'Salma', last_name: 'Begum', email: 'salma.begum@gp-practice.org.uk', phone: '07700900108', addr: '63 Seymour Road', city: 'Bristol', pcode: 'BS5 0UN', ga: 1 },
    { id: 'donor-9', title: 'Mr.', first_name: 'Rashid', last_name: 'Qureshi', email: 'rashid.q@qureshitrading.co.uk', phone: '07700900109', addr: '14 Warwick Road', city: 'Bristol', pcode: 'BS5 6EF', ga: 1 },
    { id: 'donor-10', title: 'Mr.', first_name: 'Yusuf', last_name: 'Islam', email: 'yusuf.islam@bristolcars.co.uk', phone: '07700900110', addr: '82 Chelsea Park', city: 'Bristol', pcode: 'BS5 6HG', ga: 1 },
    { id: 'donor-11', title: 'Sister', first_name: 'Khadijah', last_name: 'Bint-Ali', email: 'khadijah.ali@bristol.gov.uk', phone: '07700900111', addr: '33 Mogg Street', city: 'Bristol', pcode: 'BS2 9UN', ga: 1 },
    { id: 'donor-12', title: 'Mr.', first_name: 'Hamza', last_name: 'Al-Qurashi', email: 'hamza.q@bathandwells.co.uk', phone: '07700900112', addr: '8 Roman Road', city: 'Bristol', pcode: 'BS5 6SR', ga: 1 },
    { id: 'donor-13', title: 'Mr.', first_name: 'Tariq', last_name: 'Aziz', email: 'tariq.aziz@gloucestershire.co.uk', phone: '07700900113', addr: '51 Camelford Road', city: 'Bristol', pcode: 'BS5 6HW', ga: 1 },
    { id: 'donor-14', title: 'Mr.', first_name: 'Suleman', last_name: 'Dawood', email: 'suleman.dawood@dawoodgroup.co.uk', phone: '07700900114', addr: '19 Clifton Down', city: 'Bristol', pcode: 'BS8 3HT', ga: 1 },
    { id: 'donor-15', title: 'Sister', first_name: 'Amina', last_name: 'Wadud', email: 'amina.w@bristolcommunity.org.uk', phone: '07700900115', addr: '7 Heron Road', city: 'Bristol', pcode: 'BS5 0LT', ga: 1 }
  ];

  for (const d of donors) {
    const fullName = `${d.first_name} ${d.last_name}`;
    sqlite.prepare(`
      INSERT INTO donors (
        id, name, title, first_name, last_name, email, phone,
        address_line_1, city, postcode, gift_aid_eligible,
        gift_aid_declaration_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2024-04-06', datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        title = excluded.title,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        email = excluded.email,
        phone = excluded.phone,
        address_line_1 = excluded.address_line_1,
        city = excluded.city,
        postcode = excluded.postcode,
        gift_aid_eligible = excluded.gift_aid_eligible,
        gift_aid_declaration_date = excluded.gift_aid_declaration_date;
    `).run(d.id, fullName, d.title, d.first_name, d.last_name, d.email, d.phone, d.addr, d.city, d.pcode, d.ga);

    // Ensure Gift Aid declaration record exists in gift_aid_declarations table
    const declId = `gadecl-${d.id}`;
    sqlite.prepare(`
      INSERT INTO gift_aid_declarations (
        id, donor_id, scope, start_date, status, notes, created_at
      ) VALUES (?, ?, 'PAST_PRESENT_FUTURE', '2024-04-06', 'ACTIVE', 'Standard UK HMRC Gift Aid Declaration on file', datetime('now'))
      ON CONFLICT(id) DO NOTHING;
    `).run(declId, d.id);
  }

  // 5. 4 Weeks of Friday Jummah Collections with Denominations and Dual Counters
  console.log("🕌 5. Seeding Friday Jummah Cash Collections & Denomination Counts...");
  const jummahFridays = [
    { date: '2026-08-28', total: 1380.00, count50: 2, count20: 38, count10: 36, count5: 24, coins: 40.00, receipt: 'BSMC-2026-0301' },
    { date: '2026-09-04', total: 1545.50, count50: 3, count20: 45, count10: 32, count5: 25, coins: 50.50, receipt: 'BSMC-2026-0312' },
    { date: '2026-09-11', total: 1420.00, count50: 1, count20: 42, count10: 35, count5: 28, coins: 40.00, receipt: 'BSMC-2026-0324' },
    { date: '2026-09-18', total: 1650.00, count50: 4, count20: 48, count10: 33, count5: 22, coins: 50.00, receipt: 'BSMC-2026-0338' }
  ];

  for (let idx = 0; idx < jummahFridays.length; idx++) {
    const jf = jummahFridays[idx];
    const txId = `tx-jummah-demo-${idx + 1}`;
    const totalPence = Math.round(jf.total * 100);
    const buildingPence = Math.round(totalPence * 0.60);
    const lillahPence = totalPence - buildingPence;

    sqlite.prepare(`
      INSERT INTO transactions (
        id, receipt_number, type, status, method, total_amount,
        transaction_date, reference_note, category, is_jummah,
        reconciled, bank_statement_ref, created_by, created_at
      ) VALUES (
        ?, ?, 'INCOME', 'BANKED', 'CASH', ?,
        ?, 'Friday Jummah Congregation Bucket Collection', 'Friday Jummah', 1,
        1, 'LLOYDS-CASH-DEP-SEP26', 'user-sec-1', datetime('now')
      ) ON CONFLICT(id) DO NOTHING;
    `).run(txId, jf.receipt, totalPence, jf.date);

    // Splits: 60% Building Fund, 40% General Lillah
    sqlite.prepare(`
      INSERT INTO transaction_splits (id, transaction_id, fund_id, amount, is_voided, created_at)
      VALUES (?, ?, 'fund-building', ?, 0, datetime('now'))
      ON CONFLICT(id) DO NOTHING;
    `).run(`spl-jmb-${idx + 1}`, txId, buildingPence);

    sqlite.prepare(`
      INSERT INTO transaction_splits (id, transaction_id, fund_id, amount, is_voided, created_at)
      VALUES (?, ?, 'fund-lillah', ?, 0, datetime('now'))
      ON CONFLICT(id) DO NOTHING;
    `).run(`spl-jml-${idx + 1}`, txId, lillahPence);

    // Dual-witness Denomination Counting Sheet
    sqlite.prepare(`
      INSERT INTO jummah_collections (
        id, transaction_id, collection_date, notes_50_count, notes_20_count,
        notes_10_count, notes_5_count, coins_total_pence, total_pence,
        counter_1_name, counter_2_name, notes, created_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        'Br. Farooq Patel (Sec)', 'Hafiz Tariq Mahmood (Imam)', 'Counted in Committee Safe Room & verified against safe deposit bag', datetime('now')
      ) ON CONFLICT(id) DO NOTHING;
    `).run(
      `jcol-demo-${idx + 1}`, txId, jf.date, jf.count50, jf.count20,
      jf.count10, jf.count5, Math.round(jf.coins * 100), totalPence
    );
  }

  // 6. Online Donor Standing Orders with Gift Aid
  console.log("💳 6. Seeding Standing Orders & Gift Aid Covered Donations...");
  const onlineDonations = [
    { id: 'tx-onl-1', donorId: 'donor-1', date: '2026-09-01', amount: 200.00, fund: 'fund-building', receipt: 'BSMC-2026-0305' },
    { id: 'tx-onl-2', donorId: 'donor-2', date: '2026-09-02', amount: 150.00, fund: 'fund-lillah', receipt: 'BSMC-2026-0308' },
    { id: 'tx-onl-3', donorId: 'donor-3', date: '2026-09-05', amount: 500.00, fund: 'fund-zakat', receipt: 'BSMC-2026-0315' },
    { id: 'tx-onl-4', donorId: 'donor-4', date: '2026-09-08', amount: 100.00, fund: 'fund-sadaqah', receipt: 'BSMC-2026-0320' },
    { id: 'tx-onl-5', donorId: 'donor-5', date: '2026-09-10', amount: 250.00, fund: 'fund-building', receipt: 'BSMC-2026-0322' },
    { id: 'tx-onl-6', donorId: 'donor-8', date: '2026-09-14', amount: 300.00, fund: 'fund-lillah', receipt: 'BSMC-2026-0328' },
    { id: 'tx-onl-7', donorId: 'donor-9', date: '2026-09-15', amount: 120.00, fund: 'fund-building', receipt: 'BSMC-2026-0330' },
    { id: 'tx-onl-8', donorId: 'donor-10', date: '2026-09-18', amount: 400.00, fund: 'fund-zakat', receipt: 'BSMC-2026-0335' }
  ];

  for (const od of onlineDonations) {
    const pence = Math.round(od.amount * 100);
    sqlite.prepare(`
      INSERT INTO transactions (
        id, receipt_number, type, status, method, total_amount,
        transaction_date, donor_id, reference_note, category, gift_aid,
        reconciled, bank_statement_ref, created_by, created_at
      ) VALUES (
        ?, ?, 'INCOME', 'BANKED', 'BANK_TRANSFER', ?,
        ?, ?, 'Standing Order / Direct Transfer', 'Donation', 1,
        0, NULL, 'user-sec-1', datetime('now')
      ) ON CONFLICT(id) DO NOTHING;
    `).run(od.id, od.receipt, pence, od.date, od.donorId);

    sqlite.prepare(`
      INSERT INTO transaction_splits (id, transaction_id, fund_id, amount, is_voided, created_at)
      VALUES (?, ?, ?, ?, 0, datetime('now'))
      ON CONFLICT(id) DO NOTHING;
    `).run(`spl-${od.id}`, od.id, od.fund, pence);
  }

  // 7. Stripe Online Donation with Segregated Processing Fee
  console.log("⚡ 7. Seeding Stripe Gross Donation & Segregated Processing Fee Expense...");
  const stripeTxId = 'tx-stripe-gross-demo';
  const stripeGrossPence = 10000; // £100.00
  const stripeFeePence = 250;     // £2.50 fee

  sqlite.prepare(`
    INSERT INTO transactions (
      id, receipt_number, type, status, method, total_amount,
      transaction_date, donor_id, reference_note, category, gift_aid,
      reconciled, bank_statement_ref, created_by, created_at
    ) VALUES (
      ?, 'BSMC-2026-0340', 'INCOME', 'BANKED', 'ONLINE', ?,
      '2026-09-16', 'donor-6', 'Online Website Card Donation (Stripe ch_3P7x8)', 'Donation', 1,
      1, 'STRIPE-PAYOUT-SEP26', 'user-sec-1', datetime('now')
    ) ON CONFLICT(id) DO NOTHING;
  `).run(stripeTxId, stripeGrossPence);

  sqlite.prepare(`
    INSERT INTO transaction_splits (id, transaction_id, fund_id, amount, is_voided, created_at)
    VALUES ('spl-stripe-gross', ?, 'fund-building', ?, 0, datetime('now'))
    ON CONFLICT(id) DO NOTHING;
  `).run(stripeTxId, stripeGrossPence);

  // Stripe processing fee charged strictly to General Lillah Fund
  const stripeFeeTxId = 'tx-stripe-fee-demo';
  sqlite.prepare(`
    INSERT INTO transactions (
      id, receipt_number, type, status, method, total_amount,
      transaction_date, donor_id, reference_note, category, gift_aid,
      reconciled, bank_statement_ref, created_by, created_at
    ) VALUES (
      ?, 'BSMC-2026-0341', 'EXPENSE', 'BANKED', 'ONLINE', ?,
      '2026-09-16', NULL, 'Stripe Merchant Processing Fee (ch_3P7x8 - £100 donation)', 'Bank Charges', 0,
      1, 'STRIPE-PAYOUT-SEP26', 'user-sec-1', datetime('now')
    ) ON CONFLICT(id) DO NOTHING;
  `).run(stripeFeeTxId, stripeFeePence);

  sqlite.prepare(`
    INSERT INTO transaction_splits (id, transaction_id, fund_id, amount, is_voided, created_at)
    VALUES ('spl-stripe-fee', ?, 'fund-lillah', ?, 0, datetime('now'))
    ON CONFLICT(id) DO NOTHING;
  `).run(stripeFeeTxId, stripeFeePence);

  // 8. Asnaf Zakat Distributions to Verified Beneficiaries
  console.log("🤝 8. Seeding Asnaf Zakat Disbursements...");
  const zakatPayouts = [
    { id: 'tx-zakat-out-1', name: 'Brother Ahmed K.', category: 'FUQARA', amount: 350.00, date: '2026-09-08', receipt: 'BSMC-2026-0321', note: 'Emergency hardship grant for destitute refugee family accommodation' },
    { id: 'tx-zakat-out-2', name: 'Sister Safia M.', category: 'MASAKEEN', amount: 200.00, date: '2026-09-12', receipt: 'BSMC-2026-0326', note: 'Essential winter utilities & grocery support for widowed mother of 3' },
    { id: 'tx-zakat-out-3', name: 'Brother Tariq B.', category: 'GHARIMEEN', amount: 450.00, date: '2026-09-17', receipt: 'BSMC-2026-0336', note: 'Debt relief settlement direct to housing association to prevent eviction' }
  ];

  for (const zp of zakatPayouts) {
    const pence = Math.round(zp.amount * 100);
    sqlite.prepare(`
      INSERT INTO transactions (
        id, receipt_number, type, status, method, total_amount,
        transaction_date, reference_note, category, gift_aid,
        reconciled, bank_statement_ref, created_by, created_at
      ) VALUES (
        ?, ?, 'EXPENSE', 'BANKED', 'BANK_TRANSFER', ?,
        ?, ?, 'Charitable Payout', 0,
        1, 'LLOYDS-SEP-2026', 'user-sec-1', datetime('now')
      ) ON CONFLICT(id) DO NOTHING;
    `).run(zp.id, zp.receipt, pence, zp.date, zp.note);

    sqlite.prepare(`
      INSERT INTO transaction_splits (id, transaction_id, fund_id, amount, is_voided, created_at)
      VALUES (?, ?, 'fund-zakat', ?, 0, datetime('now'))
      ON CONFLICT(id) DO NOTHING;
    `).run(`spl-${zp.id}`, zp.id, pence);

    sqlite.prepare(`
      INSERT INTO asnaf_records (
        id, transaction_id, beneficiary_name, asnaf_category,
        amount, distribution_date, witness_name, verification_notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'Br. Farooq Patel', ?, datetime('now'))
      ON CONFLICT(id) DO NOTHING;
    `).run(`asnaf-${zp.id}`, zp.id, zp.name, zp.category, pence, zp.date, zp.note);
  }

  // 9. High-Value Expenses: Dual-Approval Workflow Demonstration
  console.log("⚖️ 9. Seeding Dual-Approval High-Value Expenses (>£1,000)...");
  
  // (a) Approved expense: Minbar Restoration (£1,600.00)
  const approvedExpId = 'tx-exp-approved-demo';
  const approvedExpPence = 160000;
  sqlite.prepare(`
    INSERT INTO transactions (
      id, receipt_number, type, status, method, total_amount,
      transaction_date, reference_note, category, approval_status,
      approved_by, approved_at, reconciled, bank_statement_ref,
      created_by, created_at
    ) VALUES (
      ?, 'BSMC-2026-0310', 'EXPENSE', 'BANKED', 'BANK_TRANSFER', ?,
      '2026-09-03', 'Main Hall Minbar & Acoustic Wall Panelling Restoration', 'Repairs & Maintenance', 'APPROVED',
      'user-rev-1', '2026-09-03 14:30:00', 1, 'LLOYDS-SEP-2026',
      'user-sec-1', datetime('now')
    ) ON CONFLICT(id) DO NOTHING;
  `).run(approvedExpId, approvedExpPence);

  sqlite.prepare(`
    INSERT INTO transaction_splits (id, transaction_id, fund_id, amount, is_voided, created_at)
    VALUES ('spl-exp-appr', ?, 'fund-building', ?, 0, datetime('now'))
    ON CONFLICT(id) DO NOTHING;
  `).run(approvedExpId, approvedExpPence);

  // (b) Pending dual-approval expense: Roof Repair (£2,450.00)
  const pendingExpId = 'tx-exp-pending-demo';
  const pendingExpPence = 245000;
  sqlite.prepare(`
    INSERT INTO transactions (
      id, receipt_number, type, status, method, total_amount,
      transaction_date, reference_note, category, approval_status,
      created_by, created_at
    ) VALUES (
      ?, 'BSMC-2026-0345', 'EXPENSE', 'PENDING_APPROVAL', 'BANK_TRANSFER', ?,
      '2026-09-20', 'Urgent Flat Roof Waterproofing & Drainage Overhaul (Apex Roofing Ltd)', 'Repairs & Maintenance', 'PENDING',
      'user-sec-1', datetime('now')
    ) ON CONFLICT(id) DO NOTHING;
  `).run(pendingExpId, pendingExpPence);

  sqlite.prepare(`
    INSERT INTO transaction_splits (id, transaction_id, fund_id, amount, is_voided, created_at)
    VALUES ('spl-exp-pend', ?, 'fund-building', ?, 0, datetime('now'))
    ON CONFLICT(id) DO NOTHING;
  `).run(pendingExpId, pendingExpPence);

  // 10. Annual Fund Budgets for 2026
  console.log("📊 10. Seeding Fiscal Year 2026 Annual Operating Budgets...");
  const budgets = [
    { fundId: 'fund-lillah', target: 35000.00 },
    { fundId: 'fund-building', target: 50000.00 },
    { fundId: 'fund-zakat', target: 20000.00 },
    { fundId: 'fund-fitrana', target: 5000.00 },
    { fundId: 'fund-madrasah', target: 15000.00 }
  ];

  for (const b of budgets) {
    sqlite.prepare(`
      INSERT INTO budgets (id, fund_id, fiscal_year, target_amount, updated_at)
      VALUES (?, ?, 2026, ?, datetime('now'))
      ON CONFLICT(fund_id, fiscal_year) DO UPDATE SET
        target_amount = excluded.target_amount,
        updated_at = datetime('now');
    `).run(`bdg-${b.fundId}-2026`, b.fundId, Math.round(b.target * 100));
  }

  // Summary Metrics Output
  const txCount = sqlite.prepare("SELECT count(*) as count FROM transactions").get()?.count || 0;
  const donorCount = sqlite.prepare("SELECT count(*) as count FROM donors").get()?.count || 0;
  const fundBalances = await adminCtrl.getBalances();

  console.log("==================================================================");
  console.log("🎉 SEED COMPLETED SUCCESSFULLY!");
  console.log("==================================================================");
  console.log(`🏛️ Organisation: Bristol Central Mosque & Islamic Centre (Charity No. 1189420)`);
  console.log(`🔒 Closed Accounting Period: Through 2025-04-05 (Audited & Locked)`);
  console.log(`👥 Registered Donors: ${donorCount} (with active Gift Aid declarations)`);
  console.log(`📑 Total Ledger Transactions: ${txCount}`);
  console.log("--------------------------------------------------");
  console.log("ACTIVE FUND BALANCES:");
  fundBalances.forEach(fb => {
    const typeLabel = fb.isRestricted ? '[RESTRICTED]' : '[UNRESTRICTED]';
    console.log(`  - ${fb.fundName.padEnd(30)} £${fb.balance.toFixed(2).padStart(9)}  ${typeLabel}`);
  });
  console.log("--------------------------------------------------");
  console.log("DEMONSTRATION USERS:");
  console.log("  - secretary@bsmc.org.uk  (Role: ADMIN / Financial Secretary)");
  console.log("  - reviewer@bsmc.org.uk   (Role: REVIEWER / Trustee Second Signatory)");
  console.log("  - auditor@bsmc.org.uk    (Role: AUDITOR / Independent Examiner)");
  console.log("==================================================================");
}

seed().catch(err => {
  console.error("❌ Seed script failed:", err);
  process.exit(1);
});

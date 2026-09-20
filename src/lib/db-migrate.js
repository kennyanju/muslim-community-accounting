import fs from 'fs';
import path from 'path';
import { getD1Database } from './db-client.js';
import { splitDonorName } from './validation.js';

export async function migrateJsonToD1(jsonPath, targetD1) {
  const resolvedPath = jsonPath || path.join(process.cwd(), 'src/data/db.json');
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Migration source file not found at: ${resolvedPath}`);
  }

  const raw = fs.readFileSync(resolvedPath, 'utf8');
  const data = JSON.parse(raw);
  const db = targetD1 || await getD1Database();

  console.log('🔄 Starting migration from db.json to Cloudflare D1 / SQLite...');

  // 1. Organisation
  if (data.organisation) {
    const org = data.organisation;
    await db.prepare(`
      INSERT INTO organisations (
        id, name, short_name, tagline, charity_number, address, email, phone,
        currency_symbol, country, receipt_counter, fiscal_year_start,
        zakat_surplus_alert_pence, zakat_reserve_min_pence, large_donation_threshold_pence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        short_name = excluded.short_name,
        tagline = excluded.tagline,
        charity_number = excluded.charity_number,
        address = excluded.address,
        email = excluded.email,
        phone = excluded.phone,
        currency_symbol = excluded.currency_symbol,
        country = excluded.country,
        receipt_counter = excluded.receipt_counter,
        fiscal_year_start = excluded.fiscal_year_start,
        zakat_surplus_alert_pence = excluded.zakat_surplus_alert_pence,
        zakat_reserve_min_pence = excluded.zakat_reserve_min_pence,
        large_donation_threshold_pence = excluded.large_donation_threshold_pence,
        updated_at = datetime('now')
    `).bind(
      'main',
      org.name || 'Bristol South Muslim Community',
      org.short_name || 'BSMC',
      org.tagline || 'Bristol South Mosque & Islamic Centre',
      org.charity_number || '1234567',
      org.address || '100 Mosque Road, Bristol, BS3 1AB',
      org.email || 'finance@bsmc.org.uk',
      org.phone || '0117 000 0000',
      org.currency_symbol || '£',
      org.country || 'United Kingdom',
      data.receipt_counter || 1,
      org.fiscal_year_start || '04-06',
      org.zakat_surplus_alert_pence || 500000,
      org.zakat_reserve_min_pence || 20000,
      org.large_donation_threshold_pence || 50000
    ).run();
    console.log('  ✅ Migrated organisation profile');
  }

  // 2. Users
  if (Array.isArray(data.users)) {
    for (const u of data.users) {
      await db.prepare(`
        INSERT INTO users (id, email, name, role, status, password_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          role = excluded.role,
          status = excluded.status,
          password_hash = excluded.password_hash
      `).bind(
        u.id,
        u.email,
        u.name || u.email.split('@')[0],
        u.role || 'AUDITOR',
        u.status || 'ACTIVE',
        u.password_hash,
        u.created_at || new Date().toISOString()
      ).run();
    }
    console.log(`  ✅ Migrated ${data.users.length} users`);
  }

  // 3. Funds
  if (Array.isArray(data.funds)) {
    for (const f of data.funds) {
      await db.prepare(`
        INSERT INTO funds (id, name, is_restricted, description, is_archived, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          is_restricted = excluded.is_restricted,
          description = excluded.description,
          is_archived = excluded.is_archived
      `).bind(
        f.id,
        f.name,
        f.is_restricted ? 1 : 0,
        f.description || '',
        f.is_archived ? 1 : 0,
        f.created_at || new Date().toISOString()
      ).run();
    }
    console.log(`  ✅ Migrated ${data.funds.length} funds`);
  }

  // 4. Donors (Structured Names - Item #16)
  if (Array.isArray(data.donors)) {
    for (const d of data.donors) {
      const { title, firstName, lastName } = splitDonorName(d.name || '');
      await db.prepare(`
        INSERT INTO donors (
          id, name, title, first_name, last_name, email, phone, is_anonymous, gift_aid_eligible,
          gift_aid_declaration_date, address_line_1, address_line_2, city, postcode, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          title = excluded.title,
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          email = excluded.email,
          phone = excluded.phone,
          gift_aid_eligible = excluded.gift_aid_eligible,
          address_line_1 = excluded.address_line_1,
          address_line_2 = excluded.address_line_2,
          city = excluded.city,
          postcode = excluded.postcode
      `).bind(
        d.id,
        d.name,
        d.title || title,
        d.first_name || firstName,
        d.last_name || lastName,
        d.email || '',
        d.phone || '',
        d.is_anonymous ? 1 : 0,
        d.gift_aid_eligible ? 1 : 0,
        d.gift_aid_declaration_date || null,
        d.address_line_1 || '',
        d.address_line_2 || '',
        d.city || '',
        d.postcode || '',
        d.notes || '',
        d.created_at || new Date().toISOString()
      ).run();
    }
    console.log(`  ✅ Migrated ${data.donors.length} donors`);
  }

  // 5. Transactions (Integer Pence Precision - Item #22, Jummah tracking - Item #12)
  if (Array.isArray(data.transactions)) {
    for (const t of data.transactions) {
      const totalAmountPence = Math.round(parseFloat(t.total_amount || 0) * 100);
      const isJummah = (t.reference_note?.toLowerCase().includes('jummah') || t.category?.toLowerCase().includes('jummah')) ? 1 : 0;

      await db.prepare(`
        INSERT INTO transactions (
          id, type, status, method, total_amount, transaction_date, donor_id,
          receipt_url, receipt_number, reference_note, category, gift_aid,
          notes, reconciled, is_jummah, void_reason, voided_at, voided_by, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          total_amount = excluded.total_amount,
          reconciled = excluded.reconciled,
          is_jummah = excluded.is_jummah,
          void_reason = excluded.void_reason,
          voided_at = excluded.voided_at,
          voided_by = excluded.voided_by,
          updated_at = datetime('now')
      `).bind(
        t.id,
        t.type,
        t.status || 'PENDING',
        t.method || 'CASH',
        totalAmountPence,
        t.transaction_date || t.date || new Date().toISOString(),
        t.donor_id || 'anonymous',
        t.receipt_url || '',
        t.receipt_number || '',
        t.reference_note || '',
        t.category || 'Donation',
        t.giftAid || t.gift_aid ? 1 : 0,
        t.notes || '',
        t.reconciled ? 1 : 0,
        isJummah,
        t.void_reason || null,
        t.voided_at || null,
        t.voided_by || null,
        t.created_by || 'system-migration',
        t.created_at || new Date().toISOString()
      ).run();
    }
    console.log(`  ✅ Migrated ${data.transactions.length} transactions`);
  }

  // 6. Transaction Splits (Integer Pence Precision - Item #22)
  if (Array.isArray(data.transaction_splits)) {
    for (const s of data.transaction_splits) {
      const splitAmountPence = Math.round(parseFloat(s.amount || 0) * 100);

      await db.prepare(`
        INSERT INTO transaction_splits (
          id, transaction_id, fund_id, amount, is_voided, voided_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          amount = excluded.amount,
          is_voided = excluded.is_voided,
          voided_at = excluded.voided_at
      `).bind(
        s.id,
        s.transaction_id,
        s.fund_id,
        splitAmountPence,
        s.is_voided ? 1 : 0,
        s.voided_at || null,
        s.created_at || new Date().toISOString()
      ).run();
    }
    console.log(`  ✅ Migrated ${data.transaction_splits.length} transaction splits`);
  }

  // 7. Budgets (Integer Pence Precision - Item #22)
  if (Array.isArray(data.budgets)) {
    for (const b of data.budgets) {
      const targetPence = Math.round(parseFloat(b.target_amount || 0) * 100);
      const maxSpendPence = b.max_spend_limit ? Math.round(parseFloat(b.max_spend_limit) * 100) : null;
      await db.prepare(`
        INSERT INTO budgets (id, fund_id, fiscal_year, target_amount, max_spend_limit, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(fund_id, fiscal_year) DO UPDATE SET
          target_amount = excluded.target_amount,
          max_spend_limit = excluded.max_spend_limit,
          notes = excluded.notes
      `).bind(
        b.id || `bud-${b.fund_id}-${b.fiscal_year}`,
        b.fund_id,
        b.fiscal_year,
        targetPence,
        maxSpendPence,
        b.notes || ''
      ).run();
    }
    console.log(`  ✅ Migrated ${data.budgets.length} budgets`);
  }

  // 8. Asnaf Records (Integer Pence Precision - Item #22)
  if (Array.isArray(data.asnaf_records)) {
    let migratedCount = 0;
    for (const a of data.asnaf_records) {
      // Ensure source transaction exists to satisfy foreign key constraint
      const txExists = await db.prepare('SELECT id FROM transactions WHERE id = ?').bind(a.transaction_id).first();
      if (!txExists) {
        continue;
      }
      const asnafAmountPence = Math.round(parseFloat(a.amount || 0) * 100);
      await db.prepare(`
        INSERT INTO asnaf_records (
          id, transaction_id, beneficiary_name, asnaf_category, amount, distribution_date,
          witness_name, verification_notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          amount = excluded.amount,
          asnaf_category = excluded.asnaf_category
      `).bind(
        a.id,
        a.transaction_id,
        a.beneficiary_name,
        a.asnaf_category,
        asnafAmountPence,
        a.distribution_date,
        a.witness_name || '',
        a.verification_notes || ''
      ).run();
      migratedCount++;
    }
    console.log(`  ✅ Migrated ${migratedCount} asnaf records`);
  }


  // 9. Audit Logs
  if (Array.isArray(data.audit_logs)) {
    for (const a of data.audit_logs) {
      await db.prepare(`
        INSERT INTO audit_logs (
          id, table_name, record_id, action, user_id, user_email, user_name, metadata, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `).bind(
        a.id,
        a.table_name || 'unknown',
        a.record_id || 'unknown',
        a.action || 'INSERT',
        a.user_id || 'system',
        a.user_email || 'system',
        a.user_name || 'System',
        typeof a.metadata === 'string' ? a.metadata : JSON.stringify(a.metadata || {}),
        a.timestamp || new Date().toISOString()
      ).run();
    }
    console.log(`  ✅ Migrated ${data.audit_logs.length} audit logs`);
  }

  console.log('🎉 Cloudflare D1 Migration completed successfully!');
  return true;
}

// Run directly if invoked as script
if (process.argv[1] && (process.argv[1].endsWith('db-migrate.js') || process.argv[1].includes('migrate'))) {
  migrateJsonToD1().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });
}

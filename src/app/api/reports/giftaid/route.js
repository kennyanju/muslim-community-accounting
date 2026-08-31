import { readDB } from '@/lib/db';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { apiError } from '@/lib/response';
import { validateDateRange } from '@/lib/validation';
import { sanitizeCsvCell } from '@/lib/sanitize';
import { guardRateLimit } from '@/lib/rateLimit';
import { config } from '@/lib/config';

export async function GET(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized: Authentication required', 401, { code: 'UNAUTHORIZED' });
  }

  // Restrict sensitive donor Gift Aid PII export to Financial Secretary (Admin) and Auditor
  const authCheck = requireRole(user, ['ADMIN', 'AUDITOR']);
  if (!authCheck.ok) {
    return apiError(authCheck.message, authCheck.status, { code: 'FORBIDDEN' });
  }

  // Rate limit export requests
  const rateGuard = guardRateLimit(request, 'giftaid_export', config.rateLimit.exportMaxAttempts, config.rateLimit.exportWindowMs, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  // Validate date range query params
  let dateRange;
  try {
    dateRange = validateDateRange(dateFrom, dateTo);
  } catch (err) {
    return apiError(err.message, 400, { code: 'INVALID_QUERY_PARAMETER', field: err.field });
  }

  const db = readDB();
  const org = db.organisation || {};
  
  // HMRC Standard Schedule Header Structure (H2)
  let csvContent = "Title,First Name,Last Name,House name or number,Postcode,Donation Date,Amount,Gift Aid Claimed (25%)\n";
  
  let eligibleTx = (db.transactions || []).filter(tx => 
    tx.type === 'INCOME' && 
    tx.status !== 'VOIDED' && 
    tx.status !== 'FAILED' && 
    tx.giftAid
  );

  // Timestamp-based date filtering using validated range
  if (dateRange.fromTime) {
    eligibleTx = eligibleTx.filter(t => {
      const txTime = new Date(t.transaction_date).getTime();
      return !isNaN(txTime) ? txTime >= dateRange.fromTime : t.transaction_date >= dateFrom;
    });
  }
  if (dateRange.toTime) {
    eligibleTx = eligibleTx.filter(t => {
      const txTime = new Date(t.transaction_date).getTime();
      return !isNaN(txTime) ? txTime <= dateRange.toTime : t.transaction_date <= dateTo;
    });
  }

  // Pre-index donors by ID for O(1) lookup
  const donorMap = new Map((db.donors || []).map(d => [d.id, d]));

  eligibleTx.forEach(tx => {
    const donor = donorMap.get(tx.donor_id);
    if (donor && donor.gift_aid_eligible && donor.address_line_1 && donor.postcode) {
      const rawName = (donor.name || '').trim();
      const parts = rawName.split(' ');
      
      let title = '';
      let firstName = parts[0] || '';
      let lastName = parts.slice(1).join(' ') || '';

      const knownTitles = ['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'haji', 'sheikh', 'imam', 'ustadh'];
      if (parts.length > 2 && knownTitles.includes(parts[0].toLowerCase().replace('.', ''))) {
        title = parts[0];
        firstName = parts[1] || '';
        lastName = parts.slice(2).join(' ') || '';
      }

      const house = donor.address_line_1.split(',')[0].trim();
      const pcode = donor.postcode.trim().toUpperCase();
      const amount = parseFloat(tx.total_amount).toFixed(2);
      const taxClaimed = (parseFloat(tx.total_amount) * 0.25).toFixed(2);
      
      const row = [
        sanitizeCsvCell(title),
        sanitizeCsvCell(firstName),
        sanitizeCsvCell(lastName),
        sanitizeCsvCell(house),
        sanitizeCsvCell(pcode),
        sanitizeCsvCell(tx.transaction_date),
        amount,
        taxClaimed
      ];

      csvContent += row.join(',') + '\n';
    }
  });

  const shortName = (org.short_name || 'MASJID').replace(/[^a-zA-Z0-9]/g, '_');
  const year = new Date().getFullYear();

  return new Response(csvContent, {
    headers: {
      ...rateGuard.headers,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename=HMRC_GiftAid_Schedule_${shortName}_${year}.csv`
    }
  });
}

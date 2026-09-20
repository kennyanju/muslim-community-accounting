import { D1Controller } from '@/lib/d1-controller';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { apiError } from '@/lib/response';
import { validateDateRange, splitDonorName, calculateGiftAidClaim, getFiscalYearBounds } from '@/lib/validation';
import { sanitizeCsvCell } from '@/lib/sanitize';
import { guardRateLimit } from '@/lib/rateLimit';
import { config } from '@/lib/config';

export async function GET(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized: Authentication required', 401, { code: 'UNAUTHORIZED' });
  }

  // Restrict sensitive donor Gift Aid PII export to Financial Secretary (Admin) and Auditor
  const authCheck = requireRole(user, ['ADMIN', 'AUDITOR']);
  if (!authCheck.ok) {
    return apiError(authCheck.message, authCheck.status, { code: 'FORBIDDEN' });
  }

  // Rate limit export requests
  const rateGuard = await guardRateLimit(request, 'giftaid_export', config.rateLimit.exportMaxAttempts, config.rateLimit.exportWindowMs, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }

  const { searchParams } = new URL(request.url);
  let dateFrom = searchParams.get('dateFrom');
  let dateTo = searchParams.get('dateTo');
  const fiscalYearParam = searchParams.get('fiscal_year');

  const controller = new D1Controller(user.role, user.id, user.name, user.email);
  const org = await controller.getOrganisation();

  // Item #25: UK Charity Fiscal Year default
  if (!dateFrom && !dateTo) {
    const fyBounds = getFiscalYearBounds(new Date(), org.fiscal_year_start || '04-06');
    if (fiscalYearParam) {
      dateFrom = `${fiscalYearParam}-${org.fiscal_year_start || '04-06'}`;
      dateTo = `${parseInt(fiscalYearParam, 10) + 1}-${org.fiscal_year_start || '04-06'}`;
    } else {
      dateFrom = fyBounds.startDate;
      dateTo = fyBounds.endDate;
    }
  }

  // Validate date range query params
  let dateRange;
  try {
    dateRange = validateDateRange(dateFrom, dateTo);
  } catch (err) {
    return apiError(err.message, 400, { code: 'INVALID_QUERY_PARAMETER', field: err.field });
  }

  // HMRC Standard Schedule Header Structure
  let csvContent = "Title,First Name,Last Name,House name or number,Postcode,Donation Date,Amount,Gift Aid Claimed\n";

  const transactions = await controller.getTransactions({
    type: 'INCOME',
    dateFrom,
    dateTo
  });

  const eligibleTx = transactions.filter(tx =>
    tx.status !== 'VOIDED' &&
    tx.status !== 'FAILED' &&
    tx.gift_aid
  );

  const donors = await controller.getDonors();
  const donorMap = new Map(donors.map(d => [d.id, d]));

  eligibleTx.forEach(tx => {
    const donor = donorMap.get(tx.donor_id);
    if (donor && donor.gift_aid_eligible && donor.address_line_1 && donor.postcode) {
      // Structured name extraction (Item #16)
      let title = donor.title;
      let firstName = donor.first_name;
      let lastName = donor.last_name;

      if (!firstName && !lastName) {
        const parsed = splitDonorName(donor.name || '');
        title = parsed.title;
        firstName = parsed.firstName;
        lastName = parsed.lastName;
      }

      const house = donor.address_line_1.split(',')[0].trim();
      const pcode = donor.postcode.trim().toUpperCase();
      const amtNum = parseFloat(tx.total_amount) || 0;
      const amount = amtNum.toFixed(2);
      const taxClaimed = calculateGiftAidClaim(amtNum).toFixed(2); // Item #5: HMRC rate formula

      const row = [
        sanitizeCsvCell(title || ''),
        sanitizeCsvCell(firstName || ''),
        sanitizeCsvCell(lastName || ''),
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
  const year = dateFrom ? dateFrom.substring(0, 4) : new Date().getFullYear();

  return new Response(csvContent, {
    headers: {
      ...rateGuard.headers,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename=HMRC_GiftAid_Schedule_${shortName}_${year}.csv`
    }
  });
}

import { D1Controller } from '@/lib/d1-controller';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { apiError, apiSuccess } from '@/lib/response';
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
  const claimId = searchParams.get('claim_id');
  const format = searchParams.get('format');
  let dateFrom = searchParams.get('dateFrom');
  let dateTo = searchParams.get('dateTo');
  const fiscalYearParam = searchParams.get('fiscal_year');

  const controller = new D1Controller(user.role, user.id, user.name, user.email);
  const org = await controller.getOrganisation();

  // 1. Export or inspect an existing submitted claim batch
  if (claimId) {
    const claimBatch = await controller.getGiftAidClaimById(claimId);
    if (!claimBatch) {
      return apiError('Gift Aid claim batch not found', 404, { code: 'NOT_FOUND' });
    }

    if (format === 'json') {
      return apiSuccess(claimBatch, { headers: rateGuard.headers });
    }

    let csvContent = "Title,First Name,Last Name,House name or number,Postcode,Donation Date,Amount,Gift Aid Claimed\n";
    (claimBatch.items || []).forEach(tx => {
      let title = tx.donor_title;
      let firstName = tx.donor_first_name;
      let lastName = tx.donor_last_name;

      if (!firstName && !lastName) {
        const parsed = splitDonorName(tx.donor_name || '');
        title = parsed.title;
        firstName = parsed.firstName;
        lastName = parsed.lastName;
      }

      const house = (tx.address_line_1 || '').split(',')[0].trim();
      const pcode = (tx.postcode || '').trim().toUpperCase();
      const amtNum = parseFloat(tx.donation_amount) || 0;
      const amount = amtNum.toFixed(2);
      const taxClaimed = (parseFloat(tx.claim_amount) || (amtNum * 0.25)).toFixed(2);

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
    });

    const safeRef = (claimBatch.claim_reference || claimId).replace(/[^a-zA-Z0-9_-]/g, '_');
    return new Response(csvContent, {
      headers: {
        ...rateGuard.headers,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename=HMRC_GiftAid_Schedule_${safeRef}.csv`
      }
    });
  }

  // 2. Query claimable (unsubmitted) donations
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
  try {
    validateDateRange(dateFrom, dateTo);
  } catch (err) {
    return apiError(err.message, 400, { code: 'INVALID_QUERY_PARAMETER', field: err.field });
  }

  const claimableTxs = await controller.getGiftAidClaimableTransactions({
    dateFrom,
    dateTo
  });

  if (format === 'json') {
    let totalDonations = 0;
    let totalClaim = 0;
    const formatted = claimableTxs.map(tx => {
      const amt = parseFloat(tx.total_amount) || 0;
      const claim = calculateGiftAidClaim(amt);
      totalDonations += amt;
      totalClaim += claim;

      let title = tx.donor_title;
      let firstName = tx.donor_first_name;
      let lastName = tx.donor_last_name;

      if (!firstName && !lastName) {
        const parsed = splitDonorName(tx.donor_name || '');
        title = parsed.title;
        firstName = parsed.firstName;
        lastName = parsed.lastName;
      }

      return {
        id: tx.id,
        transaction_date: tx.transaction_date,
        donor_id: tx.donor_id,
        donor_name: tx.donor_name,
        title,
        firstName,
        lastName,
        address: tx.address_line_1,
        postcode: tx.postcode,
        amount: amt,
        claim: claim
      };
    });

    const gasds = await controller.getGASDSSummary({
      fiscalYear: fiscalYearParam,
      startDate: dateFrom,
      endDate: dateTo
    });

    return apiSuccess({
      claimable: formatted,
      totalDonations: Math.round(totalDonations * 100) / 100,
      totalClaim: Math.round(totalClaim * 100) / 100,
      count: formatted.length,
      periodStart: dateFrom,
      periodEnd: dateTo,
      gasds
    }, { headers: rateGuard.headers });
  }

  // HMRC Standard Schedule Header Structure
  let csvContent = "Title,First Name,Last Name,House name or number,Postcode,Donation Date,Amount,Gift Aid Claimed\n";

  claimableTxs.forEach(tx => {
    let title = tx.donor_title;
    let firstName = tx.donor_first_name;
    let lastName = tx.donor_last_name;

    if (!firstName && !lastName) {
      const parsed = splitDonorName(tx.donor_name || '');
      title = parsed.title;
      firstName = parsed.firstName;
      lastName = parsed.lastName;
    }

    const house = (tx.address_line_1 || '').split(',')[0].trim();
    const pcode = (tx.postcode || '').trim().toUpperCase();
    const amtNum = parseFloat(tx.total_amount) || 0;
    const amount = amtNum.toFixed(2);
    const taxClaimed = calculateGiftAidClaim(amtNum).toFixed(2);

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

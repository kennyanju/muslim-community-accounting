import { D1Controller } from '@/lib/d1-controller';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { apiError } from '@/lib/response';
import { validateDateRange, getFiscalYearBounds } from '@/lib/validation';
import { sanitizeCsvCell } from '@/lib/sanitize';
import { guardRateLimit } from '@/lib/rateLimit';
import { config } from '@/lib/config';

export async function GET(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized: Authentication required', 401, { code: 'UNAUTHORIZED' });
  }

  const authCheck = requireRole(user, ['ADMIN', 'AUDITOR', 'REVIEWER']);
  if (!authCheck.ok) {
    return apiError(authCheck.message, authCheck.status, { code: 'FORBIDDEN' });
  }

  const rateGuard = await guardRateLimit(request, 'reports_export', config.rateLimit.exportMaxAttempts || 20, config.rateLimit.exportWindowMs || 60000, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }

  const { searchParams } = new URL(request.url);
  const reportType = searchParams.get('type') || 'annual';
  let dateFrom = searchParams.get('dateFrom');
  let dateTo = searchParams.get('dateTo');
  const fiscalYearParam = searchParams.get('fiscal_year');

  const controller = new D1Controller(user.role, user.id, user.name, user.email);
  const org = await controller.getOrganisation();

  // Item #25: Default to UK Charity Fiscal Year bounds if dates omitted
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

  let dateRange;
  try {
    dateRange = validateDateRange(dateFrom, dateTo);
  } catch (err) {
    return apiError(err.message, 400, { code: 'INVALID_QUERY_PARAMETER', field: err.field });
  }

  const transactions = await controller.getTransactions({
    dateFrom,
    dateTo
  });

  // 1. SoFA / Annual Financial Activities Pack (CC17 / FRS 102) - Item #7
  if (reportType === 'annual' || reportType === 'sofa') {
    let csv = `"Statement of Financial Activities (SoFA) - ${sanitizeCsvCell(org.name || 'Masjid')}"\n`;
    csv += `"Charity Reg Number:","${sanitizeCsvCell(org.charity_number || 'N/A')}"\n`;
    csv += `"Reporting Period:","${dateFrom || 'All Time'} to ${dateTo || 'Present'}"\n\n`;

    csv += `"Category","Type","Unrestricted (£)","Restricted (£)","Total (£)"\n`;

    const incomeCategories = {};
    const expenseCategories = {};

    transactions.forEach(t => {
      if (t.status === 'VOIDED' || t.status === 'FAILED') return;
      const cat = t.category || (t.type === 'INCOME' ? 'Donation' : 'General');
      const targetMap = t.type === 'INCOME' ? incomeCategories : expenseCategories;
      if (!targetMap[cat]) targetMap[cat] = { unrestricted: 0, restricted: 0 };

      // Item #7: Accurately split by each allocation's fund restriction status
      if (t.splits && t.splits.length > 0) {
        t.splits.forEach(s => {
          if (s.is_voided) return;
          const sAmt = parseFloat(s.amount) || 0;
          if (s.is_restricted) {
            targetMap[cat].restricted += sAmt;
          } else {
            targetMap[cat].unrestricted += sAmt;
          }
        });
      } else {
        const amt = parseFloat(t.total_amount) || 0;
        targetMap[cat].unrestricted += amt;
      }
    });

    csv += `"--- INCOMING RESOURCES ---","","","",""\n`;
    let totalIncUnrestricted = 0;
    let totalIncRestricted = 0;
    Object.entries(incomeCategories).forEach(([cat, vals]) => {
      totalIncUnrestricted += vals.unrestricted;
      totalIncRestricted += vals.restricted;
      const total = vals.unrestricted + vals.restricted;
      csv += `"${sanitizeCsvCell(cat)}","INCOME","${vals.unrestricted.toFixed(2)}","${vals.restricted.toFixed(2)}","${total.toFixed(2)}"\n`;
    });
    csv += `"Total Incoming Resources","","${totalIncUnrestricted.toFixed(2)}","${totalIncRestricted.toFixed(2)}","${(totalIncUnrestricted + totalIncRestricted).toFixed(2)}"\n\n`;

    csv += `"--- RESOURCES EXPENDED ---","","","",""\n`;
    let totalExpUnrestricted = 0;
    let totalExpRestricted = 0;
    Object.entries(expenseCategories).forEach(([cat, vals]) => {
      totalExpUnrestricted += vals.unrestricted;
      totalExpRestricted += vals.restricted;
      const total = vals.unrestricted + vals.restricted;
      csv += `"${sanitizeCsvCell(cat)}","EXPENSE","${vals.unrestricted.toFixed(2)}","${vals.restricted.toFixed(2)}","${total.toFixed(2)}"\n`;
    });
    csv += `"Total Resources Expended","","${totalExpUnrestricted.toFixed(2)}","${totalExpRestricted.toFixed(2)}","${(totalExpUnrestricted + totalExpRestricted).toFixed(2)}"\n\n`;

    const netUnrestricted = totalIncUnrestricted - totalExpUnrestricted;
    const netRestricted = totalIncRestricted - totalExpRestricted;
    csv += `"NET MOVEMENT IN FUNDS","","${netUnrestricted.toFixed(2)}","${netRestricted.toFixed(2)}","${(netUnrestricted + netRestricted).toFixed(2)}"\n`;

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="sofa_annual_return_${dateFrom || 'start'}_${dateTo || 'end'}.csv"`,
        ...rateGuard.headers
      }
    });
  }

  // 2. Asnaf Beneficiary Audit Register
  if (reportType === 'asnaf') {
    let csv = `"Asnaf Zakat & Fitrana Distribution Schedule - ${sanitizeCsvCell(org.name || 'Masjid')}"\n`;
    csv += `"Beneficiary / Ref","Asnaf Category","Amount (£)","Distribution Date","Trustee Witness","Verification Notes"\n`;

    const asnafRecords = await controller.getAsnafRecords(fiscalYearParam);
    asnafRecords.forEach(r => {
      csv += `"${sanitizeCsvCell(r.beneficiary_name)}","${r.asnaf_category}","${(parseFloat(r.amount) || 0).toFixed(2)}","${r.distribution_date || ''}","${sanitizeCsvCell(r.witness_name || '')}","${sanitizeCsvCell(r.verification_notes || '')}"\n`;
    });

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="asnaf_zakat_distribution_schedule.csv"',
        ...rateGuard.headers
      }
    });
  }

  // 3. Fallback to redirect to giftaid route
  return Response.redirect(new URL('/api/reports/giftaid', request.url));
}

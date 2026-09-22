import { D1Controller } from '@/lib/d1-controller';
import { getAuthenticatedUser, requireRole } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
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

  const rateGuard = await guardRateLimit(request, 'reports_cc16', config.rateLimit.exportMaxAttempts || 20, config.rateLimit.exportWindowMs || 60000, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'json';
  let dateFrom = searchParams.get('dateFrom');
  let dateTo = searchParams.get('dateTo');
  const fiscalYearParam = searchParams.get('fiscal_year');

  const controller = new D1Controller(user.role, user.id, user.name, user.email);
  const org = await controller.getOrganisation();

  if (!dateFrom && !dateTo) {
    const fyBounds = getFiscalYearBounds(fiscalYearParam || new Date(), org.fiscal_year_start || '04-06');
    dateFrom = fyBounds.startDate;
    dateTo = fyBounds.endDate;
  }

  try {
    if (dateFrom && dateTo) {
      validateDateRange(dateFrom, dateTo);
    }
  } catch (err) {
    return apiError(err.message, 400, { code: 'INVALID_QUERY_PARAMETER', field: err.field });
  }

  const statement = await controller.getCC16Statement({
    fiscalYear: fiscalYearParam,
    startDate: dateFrom,
    endDate: dateTo
  });

  if (format === 'csv') {
    let csv = `"CC16 Receipts and Payments Accounts - ${sanitizeCsvCell(statement.charityName)}"\n`;
    csv += `"Charity Reg Number:","${sanitizeCsvCell(statement.charityNumber || 'N/A')}"\n`;
    csv += `"Period:","${statement.reportingPeriod.startDate} to ${statement.reportingPeriod.endDate}"\n\n`;

    csv += `"Section A: Receipts","Unrestricted Funds (£)","Restricted Funds (£)","Total Funds (£)"\n`;
    statement.receipts.forEach(r => {
      csv += `"${sanitizeCsvCell(r.category)}","${r.unrestricted.toFixed(2)}","${r.restricted.toFixed(2)}","${r.total.toFixed(2)}"\n`;
    });
    csv += `"Total Receipts","${statement.totals.receipts.unrestricted.toFixed(2)}","${statement.totals.receipts.restricted.toFixed(2)}","${statement.totals.receipts.total.toFixed(2)}"\n\n`;

    csv += `"Section B: Payments","Unrestricted Funds (£)","Restricted Funds (£)","Total Funds (£)"\n`;
    statement.payments.forEach(p => {
      csv += `"${sanitizeCsvCell(p.category)}","${p.unrestricted.toFixed(2)}","${p.restricted.toFixed(2)}","${p.total.toFixed(2)}"\n`;
    });
    csv += `"Total Payments","${statement.totals.payments.unrestricted.toFixed(2)}","${statement.totals.payments.restricted.toFixed(2)}","${statement.totals.payments.total.toFixed(2)}"\n\n`;

    csv += `"Section C: Net Receipts / (Payments)","${statement.totals.netReceipts.unrestricted.toFixed(2)}","${statement.totals.netReceipts.restricted.toFixed(2)}","${statement.totals.netReceipts.total.toFixed(2)}"\n\n`;

    csv += `"Section D: Transfers Between Funds","${statement.totals.transfers.unrestricted.toFixed(2)}","${statement.totals.transfers.restricted.toFixed(2)}","${statement.totals.transfers.total.toFixed(2)}"\n\n`;

    csv += `"Section E: Cash and Bank Balances","Unrestricted Funds (£)","Restricted Funds (£)","Total Funds (£)"\n`;
    csv += `"Funds brought forward (Opening)","${statement.totals.openingBalances.unrestricted.toFixed(2)}","${statement.totals.openingBalances.restricted.toFixed(2)}","${statement.totals.openingBalances.total.toFixed(2)}"\n`;
    csv += `"Net movement in funds","${(statement.totals.netReceipts.unrestricted + statement.totals.transfers.unrestricted).toFixed(2)}","${(statement.totals.netReceipts.restricted + statement.totals.transfers.restricted).toFixed(2)}","${statement.totals.netReceipts.total.toFixed(2)}"\n`;
    csv += `"Funds carried forward (Closing)","${statement.totals.closingBalances.unrestricted.toFixed(2)}","${statement.totals.closingBalances.restricted.toFixed(2)}","${statement.totals.closingBalances.total.toFixed(2)}"\n\n`;

    csv += `"Section F: Statement of Assets & Liabilities at Period End","Amount (£)"\n`;
    csv += `"Cash in hand (unbanked cash collections)","${statement.assets.cashInHand.toFixed(2)}"\n`;
    csv += `"Cash at bank (cleared balances)","${statement.assets.cashAtBank.toFixed(2)}"\n`;
    csv += `"Total Cash Funds","${statement.assets.totalCashFunds.toFixed(2)}"\n`;

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cc16_receipts_payments_${statement.reportingPeriod.startDate}_${statement.reportingPeriod.endDate}.csv"`,
        ...rateGuard.headers
      }
    });
  }

  return apiSuccess(statement);
}

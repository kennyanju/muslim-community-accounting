import { D1Controller } from '@/lib/d1-controller';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { validateTransactionPayload, validateDateRange, sanitizePagination } from '@/lib/validation';
import { sanitizeCsvCell } from '@/lib/sanitize';
import { guardRateLimit } from '@/lib/rateLimit';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import { checkAndDispatchNotifications } from '@/lib/notifications';

export async function GET(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const fundId = searchParams.get('fund');
  const status = searchParams.get('status');
  const category = searchParams.get('category');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const search = searchParams.get('search')?.toLowerCase().trim();
  const jummahOnly = searchParams.get('jummahOnly') === 'true' || searchParams.get('is_jummah') === 'true';
  const format = searchParams.get('format');
  const paginate = searchParams.get('paginate') === 'true';

  // Validate date range parameters
  let dateRange;
  try {
    dateRange = validateDateRange(dateFrom, dateTo);
  } catch (err) {
    return apiError(err.message, 400, { code: 'INVALID_QUERY_PARAMETER', field: err.field });
  }

  // Rate limit heavy CSV exports
  if (format === 'csv') {
    const rateGuard = await guardRateLimit(request, 'ledger_csv_export', config.rateLimit.exportMaxAttempts, config.rateLimit.exportWindowMs, user.id);
    if (!rateGuard.isAllowed) {
      return rateGuard.errorResponse;
    }
  }

  const controller = new D1Controller(user.role, user.id, user.name, user.email);

  // Fetch transactions with pre-joined splits from D1
  let result = await controller.getTransactions({
    dateFrom,
    dateTo
  });

  // Query Filters
  if (type && type !== 'all') {
    result = result.filter(tx => tx.type === type.toUpperCase());
  }

  if (fundId && fundId !== 'all') {
    result = result.filter(tx => tx.splits?.some(s => s.fund_id === fundId));
  }

  if (category && category !== 'all') {
    result = result.filter(tx => tx.category === category);
  }

  // Item #12: First-class Jummah collection filter
  if (jummahOnly) {
    result = result.filter(tx => tx.is_jummah === 1 || tx.is_jummah === true);
  }

  if (status && status !== 'all') {
    if (status === 'Active') {
      result = result.filter(tx => tx.status !== 'VOIDED' && tx.status !== 'FAILED');
    } else {
      const target = status.toUpperCase();
      result = result.filter(tx =>
        tx.status === target ||
        (status === 'Cash on Hand' && tx.status === 'PENDING') ||
        (status === 'Banked' && tx.status === 'BANKED') ||
        (status === 'Voided' && tx.status === 'VOIDED')
      );
    }
  }

  if (search) {
    result = result.filter(tx =>
      tx.description?.toLowerCase().includes(search) ||
      tx.reference_note?.toLowerCase().includes(search) ||
      tx.donor_name?.toLowerCase().includes(search) ||
      tx.category?.toLowerCase().includes(search) ||
      tx.receipt_number?.toLowerCase().includes(search) ||
      tx.notes?.toLowerCase().includes(search)
    );
  }

  // Handle CSV export of full ledger with CSV Injection protection
  if (format === 'csv') {
    const org = await controller.getOrganisation();
    let csv = `"Audit-Ready Transaction Ledger - ${sanitizeCsvCell(org.name || 'Masjid')}"\n`;
    csv += `"Export Date:","${new Date().toISOString()}"\n`;
    csv += `"Exported By:","${sanitizeCsvCell(user.email || 'Admin')}"\n\n`;

    csv += `"Transaction ID","Receipt No.","Date","Type","Category","Fund Allocation(s)","Method","Donor","Status","Reconciled","Amount (£)","Notes"\n`;

    result.forEach(tx => {
      const fundNames = (tx.splits || []).map(s => `${s.fund_name || s.fund_id}: £${parseFloat(s.amount).toFixed(2)}`).join('; ');
      const donor = tx.donor_name || 'Anonymous';

      const row = [
        sanitizeCsvCell(tx.id),
        sanitizeCsvCell(tx.receipt_number || 'N/A'),
        sanitizeCsvCell(tx.transaction_date),
        sanitizeCsvCell(tx.type),
        sanitizeCsvCell(tx.category),
        sanitizeCsvCell(fundNames),
        sanitizeCsvCell(tx.method),
        sanitizeCsvCell(donor),
        sanitizeCsvCell(tx.status),
        tx.reconciled ? 'YES' : 'NO',
        parseFloat(tx.total_amount).toFixed(2),
        sanitizeCsvCell(tx.reference_note || tx.notes || '')
      ];
      csv += row.map(v => `"${v}"`).join(',') + '\n';
    });

    const exportFilename = `masjid_ledger_${new Date().toISOString().split('T')[0]}.csv`;
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportFilename}"`
      }
    });
  }

  // Server-side Pagination
  if (paginate) {
    const { page, pageSize } = sanitizePagination(searchParams, 15, 100);
    const startIndex = (page - 1) * pageSize;
    const paginatedItems = result.slice(startIndex, startIndex + pageSize);

    return apiSuccess(paginatedItems, {
      meta: {
        total: result.length,
        page,
        pageSize,
        totalPages: Math.ceil(result.length / pageSize)
      }
    });
  }

  return apiSuccess(result, {
    meta: { total: result.length }
  });
}

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Financial Secretary (Admin) only', 403, { code: 'FORBIDDEN' });
  }

  // Rate limit transaction creation
  const rateGuard = await guardRateLimit(request, 'create_transaction', config.rateLimit.writeMaxAttempts, config.rateLimit.writeWindowMs, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }

  try {
    const body = await request.json();
    validateTransactionPayload(body);

    const {
      type,
      status,
      method,
      totalAmount,
      date,
      donorId,
      receiptUrl,
      reference_note,
      note,
      description,
      category,
      splits,
      giftAid,
      notes,
      is_jummah
    } = body;

    const controller = new D1Controller(user.role, user.id, user.name, user.email);

    const newTx = await controller.createTransaction({
      type,
      status,
      method,
      totalAmount,
      date,
      donorId,
      receiptUrl,
      reference_note: reference_note || description || note || 'Donation',
      category,
      splits,
      giftAid,
      notes,
      is_jummah
    });

    logger.info('Transaction recorded in D1', { transactionId: newTx.id, receiptNumber: newTx.receipt_number, type, totalAmount, userId: user.id });

    // Asynchronously dispatch any critical trustee notifications
    checkAndDispatchNotifications(newTx, controller).catch(err => {
      logger.error('Background notification dispatch error:', { error: err.message });
    });

    return apiSuccess({ transactionId: newTx.id, transaction: newTx }, {
      status: 201,
      message: 'Transaction recorded successfully',
      headers: rateGuard.headers
    });

  } catch (error) {
    logger.warn('Transaction creation failed', { error: error.message, userId: user.id });
    return apiError(error.message, 400, { code: 'TRANSACTION_ERROR' });
  }
}

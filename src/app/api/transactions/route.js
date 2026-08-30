import { readDB, DatabaseController } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { validateTransactionPayload, validateDateRange, sanitizePagination } from '@/lib/validation';
import { guardRateLimit } from '@/lib/rateLimit';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

export async function GET(request) {
  const user = getAuthenticatedUser(request);
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
  const jummahOnly = searchParams.get('jummahOnly') === 'true';
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
    const rateGuard = guardRateLimit(request, 'ledger_csv_export', config.rateLimit.exportMaxAttempts, config.rateLimit.exportWindowMs, user.id);
    if (!rateGuard.isAllowed) {
      return rateGuard.errorResponse;
    }
  }

  const db = readDB();

  // Build O(1) in-memory index Maps for optimal hydration performance
  const fundMap = new Map((db.funds || []).map(f => [f.id, f]));
  const donorMap = new Map((db.donors || []).map(d => [d.id, d]));
  const splitsByTxId = new Map();

  (db.transaction_splits || []).forEach(split => {
    let list = splitsByTxId.get(split.transaction_id);
    if (!list) {
      list = [];
      splitsByTxId.set(split.transaction_id, list);
    }
    const fund = fundMap.get(split.fund_id);
    list.push({
      ...split,
      fundName: fund ? fund.name : 'Unknown'
    });
  });
  
  // Single-pass hydration using O(1) index Maps
  let result = (db.transactions || []).map(tx => {
    const splits = splitsByTxId.get(tx.id) || [];
    const donor = donorMap.get(tx.donor_id);
    
    return {
      ...tx,
      splits,
      donorName: donor ? donor.name : 'Anonymous',
      gift_aid_eligible: donor ? donor.gift_aid_eligible : false
    };
  });

  // Query Filters
  if (type && type !== 'all') {
    result = result.filter(tx => tx.type === type.toUpperCase());
  }

  if (fundId && fundId !== 'all') {
    result = result.filter(tx => tx.splits.some(s => s.fund_id === fundId));
  }

  if (category && category !== 'all') {
    result = result.filter(tx => tx.category === category);
  }

  if (dateRange.fromTime) {
    result = result.filter(tx => {
      const txTime = new Date(tx.transaction_date).getTime();
      return !isNaN(txTime) ? txTime >= dateRange.fromTime : tx.transaction_date >= dateFrom;
    });
  }

  if (dateRange.toTime) {
    result = result.filter(tx => {
      const txTime = new Date(tx.transaction_date).getTime();
      return !isNaN(txTime) ? txTime <= dateRange.toTime : tx.transaction_date <= dateTo;
    });
  }

  if (jummahOnly) {
    result = result.filter(tx => 
      tx.reference_note?.toLowerCase().includes('jummah') ||
      tx.notes?.toLowerCase().includes('jummah') ||
      tx.notes?.toLowerCase().includes('counter')
    );
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
      tx.donorName?.toLowerCase().includes(search) ||
      tx.category?.toLowerCase().includes(search) ||
      tx.receipt_number?.toLowerCase().includes(search) ||
      tx.notes?.toLowerCase().includes(search)
    );
  }

  // Handle CSV export of full ledger
  if (format === 'csv') {
    const org = db.organisation || {};
    let csv = `Date,Receipt No,Type,Reference / Description,Category,Donor,Fund Splits,Payment Method,Amount (${org.currency_symbol || '£'}),Status,Reconciled,Notes\n`;
    
    result.forEach(tx => {
      const fundSplits = tx.splits.map(s => `${s.fundName}: ${s.amount}`).join(' | ');
      const desc = (tx.reference_note || tx.description || '').replace(/"/g, '""');
      const notes = (tx.notes || '').replace(/"/g, '""');
      const donor = (tx.donorName || 'Anonymous').replace(/"/g, '""');
      const recNo = (tx.receipt_number || '').replace(/"/g, '""');
      
      csv += `"${tx.transaction_date}","${recNo}","${tx.type}","${desc}","${tx.category || ''}","${donor}","${fundSplits}","${tx.method}",${parseFloat(tx.total_amount).toFixed(2)},"${tx.status}","${tx.reconciled ? 'YES' : 'NO'}","${notes}"\n`;
    });

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename=Ledger_Export_${new Date().toISOString().substring(0, 10)}.csv`
      }
    });
  }

  if (paginate) {
    const { page, pageSize, offset } = sanitizePagination(searchParams, 15, 100);
    const paginated = result.slice(offset, offset + pageSize);
    return apiSuccess(paginated, {
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
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }
  
  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Financial Secretary (Admin) only', 403, { code: 'FORBIDDEN' });
  }

  // Rate limit transaction creation
  const rateGuard = guardRateLimit(request, 'create_transaction', config.rateLimit.writeMaxAttempts, config.rateLimit.writeWindowMs, user.id);
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
      notes 
    } = body;

    const controller = new DatabaseController(user.role, user.id);
    
    const transactionId = controller.createTransaction({
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
      notes
    });

    logger.info('Transaction recorded', { transactionId, type, totalAmount, userId: user.id });
    return apiSuccess({ transactionId }, { status: 201, message: 'Transaction recorded successfully', headers: rateGuard.headers });

  } catch (error) {
    logger.warn('Transaction creation failed', { error: error.message, userId: user.id });
    return apiError(error.message, 400, { code: 'TRANSACTION_ERROR' });
  }
}

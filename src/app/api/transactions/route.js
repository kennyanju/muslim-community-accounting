import { NextResponse } from 'next/server';
import { readDB, DatabaseController } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';

export async function GET(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const fundId = searchParams.get('fund');
  const status = searchParams.get('status');
  const category = searchParams.get('category');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const search = searchParams.get('search')?.toLowerCase();
  const jummahOnly = searchParams.get('jummahOnly') === 'true';
  const format = searchParams.get('format');

  const db = readDB();
  
  let result = db.transactions.map(tx => {
    // Attach splits
    const splits = db.transaction_splits.filter(s => s.transaction_id === tx.id);
    
    // Attach donor info
    const donor = db.donors.find(d => d.id === tx.donor_id);
    
    return {
      ...tx,
      splits: splits.map(s => {
        const fund = db.funds.find(f => f.id === s.fund_id);
        return {
          ...s,
          fundName: fund ? fund.name : 'Unknown'
        };
      }),
      donorName: donor ? donor.name : 'Anonymous',
      gift_aid_eligible: donor ? donor.gift_aid_eligible : false
    };
  });

  // Filters
  if (type && type !== 'all') {
    result = result.filter(tx => tx.type === type.toUpperCase());
  }

  if (fundId && fundId !== 'all') {
    result = result.filter(tx => tx.splits.some(s => s.fund_id === fundId));
  }

  if (category && category !== 'all') {
    result = result.filter(tx => tx.category === category);
  }

  if (dateFrom) {
    result = result.filter(tx => tx.transaction_date >= dateFrom);
  }

  if (dateTo) {
    result = result.filter(tx => tx.transaction_date <= dateTo);
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
      tx.notes?.toLowerCase().includes(search)
    );
  }

  // Handle CSV export of full ledger
  if (format === 'csv') {
    const org = db.organisation || {};
    let csv = `Date,Type,Reference / Description,Category,Donor,Fund Splits,Payment Method,Amount (${org.currency_symbol || '£'}),Status,Reconciled,Notes\n`;
    
    result.forEach(tx => {
      const fundSplits = tx.splits.map(s => `${s.fundName}: ${s.amount}`).join(' | ');
      const desc = (tx.reference_note || tx.description || '').replace(/"/g, '""');
      const notes = (tx.notes || '').replace(/"/g, '""');
      const donor = (tx.donorName || 'Anonymous').replace(/"/g, '""');
      
      csv += `"${tx.transaction_date}","${tx.type}","${desc}","${tx.category || ''}","${donor}","${fundSplits}","${tx.method}",${parseFloat(tx.total_amount).toFixed(2)},"${tx.status}","${tx.reconciled ? 'YES' : 'NO'}","${notes}"\n`;
    });

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename=Ledger_Export_${new Date().toISOString().substring(0, 10)}.csv`
      }
    });
  }

  return NextResponse.json(result);
}

export async function POST(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admins only' }, { status: 403 });
  }

  try {
    const body = await request.json();
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

    return NextResponse.json({ success: true, transactionId }, { status: 201 });

  } catch (error) {
    console.error('Transaction creation failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

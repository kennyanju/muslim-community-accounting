import { NextResponse } from 'next/server';
import { readDB, DatabaseController } from '@/lib/db';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const fundId = searchParams.get('fund');
  const status = searchParams.get('status');
  const search = searchParams.get('search')?.toLowerCase();

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

  if (status && status !== 'all') {
    if (status === 'Active') {
      result = result.filter(tx => tx.status !== 'VOIDED' && tx.status !== 'FAILED');
    } else {
      const target = status.toUpperCase();
      result = result.filter(tx => 
        tx.status === target || 
        (status === 'Cash on Hand' && tx.status === 'PENDING') || 
        (status === 'Banked' && tx.status === 'BANKED')
      );
    }
  }

  if (search) {
    result = result.filter(tx => 
      tx.description?.toLowerCase().includes(search) || 
      tx.reference_note?.toLowerCase().includes(search) ||
      tx.donorName.toLowerCase().includes(search) ||
      tx.notes?.toLowerCase().includes(search)
    );
  }

  return NextResponse.json(result);
}

export async function POST(request) {
  const role = request.headers.get('x-user-role') || 'ADMIN';
  const userId = request.headers.get('x-user-id') || 'user-sec-1';
  
  // Verify Admin Role Check (simulating Supabase RLS / Users check)
  if (role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admins only' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { type, status, method, totalAmount, date, donorId, receiptUrl, note, splits, giftAid, notes } = body;

    const controller = new DatabaseController(role, userId);
    
    // Call database trigger checks and insert atomically
    const transactionId = controller.createTransaction({
      type,
      status,
      method,
      totalAmount,
      date,
      donorId,
      receiptUrl,
      reference_note: note || 'Donation',
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

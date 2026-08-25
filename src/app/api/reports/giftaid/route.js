import { NextResponse } from 'next/server';
import { readDB } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';

export async function GET(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  const db = readDB();
  const org = db.organisation || {};
  
  let csvContent = "Donor Name,House No/Name,Postcode,Donation Date,Amount,Gift Aid Rebate (25%)\n";
  
  let eligibleTx = db.transactions.filter(tx => 
    tx.type === 'INCOME' && 
    tx.status !== 'VOIDED' && 
    tx.status !== 'FAILED' && 
    tx.giftAid
  );

  if (dateFrom) {
    eligibleTx = eligibleTx.filter(t => t.transaction_date >= dateFrom);
  }
  if (dateTo) {
    eligibleTx = eligibleTx.filter(t => t.transaction_date <= dateTo);
  }

  eligibleTx.forEach(tx => {
    const donor = db.donors.find(d => d.id === tx.donor_id);
    if (donor && donor.gift_aid_eligible && donor.address_line_1 && donor.postcode) {
      const house = donor.address_line_1.split(',')[0].trim();
      const rebate = (parseFloat(tx.total_amount) * 0.25).toFixed(2);
      
      csvContent += `"${donor.name}","${house}","${donor.postcode}",${tx.transaction_date},${parseFloat(tx.total_amount).toFixed(2)},${rebate}\n`;
    }
  });

  const shortName = (org.short_name || 'MASJID').replace(/[^a-zA-Z0-9]/g, '_');
  const year = new Date().getFullYear();

  return new Response(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename=HMRC_GiftAid_Claim_${shortName}_${year}.csv`
    }
  });
}

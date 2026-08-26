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
  
  // HMRC Standard Schedule Header Structure (H2)
  let csvContent = "Title,First Name,Last Name,House name or number,Postcode,Donation Date,Amount,Gift Aid Claimed (25%)\n";
  
  let eligibleTx = (db.transactions || []).filter(tx => 
    tx.type === 'INCOME' && 
    tx.status !== 'VOIDED' && 
    tx.status !== 'FAILED' && 
    tx.giftAid
  );

  // M3: Timestamp-based date filtering
  if (dateFrom) {
    const fromTime = new Date(dateFrom).getTime();
    eligibleTx = eligibleTx.filter(t => {
      const txTime = new Date(t.transaction_date).getTime();
      return !isNaN(txTime) && !isNaN(fromTime) ? txTime >= fromTime : t.transaction_date >= dateFrom;
    });
  }
  if (dateTo) {
    const toTime = new Date(dateTo + (dateTo.length <= 10 ? 'T23:59:59.999Z' : '')).getTime();
    eligibleTx = eligibleTx.filter(t => {
      const txTime = new Date(t.transaction_date).getTime();
      return !isNaN(txTime) && !isNaN(toTime) ? txTime <= toTime : t.transaction_date <= dateTo;
    });
  }

  eligibleTx.forEach(tx => {
    const donor = (db.donors || []).find(d => d.id === tx.donor_id);
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

      const house = donor.address_line_1.split(',')[0].trim().replace(/"/g, '""');
      const pcode = donor.postcode.trim().toUpperCase().replace(/"/g, '""');
      const amount = parseFloat(tx.total_amount).toFixed(2);
      const taxClaimed = (parseFloat(tx.total_amount) * 0.25).toFixed(2);
      
      csvContent += `"${title}","${firstName.replace(/"/g, '""')}","${lastName.replace(/"/g, '""')}","${house}","${pcode}",${tx.transaction_date},${amount},${taxClaimed}\n`;
    }
  });

  const shortName = (org.short_name || 'MASJID').replace(/[^a-zA-Z0-9]/g, '_');
  const year = new Date().getFullYear();

  return new Response(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename=HMRC_GiftAid_Schedule_${shortName}_${year}.csv`
    }
  });
}

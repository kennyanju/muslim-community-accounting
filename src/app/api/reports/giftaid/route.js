import { NextResponse } from 'next/server';
import { readDB } from '@/lib/db';

export async function GET(request) {
  const db = readDB();
  
  let csvContent = "Donor Name,House No/Name,Postcode,Donation Date,Amount,Gift Aid Rebate (25%)\n";
  
  db.transactions.forEach(tx => {
    if (tx.type === 'INCOME' && tx.status !== 'VOIDED' && tx.status !== 'FAILED' && tx.giftAid) {
      const donor = db.donors.find(d => d.id === tx.donor_id);
      if (donor && donor.gift_aid_eligible && donor.address_line_1 && donor.postcode) {
        const house = donor.address_line_1.split(',')[0].trim();
        const rebate = (parseFloat(tx.total_amount) * 0.25).toFixed(2);
        
        csvContent += `"${donor.name}","${house}","${donor.postcode}",${tx.transaction_date},${parseFloat(tx.total_amount).toFixed(2)},${rebate}\n`;
      }
    }
  });

  return new Response(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename=HMRC_GiftAid_Claim_BSMC_${new Date().getFullYear()}.csv`
    }
  });
}

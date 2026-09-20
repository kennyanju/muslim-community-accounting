import { readDB } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { guardRateLimit } from '@/lib/rateLimit';
import { config } from '@/lib/config';

export async function GET(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized: Authentication required', 401, { code: 'UNAUTHORIZED' });
  }

  const rateGuard = guardRateLimit(request, 'analytics_view', config.rateLimit.readMaxAttempts || 100, config.rateLimit.readWindowMs || 60000, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }

  try {
    const db = readDB();
    const transactions = db.transactions || [];
    const splits = db.transaction_splits || [];
    const funds = db.funds || [];
    const donors = db.donors || [];
    const asnafRecords = db.asnaf_records || [];

    const now = new Date();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
      months.push({ key, label, income: 0, expense: 0, net: 0, count: 0 });
    }

    const monthMap = new Map(months.map(m => [m.key, m]));
    let totalGiftAidEligible = 0;
    let totalJummahAmount = 0;
    let jummahCount = 0;

    const categoryMap = {};

    transactions.forEach(tx => {
      if (tx.status === 'VOIDED' || tx.status === 'FAILED') return;
      const amt = parseFloat(tx.total_amount) || 0;
      const txMonth = (tx.transaction_date || '').substring(0, 7);

      if (monthMap.has(txMonth)) {
        const m = monthMap.get(txMonth);
        if (tx.type === 'INCOME') {
          m.income += amt;
        } else {
          m.expense += amt;
        }
        m.net = m.income - m.expense;
        m.count += 1;
      }

      // Category breakdown
      const cat = tx.category || (tx.type === 'INCOME' ? 'Donation' : 'General');
      categoryMap[cat] = (categoryMap[cat] || 0) + amt;

      // Gift aid
      if (tx.type === 'INCOME' && tx.giftAid) {
        totalGiftAidEligible += amt;
      }

      // Jummah collection
      if (
        (tx.reference_note && tx.reference_note.toLowerCase().includes('jummah')) ||
        (tx.category && tx.category.toLowerCase().includes('jummah'))
      ) {
        totalJummahAmount += amt;
        jummahCount++;
      }
    });

    // Zakat fund analytics
    const zakatFund = funds.find(f => f.name.toLowerCase() === 'zakat');
    let zakatCollected = 0;
    let zakatDisbursed = 0;

    if (zakatFund) {
      splits.forEach(s => {
        if (s.is_voided || s.fund_id !== zakatFund.id) return;
        const tx = transactions.find(t => t.id === s.transaction_id);
        if (!tx || tx.status === 'VOIDED' || tx.status === 'FAILED') return;
        const sAmt = parseFloat(s.amount) || 0;
        if (tx.type === 'INCOME') zakatCollected += sAmt;
        else zakatDisbursed += sAmt;
      });
    }

    // Riba fund analytics
    const ribaFund = funds.find(f => f.name.toLowerCase() === 'interest/riba' || f.name.toLowerCase() === 'riba');
    let ribaPending = 0;
    if (ribaFund) {
      splits.forEach(s => {
        if (s.is_voided || s.fund_id !== ribaFund.id) return;
        const tx = transactions.find(t => t.id === s.transaction_id);
        if (!tx || tx.status === 'VOIDED' || tx.status === 'FAILED') return;
        const sAmt = parseFloat(s.amount) || 0;
        if (tx.type === 'INCOME') ribaPending += sAmt;
        else ribaPending -= sAmt;
      });
    }

    // Asnaf distribution breakdown
    const asnafBreakdown = {};
    asnafRecords.forEach(a => {
      const cat = a.asnaf_category || 'FUQARA';
      asnafBreakdown[cat] = (asnafBreakdown[cat] || 0) + (parseFloat(a.amount) || 0);
    });

    // Donor capture rate
    const totalDonorsCount = donors.filter(d => !d.is_anonymous).length;
    const gaDonorsCount = donors.filter(d => !d.is_anonymous && d.gift_aid_eligible).length;

    const payload = {
      trend12Months: months,
      categories: Object.entries(categoryMap).map(([name, amount]) => ({ name, amount })),
      giftAid: {
        totalEligibleAmount: totalGiftAidEligible,
        projectedReclaim: totalGiftAidEligible * 0.25,
        eligibleDonorsCount: gaDonorsCount,
        totalNamedDonors: totalDonorsCount,
        captureRatePercent: totalDonorsCount > 0 ? Math.round((gaDonorsCount / totalDonorsCount) * 100) : 0
      },
      jummah: {
        totalCollections: totalJummahAmount,
        recordedFridays: jummahCount,
        averagePerFriday: jummahCount > 0 ? Math.round(totalJummahAmount / jummahCount) : 0
      },
      zakat: {
        collected: zakatCollected,
        disbursed: zakatDisbursed,
        balance: zakatCollected - zakatDisbursed,
        utilisationPercent: zakatCollected > 0 ? Math.round((zakatDisbursed / zakatCollected) * 100) : 0,
        asnafBreakdown
      },
      riba: {
        pendingDisposal: Math.max(0, ribaPending)
      }
    };

    return apiSuccess(payload, { headers: rateGuard.headers });
  } catch (err) {
    return apiError(err.message, 500, { code: 'ANALYTICS_ERROR' });
  }
}

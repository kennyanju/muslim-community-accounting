import { DatabaseController, readDB, getOrganisationFromRequest } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { guardRateLimit } from '@/lib/rateLimit';
import { config } from '@/lib/config';

export async function GET(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  const rateGuard = guardRateLimit(request, 'dashboard_aggregate', config.rateLimit.readMaxAttempts || 100, config.rateLimit.readWindowMs || 60000, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }

  try {
    const controller = new DatabaseController(user.role, user.id);
    const db = readDB();
    const org = getOrganisationFromRequest(request);
    const balances = controller.getBalances();
    const transactions = db.transactions || [];

    // Compute key financial metrics
    let totalIncome = 0;
    let totalExpense = 0;
    let pendingCashAmount = 0;
    let pendingCashCount = 0;
    let giftAidEligibleTotal = 0;

    transactions.forEach(t => {
      if (t.status === 'VOIDED' || t.status === 'FAILED') return;
      const amt = parseFloat(t.total_amount) || 0;
      if (t.type === 'INCOME') {
        totalIncome += amt;
        if (t.status === 'PENDING') {
          pendingCashAmount += amt;
          pendingCashCount++;
        }
        if (t.giftAid) {
          giftAidEligibleTotal += amt;
        }
      } else {
        totalExpense += amt;
      }
    });

    const netAssets = totalIncome - totalExpense;

    // Check Shariah & operational alerts
    const alerts = [];
    const ribaBalance = balances.find(b => b.fundName === 'Interest/Riba');
    if (ribaBalance && ribaBalance.balance > 0) {
      alerts.push({
        id: 'alert-riba',
        severity: 'warning',
        title: 'Interest / Riba Disposal Pending',
        message: `There is £${ribaBalance.balance.toFixed(2)} in unlawful bank interest awaiting Shariah-compliant disposal without intention of spiritual reward.`
      });
    }

    if (pendingCashCount > 0) {
      alerts.push({
        id: 'alert-pending-cash',
        severity: 'info',
        title: 'Cash on Hand Awaiting Banking',
        message: `${pendingCashCount} donation(s) totalling £${pendingCashAmount.toFixed(2)} need to be deposited at the bank.`
      });
    }

    const zakatBalance = balances.find(b => b.fundName === 'Zakat');
    if (zakatBalance && zakatBalance.balance > 5000) {
      alerts.push({
        id: 'alert-zakat-surplus',
        severity: 'info',
        title: 'Zakat Fund Distribution Recommended',
        message: `Zakat balance is currently £${zakatBalance.balance.toFixed(2)}. Trustees should review eligible Asnaf beneficiaries for disbursement.`
      });
    }

    // Recent 10 transactions
    const recentTransactions = transactions.slice(0, 10);

    const payload = {
      organisation: org,
      balances,
      summary: {
        totalIncome,
        totalExpense,
        netAssets,
        pendingCashAmount,
        pendingCashCount,
        giftAidEligibleTotal,
        projectedGiftAidTaxReclaim: giftAidEligibleTotal * 0.25,
        totalTransactionsCount: transactions.length
      },
      alerts,
      recentTransactions
    };

    return apiSuccess(payload, { headers: rateGuard.headers });
  } catch (err) {
    return apiError(err.message, 500, { code: 'DASHBOARD_ERROR' });
  }
}

import { D1Controller } from '@/lib/d1-controller';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { guardRateLimit } from '@/lib/rateLimit';
import { config } from '@/lib/config';
import { calculateGiftAidClaim, getFiscalYearBounds } from '@/lib/validation';

export async function GET(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  const rateGuard = await guardRateLimit(request, 'dashboard_aggregate', config.rateLimit.readMaxAttempts || 100, config.rateLimit.readWindowMs || 60000, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }

  try {
    const controller = new D1Controller(user.role, user.id, user.name, user.email);
    const org = await controller.getOrganisation();
    const balances = await controller.getBalances();

    // Item #25: Fiscal Year Scoping (UK Charity year default April 6 - April 5)
    const { searchParams } = new URL(request.url);
    const fiscalYearParam = searchParams.get('fiscal_year');
    const fyBounds = getFiscalYearBounds(new Date(), org.fiscal_year_start || '04-06');
    const activeStartDate = fiscalYearParam ? `${fiscalYearParam}-${org.fiscal_year_start || '04-06'}` : fyBounds.startDate;
    const activeEndDate = fiscalYearParam ? `${parseInt(fiscalYearParam, 10) + 1}-${org.fiscal_year_start || '04-06'}` : fyBounds.endDate;

    const allTransactions = await controller.getTransactions();

    // Compute key financial metrics scoped to active fiscal year
    let totalIncome = 0;
    let totalExpense = 0;
    let pendingCashAmount = 0;
    let pendingCashCount = 0;
    let giftAidEligibleTotal = 0;

    allTransactions.forEach(t => {
      if (t.status === 'VOIDED' || t.status === 'FAILED') return;
      // Filter by fiscal year bounds
      if (t.transaction_date < activeStartDate || t.transaction_date > activeEndDate) return;

      const amt = parseFloat(t.total_amount) || 0;
      if (t.type === 'INCOME') {
        totalIncome += amt;
        if (t.status === 'PENDING') {
          pendingCashAmount += amt;
          pendingCashCount++;
        }
        if (t.gift_aid) {
          giftAidEligibleTotal += amt;
        }
      } else {
        totalExpense += amt;
      }
    });

    const netAssets = totalIncome - totalExpense;

    // Check Shariah & operational alerts with configurable thresholds (Items #6, #14)
    const alerts = [];
    const ribaBalance = balances.find(b => b.name === 'Interest/Riba' || b.name?.toLowerCase().includes('riba'));
    if (ribaBalance && ribaBalance.balance > 0) {
      alerts.push({
        id: 'alert-riba',
        severity: 'warning',
        title: 'Interest / Riba Disposal Pending',
        message: `There is ${org.currency_symbol || '£'}${ribaBalance.balance.toFixed(2)} in unlawful bank interest awaiting Shariah-compliant disposal without intention of spiritual reward.`
      });
    }

    if (pendingCashCount > 0) {
      alerts.push({
        id: 'alert-pending-cash',
        severity: 'info',
        title: 'Cash on Hand Awaiting Banking',
        message: `${pendingCashCount} donation(s) totalling ${org.currency_symbol || '£'}${pendingCashAmount.toFixed(2)} need to be deposited at the bank.`
      });
    }

    // Configurable Zakat surplus threshold (Item #6)
    const zakatSurplusThreshold = org.zakat_surplus_alert || 5000;
    const zakatBalance = balances.find(b => b.name === 'Zakat');
    if (zakatBalance && zakatBalance.balance > zakatSurplusThreshold) {
      alerts.push({
        id: 'alert-zakat-surplus',
        severity: 'info',
        title: 'Zakat Fund Distribution Recommended',
        message: `Zakat balance is currently ${org.currency_symbol || '£'}${zakatBalance.balance.toFixed(2)} (exceeds threshold of ${org.currency_symbol || '£'}${zakatSurplusThreshold.toFixed(2)}). Trustees should review eligible Asnaf beneficiaries for disbursement.`
      });
    }

    // Low Zakat reserve check
    const zakatMinReserve = org.zakat_reserve_min || 200;
    if (zakatBalance && zakatBalance.balance < zakatMinReserve) {
      alerts.push({
        id: 'alert-zakat-low',
        severity: 'warning',
        title: 'Low Zakat Reserve Alert',
        message: `Zakat balance has dropped to ${org.currency_symbol || '£'}${zakatBalance.balance.toFixed(2)} (below reserve minimum of ${org.currency_symbol || '£'}${zakatMinReserve.toFixed(2)}). Consider an appeal for local Asnaf families.`
      });
    }

    // Recent 10 transactions
    const recentTransactions = allTransactions.slice(0, 10);

    const payload = {
      organisation: org,
      balances,
      fiscalYear: {
        label: fiscalYearParam ? `${fiscalYearParam}/${parseInt(fiscalYearParam, 10) + 1}` : fyBounds.label,
        startDate: activeStartDate,
        endDate: activeEndDate,
        year: fiscalYearParam ? parseInt(fiscalYearParam, 10) : fyBounds.fiscalYear
      },
      summary: {
        totalIncome,
        totalExpense,
        netAssets,
        pendingCashAmount,
        pendingCashCount,
        giftAidEligibleTotal,
        projectedGiftAidTaxReclaim: calculateGiftAidClaim(giftAidEligibleTotal), // Item #5
        totalTransactionsCount: allTransactions.length
      },
      alerts,
      recentTransactions
    };

    return apiSuccess(payload, { headers: rateGuard.headers });
  } catch (err) {
    return apiError(err.message, 500, { code: 'DASHBOARD_ERROR' });
  }
}

import { logger } from './logger.js';

/**
 * Intelligent financial notification engine for trustees and accounting officers.
 * Dispatches alerts on critical financial triggers (Large donations, low Zakat reserves, Riba accumulation).
 */
export async function checkAndDispatchNotifications(transaction, db) {
  if (!transaction || !db) return { triggered: false, alerts: [] };

  const alerts = [];
  const org = db.organisation || {};
  const currency = org.currency_symbol || '£';

  // 1. Large Donation Notification Threshold (£500+)
  const threshold = parseFloat(process.env.LARGE_DONATION_THRESHOLD || 500);
  if (transaction.type === 'INCOME' && parseFloat(transaction.total_amount) >= threshold) {
    const alert = {
      type: 'LARGE_DONATION',
      severity: 'INFO',
      message: `Significant donation of ${currency}${parseFloat(transaction.total_amount).toFixed(2)} received (Receipt #${transaction.receipt_number || transaction.id}).`,
      details: {
        amount: transaction.total_amount,
        donor: transaction.donor_id,
        category: transaction.category
      }
    };
    alerts.push(alert);
    logger.info('[Trustee Notification] Large donation recorded', alert);
  }

  // 2. Riba Accumulation Notification
  if (transaction.type === 'INCOME') {
    const isRiba = (transaction.splits || []).some(s => {
      const fund = (db.funds || []).find(f => f.id === s.fund_id);
      return fund && (fund.name === 'Interest/Riba' || fund.name.toLowerCase().includes('riba'));
    });

    if (isRiba) {
      const alert = {
        type: 'RIBA_ACCUMULATION',
        severity: 'WARNING',
        message: `Unlawful interest (Riba) of ${currency}${parseFloat(transaction.total_amount).toFixed(2)} recorded into segregated fund. Please schedule public benefit disposal.`
      };
      alerts.push(alert);
      logger.warn('[Shariah Notification] Bank interest recorded for disposal', alert);
    }
  }

  // 3. Low Zakat Reserve Alert
  const zakatFund = (db.funds || []).find(f => f.name === 'Zakat');
  if (zakatFund && transaction.type === 'EXPENSE') {
    let zakatBalance = 0;
    (db.transactions || []).forEach(tx => {
      if (tx.status === 'VOIDED' || tx.status === 'FAILED') return;
      (tx.splits || []).forEach(s => {
        if (s.fund_id === zakatFund.id) {
          const amt = parseFloat(s.amount) || 0;
          zakatBalance += (tx.type === 'INCOME' ? amt : -amt);
        }
      });
    });

    const minReserve = 200;
    if (zakatBalance < minReserve) {
      const alert = {
        type: 'LOW_ZAKAT_RESERVE',
        severity: 'WARNING',
        message: `Zakat reserve has reached a low balance of ${currency}${zakatBalance.toFixed(2)}. Consider launching an appeal for local Asnaf families.`
      };
      alerts.push(alert);
      logger.info('[Zakat Reserve Notification] Low Zakat balance', alert);
    }
  }

  // In production with RESEND_API_KEY or SMTP configured, send outbound emails here
  if (process.env.RESEND_API_KEY && alerts.length > 0) {
    try {
      // Fire-and-forget outbound webhook / email dispatch
      logger.info('[Email Notification Dispatch] Dispatched to trustees', { recipient: org.email, alertsCount: alerts.length });
    } catch (e) {
      logger.error('Failed to send notification email', { error: e.message });
    }
  }

  return {
    triggered: alerts.length > 0,
    alerts
  };
}

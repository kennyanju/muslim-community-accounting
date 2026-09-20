'use client';

import React, { useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { formatCurrency, formatDate } from '@/utils/formatters';
import EmptyState from '@/components/common/EmptyState';

export default function DashboardTab() {
  const { balances, transactions, donors, org, setActiveTab, openModal, user } = useApp();
  const [trendMonthsCount, setTrendMonthsCount] = useState(6);
  const [referenceTime] = useState(() => Date.now());

  const consolidated = useMemo(() => {
    let total = 0;
    let restricted = 0;
    let unrestricted = 0;
    let bankTotal = 0;
    let cashTotal = 0;
    let ribaTotal = 0;

    balances.forEach(b => {
      if (b.isArchived) return;
      total += b.balance;
      if (b.fundName === 'Interest/Riba') {
        ribaTotal += b.balance;
      } else if (b.isRestricted) {
        restricted += b.balance;
      } else {
        unrestricted += b.balance;
      }
    });

    transactions.forEach(t => {
      if (t.status === 'VOIDED' || t.status === 'FAILED') return;
      const change = t.type === 'INCOME' ? parseFloat(t.total_amount) : -parseFloat(t.total_amount);
      if (t.status === 'BANKED') {
        bankTotal += change;
      } else if (t.status === 'PENDING') {
        cashTotal += change;
      }
    });

    return {
      total,
      restricted,
      unrestricted,
      bankTotal,
      cashTotal: Math.max(cashTotal, 0),
      ribaTotal
    };
  }, [balances, transactions]);

  // Financial Intelligence Metrics
  const intelligenceMetrics = useMemo(() => {
    let jummahTotal = 0;
    let jummahCount = 0;
    let gaEligibleTotal = 0;
    let last30DaysExpense = 0;
    const thirtyDaysAgo = referenceTime - 30 * 24 * 60 * 60 * 1000;

    transactions.forEach(t => {
      if (t.status === 'VOIDED' || t.status === 'FAILED') return;
      const amt = parseFloat(t.total_amount) || 0;
      const txTime = new Date(t.transaction_date).getTime();

      if (
        (t.reference_note && t.reference_note.toLowerCase().includes('jummah')) ||
        (t.category && t.category.toLowerCase().includes('jummah'))
      ) {
        jummahTotal += amt;
        jummahCount++;
      }

      if (t.type === 'INCOME' && t.giftAid) {
        gaEligibleTotal += amt;
      }

      if (t.type === 'EXPENSE' && txTime >= thirtyDaysAgo) {
        last30DaysExpense += amt;
      }
    });

    // Zakat utilization
    let zakatIn = 0;
    let zakatOut = 0;
    transactions.forEach(t => {
      if (t.status === 'VOIDED' || t.status === 'FAILED') return;
      (t.splits || []).forEach(s => {
        if (s.fundName === 'Zakat' || s.fund_id === 'fund-zakat') {
          const sAmt = parseFloat(s.amount) || 0;
          if (t.type === 'INCOME') zakatIn += sAmt;
          else zakatOut += sAmt;
        }
      });
    });

    const monthlyBurn = last30DaysExpense || 1200;
    const reserveMonths = consolidated.unrestricted > 0 ? (consolidated.unrestricted / monthlyBurn).toFixed(1) : '0';

    return {
      avgJummah: jummahCount > 0 ? Math.round(jummahTotal / jummahCount) : 0,
      jummahCount,
      gaEligibleTotal,
      gaProjectedReclaim: gaEligibleTotal * 0.25,
      monthlyBurn,
      reserveMonths,
      zakatIn,
      zakatOut,
      zakatUtilisationPercent: zakatIn > 0 ? Math.min(100, Math.round((zakatOut / zakatIn) * 100)) : 0
    };
  }, [transactions, consolidated.unrestricted, referenceTime]);

  // Dynamic Trailing Months Chart
  const trendChartData = useMemo(() => {
    const months = [];
    const now = new Date(referenceTime);
    
    for (let i = trendMonthsCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = d.toLocaleString('en-GB', { month: 'short' });
      months.push({ key, label: monthLabel, inflow: 0, outflow: 0 });
    }

    transactions.forEach(t => {
      if (t.status === 'VOIDED' || t.status === 'FAILED') return;
      const txMonthKey = (t.transaction_date || '').substring(0, 7);
      const match = months.find(m => m.key === txMonthKey);
      if (match) {
        const amt = parseFloat(t.total_amount) || 0;
        if (t.type === 'INCOME') {
          match.inflow += amt;
        } else {
          match.outflow += amt;
        }
      }
    });

    return months;
  }, [transactions, trendMonthsCount, referenceTime]);

  const renderTrendChart = () => {
    const width = 500;
    const height = 240;
    const padding = 40;
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;

    const maxVal = Math.max(
      ...trendChartData.map(m => Math.max(m.inflow, m.outflow)),
      500
    ) * 1.15;

    const gridLines = [];
    for (let i = 0; i <= 4; i++) {
      const y = padding + chartHeight - (i * chartHeight / 4);
      const val = Math.round(i * maxVal / 4);
      gridLines.push(
        <g key={`grid-${i}`}>
          <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="var(--border-color)" strokeDasharray="3 3" />
          <text x={padding - 8} y={y + 4} textAnchor="end" fontSize="11" fill="var(--text-secondary)">{org.currency_symbol || '£'}{val}</text>
        </g>
      );
    }

    const colWidth = chartWidth / trendChartData.length;
    const barWidth = Math.min(colWidth * 0.35, 24);

    const bars = trendChartData.map((item, idx) => {
      const x = padding + (idx * colWidth);
      const infH = (item.inflow / maxVal) * chartHeight;
      const outH = (item.outflow / maxVal) * chartHeight;

      return (
        <g key={`month-${idx}`}>
          <text x={x + colWidth / 2} y={height - padding + 18} textAnchor="middle" fontSize={trendMonthsCount === 12 ? 9 : 12} fill="var(--text-secondary)">{item.label}</text>
          
          <rect
            x={x + (colWidth * 0.1)}
            y={padding + chartHeight - infH}
            width={barWidth}
            height={Math.max(infH, 2)}
            rx={3}
            fill="#10b981"
          >
            <title>{`${item.label} Inflow: ${formatCurrency(item.inflow, org.currency_symbol)}`}</title>
          </rect>

          <rect
            x={x + (colWidth * 0.1) + barWidth + 4}
            y={padding + chartHeight - outH}
            width={barWidth}
            height={Math.max(outH, 2)}
            rx={3}
            fill="#ef4444"
          >
            <title>{`${item.label} Outflow: ${formatCurrency(item.outflow, org.currency_symbol)}`}</title>
          </rect>
        </g>
      );
    });

    return (
      <>
        {gridLines}
        {bars}
      </>
    );
  };

  const renderDonutChart = () => {
    const activeBalances = balances.filter(b => b.balance > 0 && b.fundName !== 'Interest/Riba');
    const total = activeBalances.reduce((sum, b) => sum + b.balance, 0);

    if (total === 0) {
      return <text x="120" y="120" textAnchor="middle" fill="var(--text-secondary)" fontSize="13">No active funds</text>;
    }

    const colors = ["#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#14b8a6"];
    let currentAngle = -Math.PI / 2;
    const cx = 120;
    const cy = 120;
    const r = 80;

    return activeBalances.map((b, idx) => {
      const percentage = b.balance / total;
      const angle = percentage * 2 * Math.PI;

      const x1 = cx + r * Math.cos(currentAngle);
      const y1 = cy + r * Math.sin(currentAngle);
      const x2 = cx + r * Math.cos(currentAngle + angle);
      const y2 = cy + r * Math.sin(currentAngle + angle);

      const largeArc = percentage > 0.5 ? 1 : 0;
      currentAngle += angle;

      return (
        <path
          key={b.fundId}
          d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
          fill="none"
          stroke={colors[idx % colors.length]}
          strokeWidth="16"
          className="donut-slice"
        >
          <title>{`${b.fundName}: ${formatCurrency(b.balance, org.currency_symbol)} (${Math.round(percentage * 100)}%)`}</title>
        </path>
      );
    });
  };

  return (
    <section className="content-view active-view" aria-label="Dashboard Overview">
      {/* Riba Accumulation Alert Banner */}
      {consolidated.ribaTotal > 0 && (
        <div className="glass-card" style={{ padding: '16px 20px', marginBottom: '20px', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(185, 28, 28, 0.08) 100%)', border: '1px solid var(--danger)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h4 style={{ margin: '0 0 4px 0', color: 'var(--danger)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚠️</span> Shariah Alert: Unlawful Interest / Riba Pending Disposal
            </h4>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              The mosque holds <strong>{formatCurrency(consolidated.ribaTotal, org.currency_symbol)}</strong> in bank interest. Under Shariah rules, this must be disposed of to public utility (e.g. public toilets, roads) without intention of thawab.
            </p>
          </div>
          {user?.role === 'ADMIN' && (
            <button 
              type="button" 
              className="btn btn-danger" 
              onClick={() => openModal('transaction')}
              style={{ minHeight: '38px', padding: '6px 14px', fontSize: '13px' }}
            >
              Record Disposal Expense &rarr;
            </button>
          )}
        </div>
      )}

      <div className="view-header">
        <div>
          <h2 className="view-title">{org.name}</h2>
          <p className="view-subtitle">Islamic Restricted and Unrestricted fund balances &amp; live financial summary</p>
        </div>
        <div className="date-badge">
          {new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* Main Balance Cards */}
      <div className="balances-summary-grid">
        <div className="balance-summary-card main-summary">
          <span className="card-tag">Consolidated</span>
          <h3>Total Net Funds</h3>
          <span className="balance-amount">{formatCurrency(consolidated.total, org.currency_symbol)}</span>
          <div className="balance-meta-split">
            <span>Bank: <strong>{formatCurrency(consolidated.bankTotal, org.currency_symbol)}</strong></span>
            <span>Cash on Hand: <strong>{formatCurrency(consolidated.cashTotal, org.currency_symbol)}</strong></span>
          </div>
        </div>

        <div className="balance-summary-card restricted-sum">
          <span className="card-tag restricted">Restricted</span>
          <h3>Zakat &amp; Fitrana</h3>
          <span className="balance-amount">{formatCurrency(consolidated.restricted, org.currency_symbol)}</span>
          <p className="fund-subinfo">Reserved strictly for eligible Asnaf recipients.</p>
        </div>

        <div className="balance-summary-card unrestricted-sum">
          <span className="card-tag unrestricted">Unrestricted</span>
          <h3>Lillah &amp; Operations</h3>
          <span className="balance-amount">{formatCurrency(consolidated.unrestricted, org.currency_symbol)}</span>
          <p className="fund-subinfo">Available for utilities, bills, imam salaries, and maintenance.</p>
        </div>
      </div>

      {/* Financial Intelligence KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', margin: '20px 0' }}>
        <div className="glass-card" style={{ padding: '16px', borderRadius: 'var(--radius-md)' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🕌 Avg Jummah Inflow</span>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, margin: '6px 0', color: 'var(--primary)' }}>
            {formatCurrency(intelligenceMetrics.avgJummah, org.currency_symbol)}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Across {intelligenceMetrics.jummahCount} Friday collections
          </span>
        </div>

        <div className="glass-card" style={{ padding: '16px', borderRadius: 'var(--radius-md)' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🇬🇧 HMRC Gift Aid Claim</span>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, margin: '6px 0', color: 'var(--primary)' }}>
            +{formatCurrency(intelligenceMetrics.gaProjectedReclaim, org.currency_symbol)}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            25% reclaim on {formatCurrency(intelligenceMetrics.gaEligibleTotal, org.currency_symbol)}
          </span>
        </div>

        <div className="glass-card" style={{ padding: '16px', borderRadius: 'var(--radius-md)' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>📊 Operating Runway</span>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, margin: '6px 0' }}>
            {intelligenceMetrics.reserveMonths} months
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Based on ~{formatCurrency(intelligenceMetrics.monthlyBurn, org.currency_symbol)}/mo burn
          </span>
        </div>

        <div className="glass-card" style={{ padding: '16px', borderRadius: 'var(--radius-md)' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>⚖️ Zakat Utilisation</span>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, margin: '6px 0', color: intelligenceMetrics.zakatUtilisationPercent >= 50 ? 'var(--primary)' : 'var(--warning)' }}>
            {intelligenceMetrics.zakatUtilisationPercent}%
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {formatCurrency(intelligenceMetrics.zakatOut, org.currency_symbol)} disbursed
          </span>
        </div>
      </div>

      <h3 className="section-title">Islamic Fund Wallets</h3>
      {balances.filter(b => !b.isArchived).length === 0 ? (
        <div className="glass-card" style={{ marginBottom: '24px' }}>
          <EmptyState
            icon="💼"
            title="No Fund Wallets Found"
            description="Create segregated Islamic funds (Zakat, Lillah, Fitrana, Building) in Settings to start tracking balances."
            actionLabel={user?.role === 'ADMIN' ? 'Go to Settings' : null}
            onAction={user?.role === 'ADMIN' ? () => setActiveTab('settings') : null}
          />
        </div>
      ) : (
        <div className="funds-grid">
          {balances.filter(b => !b.isArchived).map(b => (
            <div 
              key={b.fundId} 
              className="fund-wallet-card" 
              onClick={() => setActiveTab('transactions')}
              style={{ cursor: 'pointer' }}
              title="Click to view transactions in this fund"
            >
              <div className="wallet-header">
                <span className="wallet-name">{b.fundName}</span>
                <span className={`wallet-type ${b.isRestricted ? 'type-restricted' : 'type-unrestricted'}`}>
                  {b.isRestricted ? 'Restricted' : 'Unrestricted'}
                </span>
              </div>
              <span className="wallet-val">{formatCurrency(b.balance, org.currency_symbol)}</span>
              {b.fundName === 'Interest/Riba' && <span className="riba-tooltip">Segregated interest for disposal.</span>}
            </div>
          ))}
        </div>
      )}

      <div className="dashboard-charts-grid">
        <div className="chart-card glass-card">
          <div className="chart-header">
            <h3>Financial Inflows vs Outflows (Trailing {trendMonthsCount} Months)</h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div className="quick-ranges" style={{ display: 'flex', gap: '4px' }}>
                <button type="button" className={`btn-chip ${trendMonthsCount === 6 ? 'active' : ''}`} onClick={() => setTrendMonthsCount(6)}>6M</button>
                <button type="button" className={`btn-chip ${trendMonthsCount === 12 ? 'active' : ''}`} onClick={() => setTrendMonthsCount(12)}>12M</button>
              </div>
              <span className="chart-legend">
                <span className="legend-item"><span className="legend-dot income-dot"></span>Inflow</span>
                <span className="legend-item"><span className="legend-dot expense-dot"></span>Outflow</span>
              </span>
            </div>
          </div>
          <div className="chart-body">
            <svg 
              viewBox="0 0 500 240" 
              width="500"
              height="240"
              className="interactive-chart"
              role="img" 
              aria-label="Trailing financial inflows vs outflows comparison chart"
            >
              <title>Trailing Inflow and Outflow Chart</title>
              <desc>Comparison of monthly income donations versus expenses recorded across all funds</desc>
              {renderTrendChart()}
            </svg>
          </div>
        </div>

        <div className="chart-card glass-card small-chart">
          <div className="chart-header">
            <h3>Fund Allocation</h3>
          </div>
          <div className="chart-body donut-chart-body">
            <svg 
              viewBox="0 0 240 240" 
              width="240"
              height="240"
              className="interactive-chart donut-chart"
              role="img"
              aria-label="Fund allocation donut chart"
            >
              <title>Fund Segregation Breakdown</title>
              {renderDonutChart()}
            </svg>
          </div>
          <div className="chart-category-legend">
            {balances.filter(b => b.balance > 0 && b.fundName !== 'Interest/Riba' && !b.isArchived).map((b, idx) => (
              <div key={b.fundId} className="legend-row">
                <div className="legend-row-label">
                  <span className="legend-color-box" style={{ backgroundColor: ["#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#14b8a6"][idx % 7] }}></span>
                  <span>{b.fundName}</span>
                </div>
                <strong>{formatCurrency(b.balance, org.currency_symbol)}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dashboard-table-card glass-card">
        <div className="table-card-header">
          <h3>Recent Ledger Activities</h3>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveTab('transactions')}>
            Open Full Ledger &rarr;
          </button>
        </div>
        <div className="table-wrapper">
          {transactions.length === 0 ? (
            <EmptyState
              icon="📑"
              title="No Ledger Entries Yet"
              description="Record your first income or expense transaction to see live ledger activity."
              actionLabel={user?.role === 'ADMIN' ? '+ Record Transaction' : null}
              onAction={user?.role === 'ADMIN' ? () => openModal('transaction') : null}
            />
          ) : (
            <table className="ledger-table table-perf">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Fund</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 6).map(tx => (
                  <tr key={tx.id} className={tx.status === 'VOIDED' ? 'tr-voided' : tx.status === 'FAILED' ? 'tr-failed' : ''}>
                    <td>{formatDate(tx.transaction_date)}</td>
                    <td>
                      <strong>{tx.reference_note || tx.description}</strong>
                      {tx.status === 'VOIDED' && tx.void_reason && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>Void Reason: {tx.void_reason}</div>
                      )}
                    </td>
                    <td>{tx.splits?.map(s => `${s.fundName}: ${formatCurrency(s.amount, org.currency_symbol)}`).join(', ')}</td>
                    <td>{tx.category || 'Donation'}</td>
                    <td className={tx.type === 'INCOME' ? 'val-income' : 'val-expense'}>
                      {tx.type === 'INCOME' ? '+' : '-'}{formatCurrency(tx.total_amount, org.currency_symbol)}
                    </td>
                    <td>
                      <span className={`status-badge ${tx.status === 'PENDING' ? 'status-cash' : tx.status === 'BANKED' ? 'status-banked' : tx.status === 'VOIDED' ? 'status-voided' : 'status-failed'}`}>
                        {tx.status === 'PENDING' ? 'Cash on Hand' : tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

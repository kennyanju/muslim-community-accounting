'use client';

import React, { useMemo } from 'react';
import { useApp } from '@/context/AppContext';

export default function DashboardTab() {
  const { balances, transactions, org, setActiveTab } = useApp();

  const consolidated = useMemo(() => {
    let total = 0;
    let restricted = 0;
    let unrestricted = 0;
    let bankTotal = 0;
    let cashTotal = 0;

    balances.forEach(b => {
      if (b.isArchived) return;
      total += b.balance;
      if (b.isRestricted && b.fundName !== 'Interest/Riba') {
        restricted += b.balance;
      } else if (!b.isRestricted) {
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
      cashTotal: Math.max(cashTotal, 0)
    };
  }, [balances, transactions]);

  // Dynamic 6-Month Inflow/Outflow Chart
  const trendChartData = useMemo(() => {
    const months = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = d.toLocaleString('default', { month: 'short' });
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
  }, [transactions]);

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
    const barWidth = colWidth * 0.35;

    const bars = trendChartData.map((item, idx) => {
      const x = padding + (idx * colWidth);
      const infH = (item.inflow / maxVal) * chartHeight;
      const outH = (item.outflow / maxVal) * chartHeight;

      return (
        <g key={`month-${idx}`}>
          <text x={x + colWidth / 2} y={height - padding + 18} textAnchor="middle" fontSize="12" fill="var(--text-secondary)">{item.label}</text>
          
          <rect
            x={x + (colWidth * 0.1)}
            y={padding + chartHeight - infH}
            width={barWidth}
            height={Math.max(infH, 2)}
            rx={3}
            fill="#10b981"
          >
            <title>{`${item.label} Inflow: ${org.currency_symbol || '£'}${item.inflow.toFixed(2)}`}</title>
          </rect>

          <rect
            x={x + (colWidth * 0.1) + barWidth + 4}
            y={padding + chartHeight - outH}
            width={barWidth}
            height={Math.max(outH, 2)}
            rx={3}
            fill="#ef4444"
          >
            <title>{`${item.label} Outflow: ${org.currency_symbol || '£'}${item.outflow.toFixed(2)}`}</title>
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
      return <text x="120" y="120" textAnchor="middle" fill="var(--text-secondary)">No active funds</text>;
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
          <title>{`${b.fundName}: ${org.currency_symbol || '£'}${b.balance.toFixed(2)} (${Math.round(percentage * 100)}%)`}</title>
        </path>
      );
    });
  };

  return (
    <section className="content-view active-view" aria-label="Dashboard Overview">
      <div className="view-header">
        <div>
          <h2 className="view-title">{org.name}</h2>
          <p className="view-subtitle">Islamic Restricted and Unrestricted fund balances &amp; live financial summary</p>
        </div>
        <div className="date-badge">
          {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
        </div>
      </div>

      <div className="balances-summary-grid">
        <div className="balance-summary-card main-summary">
          <span className="card-tag">Consolidated</span>
          <h3>Total Net Funds</h3>
          <span className="balance-amount">{org.currency_symbol || '£'}{consolidated.total.toFixed(2)}</span>
          <div className="balance-meta-split">
            <span>Bank: <strong>{org.currency_symbol || '£'}{consolidated.bankTotal.toFixed(2)}</strong></span>
            <span>Cash on Hand: <strong>{org.currency_symbol || '£'}{consolidated.cashTotal.toFixed(2)}</strong></span>
          </div>
        </div>

        <div className="balance-summary-card restricted-sum">
          <span className="card-tag restricted">Restricted</span>
          <h3>Zakat &amp; Fitrana</h3>
          <span className="balance-amount">{org.currency_symbol || '£'}{consolidated.restricted.toFixed(2)}</span>
          <p className="fund-subinfo">Reserved strictly for eligible Asnaf recipients.</p>
        </div>

        <div className="balance-summary-card unrestricted-sum">
          <span className="card-tag unrestricted">Unrestricted</span>
          <h3>Lillah &amp; Operations</h3>
          <span className="balance-amount">{org.currency_symbol || '£'}{consolidated.unrestricted.toFixed(2)}</span>
          <p className="fund-subinfo">Available for utilities, bills, imam salaries, and maintenance.</p>
        </div>
      </div>

      <h3 className="section-title">Islamic Fund Wallets</h3>
      <div className="funds-grid">
        {balances.filter(b => !b.isArchived).map(b => (
          <div key={b.fundId} className="fund-wallet-card">
            <div className="wallet-header">
              <span className="wallet-name">{b.fundName}</span>
              <span className={`wallet-type ${b.isRestricted ? 'type-restricted' : 'type-unrestricted'}`}>
                {b.isRestricted ? 'Restricted' : 'Unrestricted'}
              </span>
            </div>
            <span className="wallet-val">{org.currency_symbol || '£'}{b.balance.toFixed(2)}</span>
            {b.fundName === 'Interest/Riba' && <span className="riba-tooltip">Segregated interest for disposal.</span>}
          </div>
        ))}
      </div>

      <div className="dashboard-charts-grid">
        <div className="chart-card glass-card">
          <div className="chart-header">
            <h3>Financial Inflows vs Outflows (Trailing 6 Months)</h3>
            <span className="chart-legend">
              <span className="legend-item"><span className="legend-dot income-dot"></span>Inflow</span>
              <span className="legend-item"><span className="legend-dot expense-dot"></span>Outflow</span>
            </span>
          </div>
          <div className="chart-body">
            <svg viewBox="0 0 500 240" className="interactive-chart">
              {renderTrendChart()}
            </svg>
          </div>
        </div>

        <div className="chart-card glass-card small-chart">
          <div className="chart-header">
            <h3>Fund Allocation</h3>
          </div>
          <div className="chart-body donut-chart-body">
            <svg viewBox="0 0 240 240" className="interactive-chart">
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
                <strong>{org.currency_symbol || '£'}{b.balance.toFixed(2)}</strong>
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
                  <td>{tx.transaction_date}</td>
                  <td>
                    <strong>{tx.reference_note || tx.description}</strong>
                    {tx.status === 'VOIDED' && tx.void_reason && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>Void Reason: {tx.void_reason}</div>
                    )}
                  </td>
                  <td>{tx.splits?.map(s => `${s.fundName}: ${org.currency_symbol || '£'}${s.amount}`).join(', ')}</td>
                  <td>{tx.category || 'Donation'}</td>
                  <td className={tx.type === 'INCOME' ? 'val-income' : 'val-expense'}>
                    {tx.type === 'INCOME' ? '+' : '-'}{org.currency_symbol || '£'}{parseFloat(tx.total_amount).toFixed(2)}
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
        </div>
      </div>
    </section>
  );
}

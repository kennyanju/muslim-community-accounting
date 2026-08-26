'use client';

import React, { useState, useMemo } from 'react';
import { useApp } from '@/context/AppContext';

export default function ReportsTab() {
  const { transactions, balances, auditLogs, org } = useApp();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const filteredTx = useMemo(() => {
    let list = transactions.filter(t => t.status !== 'VOIDED' && t.status !== 'FAILED');
    if (dateFrom) {
      const fromTime = new Date(dateFrom).getTime();
      list = list.filter(t => {
        const txTime = new Date(t.transaction_date).getTime();
        return !isNaN(txTime) && !isNaN(fromTime) ? txTime >= fromTime : t.transaction_date >= dateFrom;
      });
    }
    if (dateTo) {
      const toTime = new Date(dateTo + (dateTo.length <= 10 ? 'T23:59:59.999Z' : '')).getTime();
      list = list.filter(t => {
        const txTime = new Date(t.transaction_date).getTime();
        return !isNaN(txTime) && !isNaN(toTime) ? txTime <= toTime : t.transaction_date <= dateTo;
      });
    }
    return list;
  }, [transactions, dateFrom, dateTo]);

  const pl = useMemo(() => {
    const income = {};
    const opExpense = {};
    const restrictedDisb = {};

    let totalInc = 0;
    let totalOp = 0;
    let totalRest = 0;

    filteredTx.forEach(t => {
      const amt = parseFloat(t.total_amount) || 0;
      const cat = t.category || (t.type === 'INCOME' ? 'Donation' : 'Other');
      
      if (t.type === 'INCOME') {
        income[cat] = (income[cat] || 0) + amt;
        totalInc += amt;
      } else {
        const isRestricted = t.splits?.some(s => s.fundName === 'Zakat' || s.fundName === 'Fitrana');
        if (isRestricted) {
          restrictedDisb[cat] = (restrictedDisb[cat] || 0) + amt;
          totalRest += amt;
        } else {
          opExpense[cat] = (opExpense[cat] || 0) + amt;
          totalOp += amt;
        }
      }
    });

    return {
      income,
      opExpense,
      restrictedDisb,
      totalInc,
      totalOp,
      totalRest,
      net: totalInc - totalOp - totalRest
    };
  }, [filteredTx]);

  const triggerGiftAidDownload = () => {
    let url = '/api/reports/giftaid';
    const params = [];
    if (dateFrom) params.push(`dateFrom=${dateFrom}`);
    if (dateTo) params.push(`dateTo=${dateTo}`);
    if (params.length > 0) url += `?${params.join('&')}`;
    window.open(url, '_blank');
  };

  return (
    <section className="content-view active-view" aria-label="Financial Reports">
      <div className="view-header">
        <div>
          <h2 className="view-title">Financial Statements &amp; Audit Logs</h2>
          <p className="view-subtitle">Income &amp; Expenditure statement, Shariah compliance breakdown, and HMRC Gift Aid schedule</p>
        </div>
        <div className="view-actions">
          <button type="button" className="btn btn-outline" onClick={triggerGiftAidDownload}>
            <span aria-hidden="true">📋</span> HMRC Gift Aid Schedule
          </button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <span aria-hidden="true">🖨️</span> Print Statement
          </button>
        </div>
      </div>

      <div className="filter-toolbar glass-card">
        <div className="filter-row">
          <div className="date-inputs">
            <label htmlFor="report-from" className="preset-label">Reporting Period:</label>
            <input 
              id="report-from"
              type="date" 
              value={dateFrom} 
              onChange={e => setDateFrom(e.target.value)} 
              title="From Date"
              aria-label="Reporting Date From"
            />
            <span>to</span>
            <input 
              id="report-to"
              type="date" 
              value={dateTo} 
              onChange={e => setDateTo(e.target.value)} 
              title="To Date"
              aria-label="Reporting Date To"
            />
            {(dateFrom || dateTo) && (
              <button 
                type="button" 
                className="btn-preset" 
                onClick={() => { setDateFrom(''); setDateTo(''); }}
              >
                Clear Dates
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="reports-container-grid">
        <div className="report-block glass-card print-report-area">
          <div className="report-block-header">
            <h2>{org.name}</h2>
            <h3>Statement of Financial Activities (SOFA)</h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Charity Reg No. {org.charity_number} &bull; Reporting Date: {new Date().toLocaleDateString('en-GB')}
              {(dateFrom || dateTo) && ` (${dateFrom || 'Start'} to ${dateTo || 'Present'})`}
            </span>
          </div>
          
          <div className="pl-statement">
            <div className="pl-section">
              <h4 className="pl-section-title">1. Incoming Resources (Income)</h4>
              <div className="pl-rows">
                {Object.keys(pl.income).length === 0 ? (
                  <div className="pl-row"><span>No income recorded</span><span>{org.currency_symbol || '£'}0.00</span></div>
                ) : (
                  Object.keys(pl.income).map(cat => (
                    <div key={cat} className="pl-row">
                      <span>{cat}</span>
                      <span>{org.currency_symbol || '£'}{pl.income[cat].toFixed(2)}</span>
                    </div>
                  ))
                )}
              </div>
              <div className="pl-row pl-total-row">
                <span>Total Incoming Resources</span>
                <span>{org.currency_symbol || '£'}{pl.totalInc.toFixed(2)}</span>
              </div>
            </div>

            <div className="pl-section">
              <h4 className="pl-section-title">2. Operational Expenses (Lillah &amp; Unrestricted)</h4>
              <div className="pl-rows">
                {Object.keys(pl.opExpense).length === 0 ? (
                  <div className="pl-row"><span>No operating expenses</span><span>{org.currency_symbol || '£'}0.00</span></div>
                ) : (
                  Object.keys(pl.opExpense).map(cat => (
                    <div key={cat} className="pl-row">
                      <span>{cat}</span>
                      <span className="expense-val">{org.currency_symbol || '£'}{pl.opExpense[cat].toFixed(2)}</span>
                    </div>
                  ))
                )}
              </div>
              <div className="pl-row pl-total-row">
                <span>Total Operating Costs</span>
                <span className="expense-val">{org.currency_symbol || '£'}{pl.totalOp.toFixed(2)}</span>
              </div>
            </div>

            <div className="pl-section">
              <h4 className="pl-section-title">3. Charitable Disbursements (Restricted Zakat &amp; Fitrana)</h4>
              <div className="pl-rows">
                {Object.keys(pl.restrictedDisb).length === 0 ? (
                  <div className="pl-row"><span>No restricted payouts</span><span>{org.currency_symbol || '£'}0.00</span></div>
                ) : (
                  Object.keys(pl.restrictedDisb).map(cat => (
                    <div key={cat} className="pl-row">
                      <span>{cat}</span>
                      <span className="expense-val">{org.currency_symbol || '£'}{pl.restrictedDisb[cat].toFixed(2)}</span>
                    </div>
                  ))
                )}
              </div>
              <div className="pl-row pl-total-row">
                <span>Total Restricted Payouts</span>
                <span className="expense-val">{org.currency_symbol || '£'}{pl.totalRest.toFixed(2)}</span>
              </div>
            </div>

            <div className="pl-section pl-net-income-section">
              <div className="pl-row pl-net-income-row">
                <span>Net Surplus / (Deficit) for Period</span>
                <span className={pl.net >= 0 ? 'text-success' : 'expense-val'} style={{ fontWeight: 800 }}>
                  {org.currency_symbol || '£'}{pl.net.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="report-side-column">
          <div className="analytics-stat-card glass-card">
            <h3>Fund Segregation Compliance</h3>
            <div className="compliance-metric">
              <span>Zakat Fund:</span>
              <strong>{org.currency_symbol || '£'}{(balances.find(b => b.fundName === 'Zakat')?.balance || 0).toFixed(2)}</strong>
            </div>
            <div className="compliance-metric">
              <span>Fitrana Fund:</span>
              <strong>{org.currency_symbol || '£'}{(balances.find(b => b.fundName === 'Fitrana')?.balance || 0).toFixed(2)}</strong>
            </div>
            <div className="compliance-metric">
              <span>Interest/Riba Segregated:</span>
              <strong className="expense-val">{org.currency_symbol || '£'}{(balances.find(b => b.fundName === 'Interest/Riba')?.balance || 0).toFixed(2)}</strong>
            </div>
            <hr style={{ borderColor: 'var(--border-color)', margin: '12px 0' }} />
            <p className="micro-text" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              🔒 Shariah Rule: Restricted funds (Zakat &amp; Fitrana) can only be disbursed under Charitable Payout to eligible Asnaf recipients.
            </p>
          </div>

          <div className="analytics-stat-card glass-card">
            <h3>System Audit Trails</h3>
            <div className="audit-timeline" style={{ maxHeight: '360px', overflowY: 'auto' }}>
              {(auditLogs || []).slice(0, 20).map(log => (
                <div key={log.id} className="timeline-item" style={{ padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span className="timeline-time" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block' }}>
                    {new Date(log.timestamp).toLocaleString('en-GB')} by <strong>{log.userEmail || log.userName || log.user_id}</strong>
                  </span>
                  <span className="timeline-desc" style={{ fontSize: '0.8rem' }}>
                    {`Action ${log.action} on ${log.table_name} [${log.record_id}]`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

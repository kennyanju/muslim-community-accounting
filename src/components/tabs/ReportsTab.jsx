'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { useDebounce } from '@/hooks/usePerformanceHooks';
import EmptyState from '@/components/common/EmptyState';
import { formatCurrency } from '@/utils/formatters';

export default function ReportsTab() {
  const { transactions, balances, auditLogs, org, openModal } = useApp();

  const [reportFormat, setReportFormat] = useState('sofa'); // 'sofa' | 'cc16'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isExportingGiftAid, setIsExportingGiftAid] = useState(false);
  const [isExportingAnnual, setIsExportingAnnual] = useState(false);
  const [isExportingCC16, setIsExportingCC16] = useState(false);

  const [cc16Data, setCc16Data] = useState(null);
  const [loadingCC16, setLoadingCC16] = useState(false);

  // Debounce date inputs
  const debouncedDateFrom = useDebounce(dateFrom, 250);
  const debouncedDateTo = useDebounce(dateTo, 250);

  // Fetch CC16 data when viewing CC16 format
  useEffect(() => {
    if (reportFormat !== 'cc16') return;

    let active = true;
    let url = '/api/reports/cc16?format=json';
    if (debouncedDateFrom) url += `&dateFrom=${debouncedDateFrom}`;
    if (debouncedDateTo) url += `&dateTo=${debouncedDateTo}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (active && data.success && data.data) {
          setCc16Data(data.data);
        }
      })
      .catch(err => console.error('Failed to load CC16 statement:', err))
      .finally(() => {
        if (active) setLoadingCC16(false);
      });

    return () => {
      active = false;
    };
  }, [reportFormat, debouncedDateFrom, debouncedDateTo]);

  const filteredTx = useMemo(() => {
    let list = transactions.filter(t => t.status !== 'VOIDED' && t.status !== 'FAILED');
    if (debouncedDateFrom) {
      const fromTime = new Date(debouncedDateFrom).getTime();
      list = list.filter(t => {
        const txTime = new Date(t.transaction_date).getTime();
        return !isNaN(txTime) && !isNaN(fromTime) ? txTime >= fromTime : t.transaction_date >= debouncedDateFrom;
      });
    }
    if (debouncedDateTo) {
      const toTime = new Date(debouncedDateTo + (debouncedDateTo.length <= 10 ? 'T23:59:59.999Z' : '')).getTime();
      list = list.filter(t => {
        const txTime = new Date(t.transaction_date).getTime();
        return !isNaN(txTime) && !isNaN(toTime) ? txTime <= toTime : t.transaction_date <= debouncedDateTo;
      });
    }
    return list;
  }, [transactions, debouncedDateFrom, debouncedDateTo]);

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
    setIsExportingGiftAid(true);
    let url = '/api/reports?type=giftaid';
    if (dateFrom) url += `&dateFrom=${dateFrom}`;
    if (dateTo) url += `&dateTo=${dateTo}`;
    window.open(url, '_blank');
    setTimeout(() => setIsExportingGiftAid(false), 1200);
  };

  const triggerAnnualReportDownload = () => {
    setIsExportingAnnual(true);
    let url = '/api/reports?type=annual';
    if (dateFrom) url += `&dateFrom=${dateFrom}`;
    if (dateTo) url += `&dateTo=${dateTo}`;
    window.open(url, '_blank');
    setTimeout(() => setIsExportingAnnual(false), 1200);
  };

  const triggerCC16Download = () => {
    setIsExportingCC16(true);
    let url = '/api/reports/cc16?format=csv';
    if (dateFrom) url += `&dateFrom=${dateFrom}`;
    if (dateTo) url += `&dateTo=${dateTo}`;
    window.open(url, '_blank');
    setTimeout(() => setIsExportingCC16(false), 1200);
  };

  return (
    <section className="content-view active-view" aria-label="Financial Statements and Reports">
      <div className="view-header">
        <div>
          <h2 className="view-title">Financial Statements &amp; Audit Reports</h2>
          <p className="view-subtitle">UK Charity Commission annual return &amp; HMRC Gift Aid claim schedules</p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button
              type="button"
              className={`btn btn-sm ${reportFormat === 'sofa' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setReportFormat('sofa')}
            >
              📋 SoFA (Income &amp; Expenditure)
            </button>
            <button
              type="button"
              className={`btn btn-sm ${reportFormat === 'cc16' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setReportFormat('cc16')}
            >
              🏛️ Charity Commission CC16
            </button>
          </div>
        </div>
        <div className="view-actions">
          {reportFormat === 'cc16' ? (
            <>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={triggerCC16Download} 
                disabled={isExportingCC16}
                style={{ minHeight: '44px' }}
              >
                <span aria-hidden="true">{isExportingCC16 ? '⏳' : '📥'}</span> {isExportingCC16 ? 'Exporting...' : 'Export CC16 (CSV)'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => window.print()} style={{ minHeight: '44px' }}>
                <span aria-hidden="true">🖨️</span> Print CC16
              </button>
            </>
          ) : (
            <>
              <button 
                type="button" 
                className="btn btn-outline" 
                onClick={triggerGiftAidDownload} 
                disabled={isExportingGiftAid}
                style={{ minHeight: '44px' }}
              >
                <span aria-hidden="true">{isExportingGiftAid ? '⏳' : '📑'}</span> {isExportingGiftAid ? 'Exporting...' : 'Export HMRC Gift Aid CSV'}
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={triggerAnnualReportDownload} 
                disabled={isExportingAnnual}
                style={{ minHeight: '44px' }}
              >
                <span aria-hidden="true">{isExportingAnnual ? '⏳' : '📥'}</span> {isExportingAnnual ? 'Generating...' : 'Export Annual Return'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => window.print()} style={{ minHeight: '44px' }}>
                <span aria-hidden="true">🖨️</span> Print P&amp;L
              </button>
            </>
          )}
        </div>
      </div>

      <div className="filter-toolbar glass-card">
        <div className="filter-row">
          <div className="date-inputs">
            <label htmlFor="report-from" className="sr-only">Date From</label>
            <input 
              id="report-from"
              type="date" 
              value={dateFrom} 
              onChange={e => setDateFrom(e.target.value)} 
              title="Report Start Date"
              aria-label="Report Start Date"
            />
            <span>to</span>
            <label htmlFor="report-to" className="sr-only">Date To</label>
            <input 
              id="report-to"
              type="date" 
              value={dateTo} 
              onChange={e => setDateTo(e.target.value)} 
              title="Report End Date"
              aria-label="Report End Date"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>
              Clear Dates
            </button>
          )}
        </div>
      </div>

      <div className="reports-layout-grid">
        <div className="print-report-area glass-card">
          <div className="report-doc-header">
            <div className="report-branding">
              <h2>{org.name}</h2>
              <p className="report-meta-text">Registered UK Charity No: <strong>{org.charity_number || 'N/A'}</strong></p>
              <p className="report-meta-text">{org.address}</p>
            </div>
            <div className="report-title-badge">
              <h3>{reportFormat === 'cc16' ? 'RECEIPTS AND PAYMENTS ACCOUNTS (CC16)' : 'STATEMENT OF FINANCIAL ACTIVITIES'}</h3>
              <p>{reportFormat === 'cc16' ? 'Charity Commission Management Return' : 'Income & Expenditure Report'}</p>
              <span className="report-period-tag">
                {dateFrom || dateTo ? `Period: ${dateFrom || 'Inception'} to ${dateTo || 'Present'}` : 'Year to Date'}
              </span>
            </div>
          </div>
          
          {reportFormat === 'cc16' ? (
            loadingCC16 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <span>⏳ Generating CC16 Receipts &amp; Payments Account...</span>
              </div>
            ) : !cc16Data ? (
              <div style={{ padding: '32px 16px' }}>
                <EmptyState
                  icon="📊"
                  title="Unable to load CC16"
                  description="Could not generate the Charity Commission report at this time."
                />
              </div>
            ) : (
              <div className="table-responsive" style={{ marginTop: '16px' }}>
                <table className="data-table cc16-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '10px 12px' }}>Category / Line Item</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Unrestricted Funds ({org.currency_symbol || '£'})</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Restricted Funds ({org.currency_symbol || '£'})</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>Total Funds ({org.currency_symbol || '£'})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Section A: Receipts */}
                    <tr style={{ background: 'rgba(66, 153, 225, 0.08)', fontWeight: 700 }}>
                      <td colSpan={4} style={{ padding: '8px 12px', color: 'var(--primary-color, #3182ce)' }}>
                        SECTION A: RECEIPTS (Incoming Resources)
                      </td>
                    </tr>
                    {cc16Data.receipts.length === 0 ? (
                      <tr><td colSpan={4} style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>No receipts recorded in period</td></tr>
                    ) : (
                      cc16Data.receipts.map(r => (
                        <tr key={r.category} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '8px 12px' }}>{r.category}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatCurrency(r.unrestricted, org.currency_symbol)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatCurrency(r.restricted, org.currency_symbol)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(r.total, org.currency_symbol)}</td>
                        </tr>
                      ))
                    )}
                    <tr style={{ borderTop: '2px solid var(--border-color)', fontWeight: 700 }}>
                      <td style={{ padding: '10px 12px' }}>Total Receipts (A)</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatCurrency(cc16Data.totals.receipts.unrestricted, org.currency_symbol)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatCurrency(cc16Data.totals.receipts.restricted, org.currency_symbol)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--success-color, #38a169)' }}>{formatCurrency(cc16Data.totals.receipts.total, org.currency_symbol)}</td>
                    </tr>

                    {/* Section B: Payments */}
                    <tr style={{ background: 'rgba(229, 62, 62, 0.08)', fontWeight: 700 }}>
                      <td colSpan={4} style={{ padding: '8px 12px', color: 'var(--danger-color, #e53e3e)', marginTop: '12px' }}>
                        SECTION B: PAYMENTS (Resources Expended)
                      </td>
                    </tr>
                    {cc16Data.payments.length === 0 ? (
                      <tr><td colSpan={4} style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>No payments recorded in period</td></tr>
                    ) : (
                      cc16Data.payments.map(p => (
                        <tr key={p.category} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '8px 12px' }}>{p.category}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatCurrency(p.unrestricted, org.currency_symbol)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatCurrency(p.restricted, org.currency_symbol)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(p.total, org.currency_symbol)}</td>
                        </tr>
                      ))
                    )}
                    <tr style={{ borderTop: '2px solid var(--border-color)', fontWeight: 700 }}>
                      <td style={{ padding: '10px 12px' }}>Total Payments (B)</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatCurrency(cc16Data.totals.payments.unrestricted, org.currency_symbol)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatCurrency(cc16Data.totals.payments.restricted, org.currency_symbol)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--danger-color, #e53e3e)' }}>{formatCurrency(cc16Data.totals.payments.total, org.currency_symbol)}</td>
                    </tr>

                    {/* Section C: Net Receipts / (Payments) */}
                    <tr style={{ background: 'var(--card-bg, rgba(255,255,255,0.03))', fontWeight: 800, borderTop: '2px solid var(--border-color)', borderBottom: '2px solid var(--border-color)' }}>
                      <td style={{ padding: '10px 12px' }}>SECTION C: Net Receipts / (Payments) [A - B]</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatCurrency(cc16Data.totals.netReceipts.unrestricted, org.currency_symbol)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatCurrency(cc16Data.totals.netReceipts.restricted, org.currency_symbol)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatCurrency(cc16Data.totals.netReceipts.total, org.currency_symbol)}</td>
                    </tr>

                    {/* Section D: Transfers */}
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>SECTION D: Transfers Between Funds</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatCurrency(cc16Data.totals.transfers.unrestricted, org.currency_symbol)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatCurrency(cc16Data.totals.transfers.restricted, org.currency_symbol)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(cc16Data.totals.transfers.total, org.currency_symbol)}</td>
                    </tr>

                    {/* Section E: Cash & Bank Balances */}
                    <tr style={{ background: 'rgba(72, 187, 120, 0.08)', fontWeight: 700 }}>
                      <td colSpan={4} style={{ padding: '8px 12px', color: 'var(--success-color, #48bb78)' }}>
                        SECTION E: CASH AND BANK BALANCES
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px 12px' }}>Total funds brought forward (Opening Balance)</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatCurrency(cc16Data.totals.openingBalances.unrestricted, org.currency_symbol)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatCurrency(cc16Data.totals.openingBalances.restricted, org.currency_symbol)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(cc16Data.totals.openingBalances.total, org.currency_symbol)}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px 12px' }}>Net movement in funds (C + D)</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatCurrency(cc16Data.totals.netReceipts.unrestricted + cc16Data.totals.transfers.unrestricted, org.currency_symbol)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatCurrency(cc16Data.totals.netReceipts.restricted + cc16Data.totals.transfers.restricted, org.currency_symbol)}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(cc16Data.totals.netReceipts.total, org.currency_symbol)}</td>
                    </tr>
                    <tr style={{ borderTop: '2px solid var(--border-color)', borderBottom: '3px double var(--border-color)', fontWeight: 800, background: 'rgba(72, 187, 120, 0.12)' }}>
                      <td style={{ padding: '12px' }}>Total funds carried forward (Closing Balance)</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>{formatCurrency(cc16Data.totals.closingBalances.unrestricted, org.currency_symbol)}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>{formatCurrency(cc16Data.totals.closingBalances.restricted, org.currency_symbol)}</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: 'var(--success-color, #48bb78)' }}>{formatCurrency(cc16Data.totals.closingBalances.total, org.currency_symbol)}</td>
                    </tr>

                    {/* Section F: Statement of Assets & Liabilities */}
                    <tr style={{ background: 'rgba(159, 122, 234, 0.08)', fontWeight: 700 }}>
                      <td colSpan={4} style={{ padding: '8px 12px', color: '#9f7aea' }}>
                        SECTION F: STATEMENT OF ASSETS &amp; LIABILITIES AT PERIOD END
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td colSpan={3} style={{ padding: '8px 12px' }}>Cash in hand (unbanked cash collections &amp; petty cash)</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(cc16Data.assets.cashInHand, org.currency_symbol)}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td colSpan={3} style={{ padding: '8px 12px' }}>Cash at bank (cleared balances in current &amp; reserve accounts)</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(cc16Data.assets.cashAtBank, org.currency_symbol)}</td>
                    </tr>
                    <tr style={{ borderTop: '2px solid var(--border-color)', fontWeight: 800, background: 'rgba(159, 122, 234, 0.12)' }}>
                      <td colSpan={3} style={{ padding: '12px' }}>Total Cash &amp; Bank Funds</td>
                      <td style={{ padding: '12px', textAlign: 'right', color: '#9f7aea' }}>{formatCurrency(cc16Data.assets.totalCashFunds, org.currency_symbol)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )
          ) : (
            filteredTx.length === 0 ? (
              <div style={{ padding: '32px 16px' }}>
                <EmptyState
                  icon="📊"
                  title={dateFrom || dateTo ? "No Transactions in Selected Period" : "No Financial Activity Recorded"}
                  description={dateFrom || dateTo ? "No income or expenditure entries matched the specified date range filter." : "Record donations, Jummah collections, or operating expenses to generate financial statements."}
                  actionLabel={dateFrom || dateTo ? "Clear Date Filter" : "Record Transaction"}
                  onAction={dateFrom || dateTo ? () => { setDateFrom(''); setDateTo(''); } : () => openModal('transaction', { mode: 'create' })}
                />
              </div>
            ) : (
              <div className="pl-statement">
                <div className="pl-section">
                  <h4 className="pl-section-title">1. Incoming Resources (Income)</h4>
                  <div className="pl-rows">
                    {Object.keys(pl.income).length === 0 ? (
                      <div className="pl-row"><span>No income recorded</span><span>{formatCurrency(0, org.currency_symbol)}</span></div>
                    ) : (
                      Object.keys(pl.income).map(cat => (
                        <div key={cat} className="pl-row">
                          <span>{cat}</span>
                          <span>{formatCurrency(pl.income[cat], org.currency_symbol)}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="pl-row pl-total-row">
                    <span>Total Incoming Resources</span>
                    <span>{formatCurrency(pl.totalInc, org.currency_symbol)}</span>
                  </div>
                </div>

                <div className="pl-section">
                  <h4 className="pl-section-title">2. Operational Expenses (Lillah &amp; Unrestricted)</h4>
                  <div className="pl-rows">
                    {Object.keys(pl.opExpense).length === 0 ? (
                      <div className="pl-row"><span>No operating expenses</span><span>{formatCurrency(0, org.currency_symbol)}</span></div>
                    ) : (
                      Object.keys(pl.opExpense).map(cat => (
                        <div key={cat} className="pl-row">
                          <span>{cat}</span>
                          <span className="expense-val">{formatCurrency(pl.opExpense[cat], org.currency_symbol)}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="pl-row pl-total-row">
                    <span>Total Operating Costs</span>
                    <span className="expense-val">{formatCurrency(pl.totalOp, org.currency_symbol)}</span>
                  </div>
                </div>

                <div className="pl-section">
                  <h4 className="pl-section-title">3. Charitable Disbursements (Restricted Zakat &amp; Fitrana)</h4>
                  <div className="pl-rows">
                    {Object.keys(pl.restrictedDisb).length === 0 ? (
                      <div className="pl-row"><span>No restricted payouts</span><span>{formatCurrency(0, org.currency_symbol)}</span></div>
                    ) : (
                      Object.keys(pl.restrictedDisb).map(cat => (
                        <div key={cat} className="pl-row">
                          <span>{cat}</span>
                          <span className="expense-val">{formatCurrency(pl.restrictedDisb[cat], org.currency_symbol)}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="pl-row pl-total-row">
                    <span>Total Restricted Payouts</span>
                    <span className="expense-val">{formatCurrency(pl.totalRest, org.currency_symbol)}</span>
                  </div>
                </div>

                <div className="pl-section pl-net-income-section">
                  <div className="pl-row pl-net-income-row">
                    <span>Net Surplus / (Deficit) for Period</span>
                    <span className={pl.net >= 0 ? 'text-success' : 'expense-val'} style={{ fontWeight: 800 }}>
                      {formatCurrency(pl.net, org.currency_symbol)}
                    </span>
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        <div className="report-side-column">
          <div className="analytics-stat-card glass-card">
            <h3>Fund Segregation Compliance</h3>
            <div className="compliance-metric">
              <span>Zakat Fund:</span>
              <strong>{formatCurrency(balances.find(b => b.fundName === 'Zakat')?.balance || 0, org.currency_symbol)}</strong>
            </div>
            <div className="compliance-metric">
              <span>Fitrana Fund:</span>
              <strong>{formatCurrency(balances.find(b => b.fundName === 'Fitrana')?.balance || 0, org.currency_symbol)}</strong>
            </div>
            <div className="compliance-metric">
              <span>Interest/Riba Segregated:</span>
              <strong className="expense-val">{formatCurrency(balances.find(b => b.fundName === 'Interest/Riba')?.balance || 0, org.currency_symbol)}</strong>
            </div>
            <hr style={{ borderColor: 'var(--border-color)', margin: '12px 0' }} />
            <p className="micro-text" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              🔒 Shariah Rule: Restricted funds (Zakat &amp; Fitrana) can only be disbursed under Charitable Payout to eligible Asnaf recipients.
            </p>
          </div>

          <div className="analytics-stat-card glass-card">
            <h3>System Audit Trails</h3>
            <div className="audit-timeline" style={{ maxHeight: '360px', overflowY: 'auto' }}>
              {(auditLogs || []).length === 0 ? (
                <EmptyState
                  icon="📋"
                  title="No Audit Logs"
                  description="System security and financial mutations will be immutably recorded here."
                />
              ) : (
                (auditLogs || []).slice(0, 20).map(log => (
                  <div key={log.id} className="timeline-item" style={{ padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                    <span className="timeline-time" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block' }}>
                      {new Date(log.timestamp).toLocaleString('en-GB')} by <strong>{log.userEmail || log.userName || log.user_id}</strong>
                    </span>
                    <span className="timeline-desc" style={{ fontSize: '0.8rem' }}>
                      {`Action ${log.action} on ${log.table_name} [${log.record_id}]`}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

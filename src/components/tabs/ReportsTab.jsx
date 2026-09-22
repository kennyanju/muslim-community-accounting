'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { useDebounce } from '@/hooks/usePerformanceHooks';
import EmptyState from '@/components/common/EmptyState';
import { formatCurrency } from '@/utils/formatters';

export default function ReportsTab() {
  const { transactions, balances, auditLogs, org, openModal } = useApp();

  const [reportFormat, setReportFormat] = useState('sofa'); // 'sofa' | 'cc16' | 'giftaid'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isExportingGiftAid, setIsExportingGiftAid] = useState(false);
  const [isExportingAnnual, setIsExportingAnnual] = useState(false);
  const [isExportingCC16, setIsExportingCC16] = useState(false);

  const [cc16Data, setCc16Data] = useState(null);
  const [loadingCC16, setLoadingCC16] = useState(false);

  // Gift Aid claims & batches state
  const [giftAidData, setGiftAidData] = useState(null);
  const [loadingGiftAid, setLoadingGiftAid] = useState(false);
  const [claimBatches, setClaimBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [activeGiftAidTab, setActiveGiftAidTab] = useState('queue'); // 'queue' | 'history'
  const [showCreateBatchModal, setShowCreateBatchModal] = useState(false);
  const [batchPeriodStart, setBatchPeriodStart] = useState('');
  const [batchPeriodEnd, setBatchPeriodEnd] = useState('');
  const [batchNotes, setBatchNotes] = useState('');
  const [submittingBatch, setSubmittingBatch] = useState(false);
  const [batchMessage, setBatchMessage] = useState(null);

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

  // Fetch Gift Aid data when viewing Gift Aid format
  useEffect(() => {
    if (reportFormat !== 'giftaid') return;

    let active = true;
    let url = '/api/reports/giftaid?format=json';
    if (debouncedDateFrom) url += `&dateFrom=${debouncedDateFrom}`;
    if (debouncedDateTo) url += `&dateTo=${debouncedDateTo}`;

    fetch(url)
      .then(res => res.json())
      .then(res => {
        if (active && res.success && res.data) {
          setGiftAidData(res.data);
        }
      })
      .catch(err => console.error('Failed to load Gift Aid claimable queue:', err))
      .finally(() => {
        if (active) setLoadingGiftAid(false);
      });

    fetch('/api/reports/giftaid/claim')
      .then(res => res.json())
      .then(res => {
        if (active && res.success && res.data) {
          setClaimBatches(res.data);
        }
      })
      .catch(err => console.error('Failed to load Gift Aid claim batches:', err))
      .finally(() => {
        if (active) setLoadingBatches(false);
      });

    return () => {
      active = false;
    };
  }, [reportFormat, debouncedDateFrom, debouncedDateTo]);

  const handleCreateBatch = async (e) => {
    e.preventDefault();
    if (!batchPeriodStart || !batchPeriodEnd) {
      setBatchMessage({ type: 'error', text: 'Please specify both period start and end dates.' });
      return;
    }
    setSubmittingBatch(true);
    setBatchMessage(null);
    try {
      const res = await fetch('/api/reports/giftaid/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_start: batchPeriodStart,
          period_end: batchPeriodEnd,
          notes: batchNotes
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Failed to create claim batch');
      }

      setBatchMessage({
        type: 'success',
        text: `HMRC Claim Batch ${data.data.claim_reference} created and locked successfully! ${data.data.transaction_count} donations batched for £${data.data.total_claim.toFixed(2)} Gift Aid tax relief.`
      });
      setShowCreateBatchModal(false);
      setBatchNotes('');
      setActiveGiftAidTab('history');

      // Refresh claimable queue & batches
      const [gaRes, batchesRes] = await Promise.all([
        fetch(`/api/reports/giftaid?format=json${debouncedDateFrom ? `&dateFrom=${debouncedDateFrom}` : ''}${debouncedDateTo ? `&dateTo=${debouncedDateTo}` : ''}`).then(r => r.json()),
        fetch('/api/reports/giftaid/claim').then(r => r.json())
      ]);
      if (gaRes.success) setGiftAidData(gaRes.data);
      if (batchesRes.success) setClaimBatches(batchesRes.data);
    } catch (err) {
      setBatchMessage({ type: 'error', text: err.message });
    } finally {
      setSubmittingBatch(false);
    }
  };

  const downloadBatchCsv = (batchId) => {
    window.open(`/api/reports/giftaid?claim_id=${encodeURIComponent(batchId)}`, '_blank');
  };

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
            <button
              type="button"
              className={`btn btn-sm ${reportFormat === 'giftaid' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setReportFormat('giftaid')}
            >
              📑 HMRC Gift Aid Schedules
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
          ) : reportFormat === 'giftaid' ? (
            <>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => {
                  setBatchPeriodStart(dateFrom || `${new Date().getFullYear()}-04-06`);
                  setBatchPeriodEnd(dateTo || new Date().toISOString().slice(0, 10));
                  setShowCreateBatchModal(true);
                }} 
                style={{ minHeight: '44px' }}
              >
                <span aria-hidden="true">🔒</span> Create &amp; Lock Claim Batch
              </button>
              <button 
                type="button" 
                className="btn btn-outline" 
                onClick={triggerGiftAidDownload} 
                disabled={isExportingGiftAid}
                style={{ minHeight: '44px' }}
              >
                <span aria-hidden="true">{isExportingGiftAid ? '⏳' : '📑'}</span> {isExportingGiftAid ? 'Exporting...' : 'Export Current Queue (CSV)'}
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
              <h3>
                {reportFormat === 'cc16' 
                  ? 'RECEIPTS AND PAYMENTS ACCOUNTS (CC16)' 
                  : reportFormat === 'giftaid'
                  ? 'HMRC GIFT AID CLAIMS SCHEDULE & BATCH SUBMISSIONS'
                  : 'STATEMENT OF FINANCIAL ACTIVITIES'}
              </h3>
              <p>
                {reportFormat === 'cc16' 
                  ? 'Charity Commission Management Return' 
                  : reportFormat === 'giftaid'
                  ? 'Charities Act 2011 & Taxes Management Act - 25% Tax Relief Schedules'
                  : 'Income & Expenditure Report'}
              </p>
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
          ) : reportFormat === 'giftaid' ? (
            loadingGiftAid ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <span>⏳ Loading HMRC Gift Aid claim schedules and batches...</span>
              </div>
            ) : (
              <div className="giftaid-management" style={{ marginTop: '16px' }}>
                {batchMessage && (
                  <div 
                    style={{ 
                      padding: '12px 16px', 
                      borderRadius: '8px', 
                      marginBottom: '16px',
                      background: batchMessage.type === 'success' ? 'rgba(72, 187, 120, 0.15)' : 'rgba(229, 62, 62, 0.15)',
                      border: `1px solid ${batchMessage.type === 'success' ? 'var(--success-color, #48bb78)' : 'var(--danger-color, #e53e3e)'}`,
                      color: batchMessage.type === 'success' ? 'var(--success-color, #48bb78)' : 'var(--danger-color, #e53e3e)',
                      fontSize: '0.9rem'
                    }}
                  >
                    {batchMessage.text}
                  </div>
                )}

                {/* 4 KPI Summary Cards including HMRC GASDS */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                  <div className="glass-card" style={{ padding: '16px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>Unclaimed Eligible Donations</span>
                    <strong style={{ fontSize: '1.4rem', color: 'var(--text-primary)', display: 'block', margin: '4px 0' }}>
                      {formatCurrency(giftAidData?.totalDonations || 0, org.currency_symbol)}
                    </strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{giftAidData?.count || 0} donations awaiting batching</span>
                  </div>
                  <div className="glass-card" style={{ padding: '16px', borderRadius: '10px', background: 'rgba(72, 187, 120, 0.05)', border: '1px solid rgba(72, 187, 120, 0.3)' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--success-color, #48bb78)', display: 'block' }}>Standard Gift Aid (25%)</span>
                    <strong style={{ fontSize: '1.4rem', color: 'var(--success-color, #48bb78)', display: 'block', margin: '4px 0' }}>
                      {formatCurrency(giftAidData?.totalClaim || 0, org.currency_symbol)}
                    </strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Covered by signed declarations</span>
                  </div>
                  <div className="glass-card" style={{ padding: '16px', borderRadius: '10px', background: 'rgba(237, 137, 54, 0.05)', border: '1px solid rgba(237, 137, 54, 0.3)' }}>
                    <span style={{ fontSize: '0.8rem', color: '#ed8936', display: 'block' }}>HMRC GASDS Small Cash Top-Up</span>
                    <strong style={{ fontSize: '1.4rem', color: '#ed8936', display: 'block', margin: '4px 0' }}>
                      {formatCurrency(giftAidData?.gasds?.top_up_claim_pounds || 0, org.currency_symbol)}
                    </strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      25% on {formatCurrency(giftAidData?.gasds?.claimable_allowance_pounds || 0, org.currency_symbol)} loose cash (max £2,000)
                    </span>
                  </div>
                  <div className="glass-card" style={{ padding: '16px', borderRadius: '10px', background: 'rgba(66, 153, 225, 0.05)', border: '1px solid rgba(66, 153, 225, 0.3)' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--primary-color, #3182ce)', display: 'block' }}>Historical Claim Batches</span>
                    <strong style={{ fontSize: '1.4rem', color: 'var(--text-primary)', display: 'block', margin: '4px 0' }}>
                      {claimBatches.length} Batches
                    </strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Locked &amp; submitted to HMRC</span>
                  </div>
                </div>

                {/* Sub Tab Navigation */}
                <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '16px', paddingBottom: '8px' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${activeGiftAidTab === 'queue' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setActiveGiftAidTab('queue')}
                  >
                    📋 Claimable Donations Queue ({giftAidData?.count || 0})
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${activeGiftAidTab === 'history' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setActiveGiftAidTab('history')}
                  >
                    🏛️ Submitted Batches History ({claimBatches.length})
                  </button>
                </div>

                {/* Sub Tab 1: Claimable Queue */}
                {activeGiftAidTab === 'queue' && (
                  <div>
                    {(!giftAidData?.claimable || giftAidData.claimable.length === 0) ? (
                      <div style={{ padding: '32px 16px' }}>
                        <EmptyState
                          icon="✅"
                          title="All Eligible Donations Claimed"
                          description="No unbatched Gift Aid donations were found for the selected period. New income covered by active Gift Aid declarations and verified UK donor addresses will appear here."
                        />
                      </div>
                    ) : (
                      <div className="table-responsive">
                        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                              <th style={{ padding: '8px 12px' }}>Date</th>
                              <th style={{ padding: '8px 12px' }}>Donor</th>
                              <th style={{ padding: '8px 12px' }}>Address &amp; Postcode</th>
                              <th style={{ padding: '8px 12px', textAlign: 'right' }}>Donation ({org.currency_symbol || '£'})</th>
                              <th style={{ padding: '8px 12px', textAlign: 'right' }}>25% Relief ({org.currency_symbol || '£'})</th>
                            </tr>
                          </thead>
                          <tbody>
                            {giftAidData.claimable.map(tx => (
                              <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '8px 12px' }}>{tx.transaction_date}</td>
                                <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                                  {tx.title ? `${tx.title} ` : ''}{tx.donor_name}
                                </td>
                                <td style={{ padding: '8px 12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                  {tx.address ? `${tx.address}, ` : ''}{tx.postcode}
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                  {formatCurrency(tx.amount, org.currency_symbol)}
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--success-color, #48bb78)' }}>
                                  {formatCurrency(tx.claim, org.currency_symbol)}
                                </td>
                              </tr>
                            ))}
                            <tr style={{ borderTop: '2px solid var(--border-color)', fontWeight: 700, background: 'rgba(72, 187, 120, 0.08)' }}>
                              <td colSpan={3} style={{ padding: '10px 12px' }}>Total Claimable in Queue ({giftAidData.count} items)</td>
                              <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                {formatCurrency(giftAidData.totalDonations, org.currency_symbol)}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--success-color, #48bb78)' }}>
                                {formatCurrency(giftAidData.totalClaim, org.currency_symbol)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Sub Tab 2: Historical Batches */}
                {activeGiftAidTab === 'history' && (
                  <div>
                    {claimBatches.length === 0 ? (
                      <div style={{ padding: '32px 16px' }}>
                        <EmptyState
                          icon="🏛️"
                          title="No Claim Batches Created Yet"
                          description="Use 'Create & Lock Claim Batch' to group eligible donations into an official HMRC submission file and prevent duplicate claims."
                        />
                      </div>
                    ) : (
                      <div className="table-responsive">
                        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                              <th style={{ padding: '8px 12px' }}>Batch Reference</th>
                              <th style={{ padding: '8px 12px' }}>Period</th>
                              <th style={{ padding: '8px 12px', textAlign: 'center' }}>Items</th>
                              <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total Donated ({org.currency_symbol || '£'})</th>
                              <th style={{ padding: '8px 12px', textAlign: 'right' }}>Tax Claimed ({org.currency_symbol || '£'})</th>
                              <th style={{ padding: '8px 12px' }}>Status</th>
                              <th style={{ padding: '8px 12px', textAlign: 'right' }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {claimBatches.map(b => (
                              <tr key={b.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <td style={{ padding: '8px 12px', fontWeight: 700, fontFamily: 'monospace' }}>
                                  {b.claim_reference}
                                </td>
                                <td style={{ padding: '8px 12px', fontSize: '0.85rem' }}>
                                  {b.period_start} to {b.period_end}
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                  {b.item_count || b.transaction_count}
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                  {formatCurrency(b.total_donations, org.currency_symbol)}
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--success-color, #48bb78)' }}>
                                  {formatCurrency(b.total_claim, org.currency_symbol)}
                                </td>
                                <td style={{ padding: '8px 12px' }}>
                                  <span style={{ 
                                    padding: '2px 8px', 
                                    borderRadius: '12px', 
                                    fontSize: '0.72rem', 
                                    fontWeight: 700, 
                                    background: 'rgba(72, 187, 120, 0.15)', 
                                    color: 'var(--success-color, #48bb78)',
                                    border: '1px solid rgba(72, 187, 120, 0.3)'
                                  }}>
                                    {b.status || 'SUBMITTED'}
                                  </span>
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                  <button
                                    type="button"
                                    className="btn btn-xs btn-outline"
                                    onClick={() => downloadBatchCsv(b.id)}
                                    title="Download official HMRC CSV schedule for this batch"
                                    style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                                  >
                                    📥 Download CSV
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
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

      {showCreateBatchModal && (
        <div 
          className="modal-backdrop" 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            backgroundColor: 'rgba(0,0,0,0.65)', 
            backdropFilter: 'blur(4px)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 1000, 
            padding: '16px' 
          }}
        >
          <div 
            className="modal-content glass-card" 
            style={{ 
              maxWidth: '520px', 
              width: '100%', 
              padding: '24px', 
              borderRadius: '12px', 
              background: 'var(--bg-secondary)', 
              border: '1px solid var(--border-color)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Create HMRC Gift Aid Claim Batch</h3>
              <button 
                type="button" 
                className="btn btn-sm btn-outline" 
                onClick={() => setShowCreateBatchModal(false)} 
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>
            
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.4' }}>
              This action will assign an official HMRC Reference (e.g. <code>HMRC-GA-2026-XXXX</code>) and lock all matching eligible donations to prevent duplicate claiming.
            </p>

            <form onSubmit={handleCreateBatch}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label htmlFor="batch-period-start" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                    Period Start Date *
                  </label>
                  <input
                    id="batch-period-start"
                    type="date"
                    required
                    value={batchPeriodStart}
                    onChange={e => setBatchPeriodStart(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label htmlFor="batch-period-end" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                    Period End Date *
                  </label>
                  <input
                    id="batch-period-end"
                    type="date"
                    required
                    value={batchPeriodEnd}
                    onChange={e => setBatchPeriodEnd(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label htmlFor="batch-notes" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                  Batch Notes / Description (Optional)
                </label>
                <input
                  id="batch-notes"
                  type="text"
                  placeholder="e.g. Q1 FY2026 Claim - Friday Jummah & Online Donors"
                  value={batchNotes}
                  onChange={e => setBatchNotes(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button 
                  type="button" 
                  className="btn btn-outline" 
                  onClick={() => setShowCreateBatchModal(false)} 
                  disabled={submittingBatch}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  disabled={submittingBatch}
                >
                  {submittingBatch ? '⏳ Locking Batch...' : '🔒 Create & Lock Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

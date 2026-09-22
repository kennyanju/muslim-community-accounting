'use client';

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useApp } from '@/context/AppContext';
import { useModalFocusTrap } from '@/hooks/useModalFocusTrap';
import { formatCurrency, formatDate } from '@/utils/formatters';

/**
 * Intelligent client-side CSV parser supporting major UK bank formats:
 * Lloyds, Barclays, NatWest, HSBC, Santander, Monzo, Starling, etc.
 */
function parseBankCsv(csvText) {
  if (!csvText || typeof csvText !== 'string') return [];
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Parse CSV line taking quotes into account
  const parseLine = (line) => {
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    cells.push(cur.trim());
    return cells;
  };

  const headerRow = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  
  // Find column indices
  let dateIdx = headerRow.findIndex(h => h.includes('date') || h === 'postingdate' || h === 'txndate');
  let descIdx = headerRow.findIndex(h => h.includes('desc') || h.includes('narrative') || h.includes('detail') || h.includes('memo') || h.includes('counterparty') || h.includes('name'));
  let amountIdx = headerRow.findIndex(h => h === 'amount' || h === 'netamount' || h.includes('amountgbp'));
  let debitIdx = headerRow.findIndex(h => h.includes('debit') || h.includes('paidout') || h.includes('moneyout') || h.includes('withdrawal'));
  let creditIdx = headerRow.findIndex(h => h.includes('credit') || h.includes('paidin') || h.includes('moneyin') || h.includes('deposit'));

  // Default fallback if headers were ambiguous
  if (dateIdx === -1) dateIdx = 0;
  if (descIdx === -1) descIdx = 1;

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    if (cells.length < 2) continue;

    const rawDate = cells[dateIdx] || '';
    const rawDesc = cells[descIdx] || 'Bank Entry';
    let amount = 0;

    if (amountIdx !== -1 && cells[amountIdx]) {
      const cleaned = cells[amountIdx].replace(/[£$, ]/g, '');
      amount = parseFloat(cleaned) || 0;
    } else if (debitIdx !== -1 || creditIdx !== -1) {
      const debitStr = (cells[debitIdx] || '').replace(/[£$, ]/g, '');
      const creditStr = (cells[creditIdx] || '').replace(/[£$, ]/g, '');
      const debit = parseFloat(debitStr) || 0;
      const credit = parseFloat(creditStr) || 0;
      amount = credit > 0 ? credit : -debit;
    }

    if (rawDate && (amount !== 0 || cells.length >= 3)) {
      // Standardize date into YYYY-MM-DD
      let normDate = rawDate;
      if (rawDate.includes('/')) {
        const parts = rawDate.split('/');
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            normDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          } else {
            // DD/MM/YYYY UK standard
            normDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        }
      }

      rows.push({
        id: `bank-row-${i}`,
        date: normDate,
        description: rawDesc,
        amount: Math.abs(amount),
        type: amount >= 0 ? 'INCOME' : 'EXPENSE',
        signedAmount: amount
      });
    }
  }

  return rows;
}

export default function ReconciliationModal() {
  const { modals, closeModal, transactions, org, fetchAPI, addToast, refreshData } = useApp();
  const modalContainerRef = useRef(null);

  const [inputMode, setInputMode] = useState('upload'); // 'upload' | 'paste'
  const [pastedCsv, setPastedCsv] = useState('');
  const [statementRef, setStatementRef] = useState('');
  const [bankRows, setBankRows] = useState([]);
  const [selectedMatches, setSelectedMatches] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [reconcileProgress, setReconcileProgress] = useState(null);

  const isOpen = Boolean(modals.reconciliation);

  const handleClose = useCallback(() => {
    closeModal('reconciliation');
    setPastedCsv('');
    setBankRows([]);
    setSelectedMatches({});
    setStatementRef('');
    setReconcileProgress(null);
  }, [closeModal]);

  useModalFocusTrap(isOpen, handleClose, modalContainerRef);

  // Unreconciled BANKED transactions in the system
  const unreconciledSystemTxs = useMemo(() => {
    return transactions.filter(t => t.status === 'BANKED' && !t.reconciled);
  }, [transactions]);

  // Automated Matching Algorithm
  const matchResults = useMemo(() => {
    if (bankRows.length === 0) return [];

    const availableSystemTxs = [...unreconciledSystemTxs];
    const pairedTxIds = new Set();

    return bankRows.map(row => {
      const rowPence = Math.round(row.amount * 100);
      const rowTime = new Date(row.date).getTime();

      // Find candidates with matching integer pence
      const candidates = availableSystemTxs
        .filter(t => !pairedTxIds.has(t.id))
        .map(t => {
          const tPence = Math.round((parseFloat(t.total_amount) || 0) * 100);
          const tTime = new Date(t.transaction_date).getTime();
          const dayDiff = isNaN(rowTime) || isNaN(tTime) ? 999 : Math.abs(rowTime - tTime) / (1000 * 60 * 60 * 24);
          const exactAmount = rowPence === tPence;
          const sameType = t.type === row.type;

          let score = 0;
          if (exactAmount) score += 60;
          if (sameType) score += 15;
          if (dayDiff <= 1) score += 25;
          else if (dayDiff <= 3) score += 20;
          else if (dayDiff <= 7) score += 10;
          else if (dayDiff <= 14) score += 5;

          return { tx: t, score, dayDiff, exactAmount };
        })
        .filter(c => c.exactAmount) // Strict requirement: amount must match exactly
        .sort((a, b) => b.score - a.score);

      if (candidates.length > 0) {
        const best = candidates[0];
        pairedTxIds.add(best.tx.id);
        
        let confidenceLabel = 'Probable Match';
        let badgeColor = 'var(--warning-color, #d69e2e)';
        if (best.score >= 90) {
          confidenceLabel = 'High Match';
          badgeColor = 'var(--success-color, #38a169)';
        }

        return {
          bankRow: row,
          matchedTx: best.tx,
          confidenceScore: best.score,
          confidenceLabel,
          badgeColor,
          dayDiff: Math.round(best.dayDiff)
        };
      }

      return {
        bankRow: row,
        matchedTx: null,
        confidenceScore: 0,
        confidenceLabel: 'Unmatched',
        badgeColor: 'var(--text-muted)',
        dayDiff: null
      };
    });
  }, [bankRows, unreconciledSystemTxs]);

  // Handle CSV file upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!statementRef) {
      const autoRef = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
      setStatementRef(autoRef);
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      const parsed = parseBankCsv(text);
      setBankRows(parsed);
      
      // Auto-select all High and Probable matches
      const initialSelected = {};
      parsed.forEach((_, idx) => {
        initialSelected[idx] = true;
      });
      setSelectedMatches(initialSelected);
    };
    reader.readAsText(file);
  };

  // Handle pasted CSV parsing
  const handleParsePasted = () => {
    if (!pastedCsv.trim()) return;
    const parsed = parseBankCsv(pastedCsv);
    setBankRows(parsed);
    if (!statementRef) {
      setStatementRef(`STMT-${new Date().toISOString().substring(0, 7)}`);
    }

    const initialSelected = {};
    parsed.forEach((_, idx) => {
      initialSelected[idx] = true;
    });
    setSelectedMatches(initialSelected);
  };

  const toggleSelectMatch = (idx) => {
    setSelectedMatches(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const toggleSelectAll = () => {
    const allSelected = matchResults.every((m, idx) => !m.matchedTx || selectedMatches[idx]);
    const updated = {};
    matchResults.forEach((m, idx) => {
      if (m.matchedTx) {
        updated[idx] = !allSelected;
      }
    });
    setSelectedMatches(updated);
  };

  // Execute 1-click batch reconciliation
  const handleBatchReconcile = async () => {
    const toReconcile = matchResults
      .filter((m, idx) => m.matchedTx && selectedMatches[idx])
      .map(m => m.matchedTx);

    if (toReconcile.length === 0) {
      addToast('No matched transactions selected for reconciliation.', 'warning');
      return;
    }

    const finalStmtRef = statementRef.trim() || `STMT-${new Date().toISOString().substring(0, 10)}`;
    setSubmitting(true);
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < toReconcile.length; i++) {
      const tx = toReconcile[i];
      setReconcileProgress(`Reconciling ${i + 1} of ${toReconcile.length} (${tx.receipt_number || tx.id})...`);
      try {
        await fetchAPI(`/api/transactions/${tx.id}/reconcile`, {
          method: 'POST',
          body: JSON.stringify({ bankStatementRef: finalStmtRef })
        });
        successCount++;
      } catch (err) {
        console.error(`Failed to reconcile tx ${tx.id}:`, err);
        failedCount++;
      }
    }

    setSubmitting(false);
    setReconcileProgress(null);

    if (successCount > 0) {
      addToast(`Successfully reconciled and locked ${successCount} transaction${successCount > 1 ? 's' : ''} against statement "${finalStmtRef}".`, 'success');
      refreshData();
      handleClose();
    } else {
      addToast('Failed to reconcile selected transactions. Please check logs.', 'error');
    }
  };

  if (!isOpen) return null;

  const matchedCount = matchResults.filter(m => m.matchedTx).length;
  const selectedCount = matchResults.filter((m, idx) => m.matchedTx && selectedMatches[idx]).length;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="reconcile-modal-title">
      <div 
        className="modal-card glass-card" 
        ref={modalContainerRef} 
        style={{ 
          maxWidth: '920px', 
          width: '95%', 
          maxHeight: '90vh', 
          overflowY: 'auto',
          padding: '24px' 
        }}
      >
        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 id="reconcile-modal-title" style={{ margin: 0, fontSize: '1.3rem' }}>
              🏦 Bank Statement Reconciliation &amp; Audit Lock
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Auto-match bank statement entries against unverified banked transactions by exact pence and date proximity.
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={handleClose} aria-label="Close modal">✕</button>
        </div>

        {/* Statement Ref & Mode Switcher */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '16px', background: 'var(--bg-primary)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div>
            <label htmlFor="stmt-ref-input" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
              Bank Statement Reference / Period *
            </label>
            <input
              id="stmt-ref-input"
              type="text"
              placeholder="e.g. LLOYDS-SEP-2026 or STMT-09-2026"
              value={statementRef}
              onChange={e => setStatementRef(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
              Import Source
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className={`btn btn-sm ${inputMode === 'upload' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setInputMode('upload')}
              >
                📁 Upload CSV File
              </button>
              <button
                type="button"
                className={`btn btn-sm ${inputMode === 'paste' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setInputMode('paste')}
              >
                📋 Paste CSV Text
              </button>
            </div>
          </div>
        </div>

        {/* Input Area */}
        {inputMode === 'upload' ? (
          <div style={{ padding: '24px', border: '2px dashed var(--border-color)', borderRadius: '8px', textAlign: 'center', marginBottom: '20px', background: 'rgba(255,255,255,0.01)' }}>
            <span style={{ fontSize: '2rem', display: 'block', marginBottom: '8px' }}>📄</span>
            <p style={{ fontWeight: 600, marginBottom: '4px' }}>Select Bank Statement CSV</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Compatible with Lloyds Bank, Barclays, NatWest, HSBC, Monzo, Starling, and generic CSV statements.
            </p>
            <label className="btn btn-primary" style={{ cursor: 'pointer', display: 'inline-block' }}>
              <span>Browse CSV File</span>
              <input type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
          </div>
        ) : (
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="paste-csv-textarea" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
              Paste Bank Statement Lines (with header row)
            </label>
            <textarea
              id="paste-csv-textarea"
              rows={4}
              placeholder="Date,Description,Amount&#10;2026-09-18,FRIDAY JUMMAH CASH DEPOSIT,1420.50&#10;2026-09-19,ONLINE DONATIONS STRIPE,450.00"
              value={pastedCsv}
              onChange={e => setPastedCsv(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontFamily: 'monospace', fontSize: '0.85rem', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button type="button" className="btn btn-sm btn-primary" onClick={handleParsePasted}>
                ⚡ Parse &amp; Match Statement
              </button>
            </div>
          </div>
        )}

        {/* Match Results Table */}
        {bankRows.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Parsed <strong>{bankRows.length}</strong> bank entries &bull; Matched <strong>{matchedCount}</strong> to system records
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--success-color, #38a169)' }}>
                  <strong>{selectedCount}</strong> selected for audit lock
                </span>
              </div>
              <button type="button" className="btn btn-xs btn-outline" onClick={toggleSelectAll}>
                Toggle Select All
              </button>
            </div>

            <div className="table-responsive" style={{ maxHeight: '380px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <th style={{ padding: '8px 12px', width: '40px', textAlign: 'center' }}>Reconcile</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Bank Date &amp; Narrative</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Bank Amount</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Matched System Record</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {matchResults.map((m, idx) => (
                    <tr 
                      key={m.bankRow.id} 
                      style={{ 
                        borderBottom: '1px solid var(--border-color)',
                        background: m.matchedTx && selectedMatches[idx] ? 'rgba(72, 187, 120, 0.05)' : 'transparent'
                      }}
                    >
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          disabled={!m.matchedTx || submitting}
                          checked={Boolean(m.matchedTx && selectedMatches[idx])}
                          onChange={() => toggleSelectMatch(idx)}
                          aria-label={`Select match for ${m.bankRow.description}`}
                        />
                      </td>

                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{m.bankRow.description}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {formatDate(m.bankRow.date)} &bull; {m.bankRow.type}
                        </div>
                      </td>

                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                        {formatCurrency(m.bankRow.amount, org.currency_symbol)}
                      </td>

                      <td style={{ padding: '8px 12px' }}>
                        {m.matchedTx ? (
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--primary-color, #3182ce)' }}>
                              {m.matchedTx.receipt_number || m.matchedTx.id}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                              Date: {formatDate(m.matchedTx.transaction_date)} &bull; {m.matchedTx.category} ({m.matchedTx.method})
                              {m.dayDiff !== null && (
                                <span style={{ marginLeft: '4px', color: m.dayDiff === 0 ? 'var(--success-color)' : 'var(--text-muted)' }}>
                                  ({m.dayDiff === 0 ? 'Exact Date' : `±${m.dayDiff}d`})
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            No unreconciled system record matched
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span 
                          style={{ 
                            padding: '3px 8px', 
                            borderRadius: '12px', 
                            fontSize: '0.72rem', 
                            fontWeight: 700,
                            color: m.badgeColor,
                            background: 'rgba(255,255,255,0.03)',
                            border: `1px solid ${m.badgeColor}`
                          }}
                        >
                          {m.confidenceLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '10px' }}>
              🔒 <strong>Governance Rule:</strong> Reconciling a transaction records the statement reference, marks it cleared against bank records, and locks it permanently against voids or edits.
            </p>
          </div>
        )}

        {/* Modal Actions */}
        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
          <div>
            {reconcileProgress && (
              <span style={{ fontSize: '0.85rem', color: 'var(--primary-color)' }}>
                ⏳ {reconcileProgress}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn btn-outline" onClick={handleClose} disabled={submitting}>
              Close
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleBatchReconcile}
              disabled={submitting || selectedCount === 0}
            >
              {submitting ? '⏳ Reconciling...' : `🔒 Reconcile & Lock (${selectedCount})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

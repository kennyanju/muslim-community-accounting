'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import Pagination from '@/components/common/Pagination';
import EmptyState from '@/components/common/EmptyState';
import { useDebounce } from '@/hooks/useDebounce';
import { formatCurrency, formatDate } from '@/utils/formatters';

export default function TransactionsTab({ onLoadReceipt }) {
  const { transactions, balances, org, user, addToast, refreshData, openModal, optimisticBankDeposit, optimisticReconcileLock, fetchAPI } = useApp();

  const [filterType, setFilterType] = useState('all');
  const [filterFund, setFilterFund] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterJummahOnly, setFilterJummahOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedTxId, setExpandedTxId] = useState(null);
  const itemsPerPage = 15;

  // Global keyboard shortcut: Ctrl+N or Cmd+N to open New Transaction modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        if (user?.role === 'ADMIN') {
          openModal('transaction');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user, openModal]);

  // Debounce search query to prevent UI freeze
  const debouncedSearch = useDebounce(filterSearch, 250);

  const resetAllFilters = () => {
    setFilterType('all');
    setFilterFund('all');
    setFilterCategory('all');
    setFilterStatus('all');
    setFilterSearch('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterJummahOnly(false);
    setCurrentPage(1);
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(prev => !prev);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const setQuickDateRange = (rangeType) => {
    const today = new Date();
    const curYear = today.getFullYear();

    if (rangeType === 'all') {
      setFilterDateFrom('');
      setFilterDateTo('');
    } else if (rangeType === 'month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().substring(0, 10);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().substring(0, 10);
      setFilterDateFrom(firstDay);
      setFilterDateTo(lastDay);
    } else if (rangeType === '3months') {
      const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, 1).toISOString().substring(0, 10);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().substring(0, 10);
      setFilterDateFrom(threeMonthsAgo);
      setFilterDateTo(lastDay);
    } else if (rangeType === 'ytd') {
      setFilterDateFrom(`${curYear}-01-01`);
      setFilterDateTo(`${curYear}-12-31`);
    }
    setCurrentPage(1);
  };

  const isFiltered = filterType !== 'all' || filterFund !== 'all' || filterCategory !== 'all' || filterStatus !== 'all' || debouncedSearch || filterDateFrom || filterDateTo || filterJummahOnly;

  const filteredTransactions = useMemo(() => {
    let list = [...transactions];

    if (filterType !== 'all') {
      list = list.filter(t => t.type?.toLowerCase() === filterType.toLowerCase());
    }

    if (filterFund !== 'all') {
      list = list.filter(t => t.splits?.some(s => s.fund_id === filterFund));
    }

    if (filterCategory !== 'all') {
      list = list.filter(t => t.category === filterCategory);
    }

    if (filterStatus !== 'all') {
      list = list.filter(t => t.status === filterStatus);
    }

    if (filterJummahOnly) {
      list = list.filter(t =>
        t.reference_note?.toLowerCase().includes('jummah') ||
        t.description?.toLowerCase().includes('jummah') ||
        t.notes?.toLowerCase().includes('jummah')
      );
    }

    if (filterDateFrom) {
      const fromTime = new Date(filterDateFrom).getTime();
      list = list.filter(t => {
        const txTime = new Date(t.transaction_date).getTime();
        return !isNaN(txTime) && !isNaN(fromTime) ? txTime >= fromTime : t.transaction_date >= filterDateFrom;
      });
    }

    if (filterDateTo) {
      const toTime = new Date(filterDateTo + (filterDateTo.length <= 10 ? 'T23:59:59.999Z' : '')).getTime();
      list = list.filter(t => {
        const txTime = new Date(t.transaction_date).getTime();
        return !isNaN(txTime) && !isNaN(toTime) ? txTime <= toTime : t.transaction_date <= filterDateTo;
      });
    }

    if (debouncedSearch && debouncedSearch.trim()) {
      const s = debouncedSearch.toLowerCase().trim();
      list = list.filter(t =>
        t.reference_note?.toLowerCase().includes(s) ||
        t.description?.toLowerCase().includes(s) ||
        t.donorName?.toLowerCase().includes(s) ||
        t.category?.toLowerCase().includes(s) ||
        t.receipt_number?.toLowerCase().includes(s) ||
        t.notes?.toLowerCase().includes(s)
      );
    }

    // Sorting
    list.sort((a, b) => {
      let valA, valB;
      if (sortField === 'date') {
        valA = new Date(a.transaction_date).getTime() || 0;
        valB = new Date(b.transaction_date).getTime() || 0;
      } else if (sortField === 'amount') {
        valA = parseFloat(a.total_amount) || 0;
        valB = parseFloat(b.total_amount) || 0;
      } else if (sortField === 'receipt') {
        valA = a.receipt_number || '';
        valB = b.receipt_number || '';
      } else if (sortField === 'category') {
        valA = a.category || '';
        valB = b.category || '';
      } else if (sortField === 'status') {
        valA = a.status || '';
        valB = b.status || '';
      } else {
        valA = a.transaction_date || '';
        valB = b.transaction_date || '';
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });

    return list;
  }, [transactions, filterType, filterFund, filterCategory, filterStatus, filterDateFrom, filterDateTo, filterJummahOnly, debouncedSearch, sortField, sortAsc]);

  const runningTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    filteredTransactions.forEach(t => {
      if (t.status === 'VOIDED' || t.status === 'FAILED') return;
      const amt = parseFloat(t.total_amount) || 0;
      if (t.type === 'INCOME') income += amt;
      else expense += amt;
    });
    return {
      income,
      expense,
      net: income - expense,
      count: filteredTransactions.length
    };
  }, [filteredTransactions]);

  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTransactions.slice(start, start + itemsPerPage);
  }, [filteredTransactions, currentPage]);

  const handleBankDeposit = (txId) => {
    optimisticBankDeposit(txId);
  };

  const handleReconcileLock = (txId) => {
    const confirm = window.confirm(
      '🔒 Confirm Reconcile & Lock:\n\nThis will permanently lock this transaction and prevent any further voids, banking changes, or edits.\n\nProceed?'
    );
    if (!confirm) return;

    optimisticReconcileLock(txId);
  };

  const triggerLedgerDownload = () => {
    let url = '/api/transactions?format=csv';
    if (filterType !== 'all') url += `&type=${filterType}`;
    if (filterFund !== 'all') url += `&fund=${filterFund}`;
    if (filterCategory !== 'all') url += `&category=${filterCategory}`;
    if (filterStatus !== 'all') url += `&status=${filterStatus}`;
    if (debouncedSearch) url += `&search=${encodeURIComponent(debouncedSearch)}`;
    if (filterDateFrom) url += `&dateFrom=${filterDateFrom}`;
    if (filterDateTo) url += `&dateTo=${filterDateTo}`;
    if (filterJummahOnly) url += `&jummahOnly=true`;
    window.open(url, '_blank');
  };

  const toggleRowExpand = (id) => {
    setExpandedTxId(prev => prev === id ? null : id);
  };

  const renderSortIndicator = (field) => {
    if (sortField !== field) return <span style={{ opacity: 0.3, marginLeft: '4px' }}>⇅</span>;
    return <span style={{ marginLeft: '4px' }}>{sortAsc ? '▲' : '▼'}</span>;
  };

  return (
    <section className="content-view active-view" aria-label="Transaction Ledger">
      <div className="view-header">
        <div>
          <h2 className="view-title">Transaction Ledger</h2>
          <p className="view-subtitle">Search, filter, allocate splits, and reconcile journal entries <kbd style={{ marginLeft: '6px', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-subtle)', border: '1px solid var(--border-color)' }}>Ctrl+N</kbd></p>
        </div>
        <div className="view-actions">
          <button type="button" className="btn btn-outline" onClick={triggerLedgerDownload} style={{ minHeight: '44px' }}>
            <span aria-hidden="true">📥</span> Export CSV
          </button>
        </div>
      </div>

      <div className="filter-toolbar glass-card">
        <div className="filter-row">
          <div className="filter-group flex-2">
            <label htmlFor="tx-search">Search Ledger</label>
            <input 
              id="tx-search"
              type="text" 
              placeholder="Search reference, donor, receipt #..." 
              value={filterSearch} 
              onChange={e => { setFilterSearch(e.target.value); setCurrentPage(1); }} 
            />
          </div>

          <div className="filter-group">
            <label htmlFor="tx-type-filter">Type</label>
            <select 
              id="tx-type-filter"
              value={filterType} 
              onChange={e => { setFilterType(e.target.value); setCurrentPage(1); }}
            >
              <option value="all">All Types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="tx-fund-filter">Fund</label>
            <select 
              id="tx-fund-filter"
              value={filterFund} 
              onChange={e => { setFilterFund(e.target.value); setCurrentPage(1); }}
            >
              <option value="all">All Funds</option>
              {balances.map(b => (
                <option key={b.fundId} value={b.fundId}>{b.fundName}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="tx-status-filter">Status</label>
            <select 
              id="tx-status-filter"
              value={filterStatus} 
              onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1); }}
            >
              <option value="all">All Statuses</option>
              <option value="PENDING">Pending (Cash on Hand)</option>
              <option value="BANKED">Banked / Cleared</option>
              <option value="VOIDED">Voided</option>
            </select>
          </div>
        </div>

        <div className="filter-row" style={{ marginTop: '10px', alignItems: 'center' }}>
          <div className="filter-group">
            <label htmlFor="tx-date-from">From</label>
            <input 
              id="tx-date-from"
              type="date" 
              value={filterDateFrom} 
              onChange={e => { setFilterDateFrom(e.target.value); setCurrentPage(1); }} 
            />
          </div>

          <div className="filter-group">
            <label htmlFor="tx-date-to">To</label>
            <input 
              id="tx-date-to"
              type="date" 
              value={filterDateTo} 
              onChange={e => { setFilterDateTo(e.target.value); setCurrentPage(1); }} 
            />
          </div>

          <div className="quick-ranges" style={{ display: 'flex', gap: '6px', marginTop: '16px' }}>
            <button type="button" className="btn-chip" onClick={() => setQuickDateRange('all')}>All Time</button>
            <button type="button" className="btn-chip" onClick={() => setQuickDateRange('month')}>This Month</button>
            <button type="button" className="btn-chip" onClick={() => setQuickDateRange('3months')}>Last 3M</button>
            <button type="button" className="btn-chip" onClick={() => setQuickDateRange('ytd')}>YTD</button>
          </div>

          <div className="filter-group" style={{ marginTop: '16px', marginLeft: 'auto' }}>
            <label className="checkbox-label" style={{ margin: 0 }}>
              <input 
                type="checkbox" 
                checked={filterJummahOnly} 
                onChange={e => { setFilterJummahOnly(e.target.checked); setCurrentPage(1); }} 
              />
              <span>🕌 Jummah Collections Only</span>
            </label>
          </div>

          {isFiltered && (
            <button 
              type="button" 
              className="btn btn-outline" 
              onClick={resetAllFilters} 
              style={{ minHeight: '36px', marginTop: '16px', marginLeft: '8px' }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Sticky Running Totals Summary Bar */}
      <div className="running-totals-bar glass-card" style={{ display: 'flex', gap: '20px', padding: '12px 18px', marginBottom: '14px', alignItems: 'center', flexWrap: 'wrap', fontSize: '13px' }}>
        <span style={{ color: 'var(--text-secondary)' }}>Filtered Ledger: <strong>{runningTotals.count}</strong> record{runningTotals.count === 1 ? '' : 's'}</span>
        <span style={{ color: 'var(--success)' }}>+ Income: <strong>{formatCurrency(runningTotals.income, org.currency_symbol)}</strong></span>
        <span style={{ color: 'var(--danger)' }}>- Expense: <strong>{formatCurrency(runningTotals.expense, org.currency_symbol)}</strong></span>
        <span style={{ marginLeft: 'auto', fontWeight: 'bold' }}>
          Net Position: <span style={{ color: runningTotals.net >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(runningTotals.net, org.currency_symbol)}</span>
        </span>
      </div>

      <div className="ledger-table-card glass-card">
        <div className="table-wrapper" tabIndex={0} role="region" aria-label="Financial transactions ledger table, scrollable horizontally">
          {paginatedTransactions.length === 0 ? (
            <EmptyState
              icon={isFiltered ? '🔍' : '📑'}
              title={isFiltered ? 'No Matching Transactions Found' : 'No Transactions Recorded Yet'}
              description={
                isFiltered
                  ? 'No transactions matched your current search filters or date range.'
                  : 'Start recording revenue, Friday collections, and expense vouchers into the ledger.'
              }
              actionLabel={isFiltered ? 'Clear Search Filters' : user?.role === 'ADMIN' ? '+ Record Transaction' : null}
              onAction={isFiltered ? resetAllFilters : user?.role === 'ADMIN' ? () => openModal('transaction') : null}
            />
          ) : (
            <table className="ledger-table table-perf">
              <thead>
                <tr>
                  <th style={{ width: '36px' }}></th>
                  <th onClick={() => handleSort('date')} style={{ cursor: 'pointer' }}>
                    Date {renderSortIndicator('date')}
                  </th>
                  <th onClick={() => handleSort('receipt')} style={{ cursor: 'pointer' }}>
                    Receipt / Ref {renderSortIndicator('receipt')}
                  </th>
                  <th>Description</th>
                  <th onClick={() => handleSort('category')} style={{ cursor: 'pointer' }}>
                    Category {renderSortIndicator('category')}
                  </th>
                  <th>Donor</th>
                  <th>Fund Splits</th>
                  <th>Method</th>
                  <th onClick={() => handleSort('amount')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                    Amount {renderSortIndicator('amount')}
                  </th>
                  <th onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>
                    Status {renderSortIndicator('status')}
                  </th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTransactions.map(tx => {
                  const isExpanded = expandedTxId === tx.id;
                  return (
                    <React.Fragment key={tx.id}>
                      <tr className={`${tx.status === 'VOIDED' ? 'tr-voided' : tx.status === 'FAILED' ? 'tr-failed' : ''} ${isExpanded ? 'row-expanded' : ''}`}>
                        <td>
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => toggleRowExpand(tx.id)}
                            aria-label={isExpanded ? 'Collapse transaction details' : 'Expand transaction details'}
                            style={{ minWidth: '32px', minHeight: '32px', fontSize: '11px' }}
                          >
                            {isExpanded ? '▼' : '▶'}
                          </button>
                        </td>
                        <td>{formatDate(tx.transaction_date)}</td>
                        <td>
                          <span className="receipt-badge">{tx.receipt_number || tx.id.substring(0, 11)}</span>
                        </td>
                        <td>
                          <strong>{tx.reference_note || tx.description}</strong>
                          {tx.status === 'VOIDED' && tx.void_reason && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>Void Reason: {tx.void_reason}</div>
                          )}
                        </td>
                        <td>{tx.category}</td>
                        <td>
                          <span>{tx.donorName || 'Anonymous'}</span>
                          {tx.giftAid && <span className="gift-aid-tag" title="HMRC Gift Aid Eligible" style={{ marginLeft: '4px' }}>GA</span>}
                        </td>
                        <td>
                          <div className="splits-summary">
                            {tx.splits?.map(s => (
                              <span key={s.id || s.fund_id} className="split-pill">
                                {s.fundName}: {formatCurrency(s.amount, org.currency_symbol)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <span className="method-pill">{tx.method || 'CASH'}</span>
                        </td>
                        <td className={tx.type === 'INCOME' ? 'val-income' : 'val-expense'} style={{ textAlign: 'right', fontWeight: 'bold' }}>
                          {tx.type === 'INCOME' ? '+' : '-'}{formatCurrency(tx.total_amount, org.currency_symbol)}
                        </td>
                        <td>
                          <span className={`status-badge ${tx.status === 'PENDING' ? 'status-cash' : tx.status === 'BANKED' ? 'status-banked' : tx.status === 'VOIDED' ? 'status-voided' : 'status-failed'}`}>
                            {tx.status === 'PENDING' ? 'Cash on Hand' : tx.status}
                          </span>
                        </td>
                        <td>
                          <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                            {tx.type === 'INCOME' && onLoadReceipt && (
                              <button 
                                type="button"
                                className="btn-icon" 
                                onClick={() => onLoadReceipt(tx)} 
                                title="Generate Receipt"
                                aria-label="Generate Receipt"
                              >
                                🧾
                              </button>
                            )}

                            {user?.role === 'ADMIN' && tx.status === 'PENDING' && !tx.reconciled && (
                              <button 
                                type="button"
                                className="btn-icon" 
                                onClick={() => handleBankDeposit(tx.id)} 
                                title="Mark Cash as Banked"
                                aria-label="Mark Cash as Banked"
                              >
                                🏦
                              </button>
                            )}

                            {user?.role === 'ADMIN' && tx.status !== 'VOIDED' && !tx.reconciled && (
                              <>
                                <button 
                                  type="button"
                                  className="btn-icon" 
                                  onClick={() => openModal('voidTx', tx)} 
                                  title="Void Transaction"
                                  aria-label="Void Transaction"
                                >
                                  🚫
                                </button>
                                <button 
                                  type="button"
                                  className="btn-icon" 
                                  onClick={() => handleReconcileLock(tx.id)} 
                                  title="Reconcile and Permanently Lock"
                                  aria-label="Reconcile and Lock"
                                >
                                  🔒
                                </button>
                              </>
                            )}

                            {tx.reconciled && <span className="locked-badge" title="Reconciled & Locked">🔒 Locked</span>}
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="tx-details-expansion-row">
                          <td colSpan={11} style={{ padding: '14px 20px', backgroundColor: 'var(--bg-subtle)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', fontSize: '13px' }}>
                              <div>
                                <strong>Fund Allocations:</strong>
                                <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                                  {tx.splits?.map(s => (
                                    <li key={s.id || s.fund_id}>
                                      {s.fundName}: <strong>{formatCurrency(s.amount, org.currency_symbol)}</strong>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <strong>Audit &amp; Compliance Details:</strong>
                                <div style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                                  <div>Transaction ID: <code>{tx.id}</code></div>
                                  <div>Created By: {tx.created_by || 'Unknown'}</div>
                                  <div>HMRC Gift Aid: {tx.giftAid ? '✓ Claimable (25%)' : '✗ No'}</div>
                                </div>
                              </div>
                              {tx.notes && (
                                <div>
                                  <strong>Beneficiary / Audit Notes:</strong>
                                  <div style={{ marginTop: '4px', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                                    &ldquo;{tx.notes}&rdquo;
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {filteredTransactions.length > itemsPerPage && (
          <Pagination 
            currentPage={currentPage}
            totalItems={filteredTransactions.length}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
          />
        )}
      </div>
    </section>
  );
}

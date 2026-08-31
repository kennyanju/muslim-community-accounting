'use client';

import React, { useState, useMemo } from 'react';
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
  const itemsPerPage = 15;

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

    return list;
  }, [transactions, filterType, filterFund, filterCategory, filterStatus, filterDateFrom, filterDateTo, filterJummahOnly, debouncedSearch]);

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

  return (
    <section className="content-view active-view" aria-label="Transaction Ledger">
      <div className="view-header">
        <div>
          <h2 className="view-title">Transaction Ledger</h2>
          <p className="view-subtitle">Search, filter, allocate splits, and reconcile journal entries</p>
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
            <label htmlFor="tx-filter-type">Type</label>
            <select id="tx-filter-type" value={filterType} onChange={e => { setFilterType(e.target.value); setCurrentPage(1); }}>
              <option value="all">All Types</option>
              <option value="income">Income (+)</option>
              <option value="expense">Expense (-)</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="tx-filter-fund">Fund</label>
            <select id="tx-filter-fund" value={filterFund} onChange={e => { setFilterFund(e.target.value); setCurrentPage(1); }}>
              <option value="all">All Funds</option>
              {balances.map(b => (
                <option key={b.fundId} value={b.fundId}>{b.fundName}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="tx-filter-status">Status</label>
            <select id="tx-filter-status" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1); }}>
              <option value="all">All Statuses</option>
              <option value="Active">Active Only</option>
              <option value="Cash on Hand">Cash on Hand (Pending)</option>
              <option value="Banked">Banked</option>
              <option value="Voided">Voided</option>
            </select>
          </div>
        </div>

        <div className="filter-row filter-row-secondary">
          <div className="date-range-presets">
            <span className="preset-label">Quick Dates:</span>
            <button type="button" className="btn-preset" onClick={() => setQuickDateRange('month')}>This Month</button>
            <button type="button" className="btn-preset" onClick={() => setQuickDateRange('3months')}>Last 3 Months</button>
            <button type="button" className="btn-preset" onClick={() => setQuickDateRange('ytd')}>Year to Date</button>
            <button type="button" className="btn-preset" onClick={() => setQuickDateRange('all')}>All Time</button>
          </div>

          <div className="date-inputs">
            <input 
              type="date" 
              value={filterDateFrom} 
              onChange={e => { setFilterDateFrom(e.target.value); setCurrentPage(1); }} 
              title="From Date"
              aria-label="Date From"
            />
            <span>to</span>
            <input 
              type="date" 
              value={filterDateTo} 
              onChange={e => { setFilterDateTo(e.target.value); setCurrentPage(1); }} 
              title="To Date"
              aria-label="Date To"
            />
          </div>

          <label className="checkbox-label jummah-filter">
            <input 
              type="checkbox" 
              checked={filterJummahOnly} 
              onChange={e => { setFilterJummahOnly(e.target.checked); setCurrentPage(1); }} 
            />
            <span>🕌 Friday Collections</span>
          </label>
        </div>
      </div>

      <div className="ledger-table-card glass-card">
        <div className="table-wrapper">
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
                  <th>Date</th>
                  <th>Receipt / Ref</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Donor</th>
                  <th>Fund Splits</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTransactions.map(tx => (
                  <tr key={tx.id} className={tx.status === 'VOIDED' ? 'tr-voided' : tx.status === 'FAILED' ? 'tr-failed' : ''}>
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
                      {tx.giftAid && <span className="gift-aid-tag" title="HMRC Gift Aid Eligible">GA</span>}
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
                    <td className={tx.type === 'INCOME' ? 'val-income' : 'val-expense'}>
                      {tx.type === 'INCOME' ? '+' : '-'}{formatCurrency(tx.total_amount, org.currency_symbol)}
                    </td>
                    <td>
                      <span className={`status-badge ${tx.status === 'PENDING' ? 'status-cash' : tx.status === 'BANKED' ? 'status-banked' : tx.status === 'VOIDED' ? 'status-voided' : 'status-failed'}`}>
                        {tx.status === 'PENDING' ? 'Cash on Hand' : tx.status}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
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
                ))}
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

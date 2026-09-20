'use client';

import React, { useState, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import Pagination from '@/components/common/Pagination';
import EmptyState from '@/components/common/EmptyState';
import { useDebounce } from '@/hooks/useDebounce';
import { formatCurrency, formatDate } from '@/utils/formatters';

export default function DonorsTab() {
  const { donors, transactions, org, user, openModal } = useApp();

  const [search, setSearch] = useState('');
  const [giftAidFilter, setGiftAidFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedDonorId, setExpandedDonorId] = useState(null);
  const itemsPerPage = 15;

  const debouncedSearch = useDebounce(search, 250);

  const resetFilters = () => {
    setSearch('');
    setGiftAidFilter('all');
    setCurrentPage(1);
  };

  const isFiltered = debouncedSearch || giftAidFilter !== 'all';

  const donorTransactionsMap = useMemo(() => {
    const map = {};
    transactions.forEach(t => {
      const dId = t.donor_id || 'anonymous';
      if (!map[dId]) map[dId] = [];
      map[dId].push(t);
    });
    return map;
  }, [transactions]);

  const donorContributions = useMemo(() => {
    const totals = {};
    transactions.forEach(t => {
      if (t.type === 'INCOME' && t.status !== 'VOIDED' && t.status !== 'FAILED') {
        const dId = t.donor_id || 'anonymous';
        totals[dId] = (totals[dId] || 0) + (parseFloat(t.total_amount) || 0);
      }
    });
    return totals;
  }, [transactions]);

  const filteredDonors = useMemo(() => {
    let list = [...donors];

    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      list = list.filter(d => 
        d.name?.toLowerCase().includes(s) ||
        d.email?.toLowerCase().includes(s) ||
        d.postcode?.toLowerCase().includes(s) ||
        d.address_line_1?.toLowerCase().includes(s)
      );
    }

    if (giftAidFilter === 'eligible') {
      list = list.filter(d => d.gift_aid_eligible);
    } else if (giftAidFilter === 'ineligible') {
      list = list.filter(d => !d.gift_aid_eligible);
    }

    return list;
  }, [donors, debouncedSearch, giftAidFilter]);

  const paginatedDonors = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredDonors.slice(start, start + itemsPerPage);
  }, [filteredDonors, currentPage]);

  const toggleExpand = (donorId) => {
    setExpandedDonorId(prev => prev === donorId ? null : donorId);
  };

  return (
    <section className="content-view active-view" aria-label="Donor Directory">
      <div className="view-header">
        <div>
          <h2 className="view-title">Donor Directory &amp; Gift Aid Registry</h2>
          <p className="view-subtitle">Manage donor declarations, contact details, and UK HMRC Gift Aid postal compliance</p>
        </div>
        {user?.role === 'ADMIN' && (
          <div className="view-actions">
            <button type="button" className="btn btn-primary" onClick={() => openModal('donor')} style={{ minHeight: '44px' }}>
              <span aria-hidden="true">+</span> Register Donor
            </button>
          </div>
        )}
      </div>

      <div className="filter-toolbar glass-card">
        <div className="filter-row">
          <div className="filter-group flex-2">
            <label htmlFor="donor-search">Search Donors</label>
            <input 
              id="donor-search"
              type="text" 
              placeholder="Search by donor name, email, postcode..." 
              value={search} 
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} 
            />
          </div>

          <div className="filter-group">
            <label htmlFor="donor-ga-filter">Gift Aid Status</label>
            <select 
              id="donor-ga-filter"
              value={giftAidFilter} 
              onChange={e => { setGiftAidFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="all">All Donors</option>
              <option value="eligible">Gift Aid Eligible Only</option>
              <option value="ineligible">Standard / No Declaration</option>
            </select>
          </div>
        </div>
      </div>

      <div className="ledger-table-card glass-card">
        <div className="table-wrapper" tabIndex={0} role="region" aria-label="Donors directory table, scrollable horizontally">
          {paginatedDonors.length === 0 ? (
            <EmptyState
              icon={isFiltered ? '🔍' : '👥'}
              title={isFiltered ? 'No Donors Matched Criteria' : 'No Registered Donors'}
              description={
                isFiltered
                  ? 'No donor profile matched your search query or Gift Aid filter.'
                  : 'Register regular donors and capture postal declarations for UK HMRC Gift Aid reclaims.'
              }
              actionLabel={isFiltered ? 'Clear Filters' : user?.role === 'ADMIN' ? '+ Register Donor' : null}
              onAction={isFiltered ? resetFilters : user?.role === 'ADMIN' ? () => openModal('donor') : null}
            />
          ) : (
            <table className="ledger-table table-perf">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>Donor Name</th>
                  <th>Email / Contact</th>
                  <th>Address</th>
                  <th>Postcode</th>
                  <th>Gift Aid Status</th>
                  <th>Lifetime Giving</th>
                  {user?.role === 'ADMIN' && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {paginatedDonors.map(donor => {
                  const isExpanded = expandedDonorId === donor.id;
                  const donorTxs = donorTransactionsMap[donor.id] || [];
                  const totalGiven = donorContributions[donor.id] || 0;

                  return (
                    <React.Fragment key={donor.id}>
                      <tr className={isExpanded ? 'row-expanded' : ''}>
                        <td>
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => toggleExpand(donor.id)}
                            aria-label={isExpanded ? 'Collapse donor history' : 'Expand donor history'}
                            style={{ minWidth: '36px', minHeight: '36px', fontSize: '12px' }}
                          >
                            {isExpanded ? '▼' : '▶'}
                          </button>
                        </td>
                        <td>
                          <strong>{donor.name}</strong>
                          {donor.is_anonymous && <span className="badge-anon" style={{ marginLeft: '8px' }}>Default Anonymous</span>}
                        </td>
                        <td>
                          {donor.email ? (
                            <a href={`mailto:${donor.email}`} className="donor-email-link">{donor.email}</a>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          {donor.address_line_1 ? (
                            <span>{[donor.address_line_1, donor.address_line_2, donor.city].filter(Boolean).join(', ')}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          {donor.postcode ? (
                            <span className="postcode-badge">{donor.postcode}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          {donor.gift_aid_eligible ? (
                            <span className="status-badge status-banked">✓ Eligible (Declaration on File)</span>
                          ) : (
                            <span className="status-badge status-voided">✗ Ineligible</span>
                          )}
                        </td>
                        <td>
                          <strong>{formatCurrency(totalGiven, org.currency_symbol)}</strong>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {donorTxs.length} donation{donorTxs.length === 1 ? '' : 's'}
                          </div>
                        </td>
                        {user?.role === 'ADMIN' && (
                          <td style={{ textAlign: 'right' }}>
                            {!donor.is_anonymous && (
                              <button
                                type="button"
                                className="btn btn-outline"
                                onClick={() => openModal('donor', donor)}
                                style={{ minHeight: '36px', padding: '4px 12px', fontSize: '12px' }}
                              >
                                ✏️ Edit
                              </button>
                            )}
                          </td>
                        )}
                      </tr>

                      {isExpanded && (
                        <tr className="history-expansion-row">
                          <td colSpan={user?.role === 'ADMIN' ? 8 : 7} style={{ padding: '16px 20px', backgroundColor: 'var(--bg-subtle)' }}>
                            <div className="donor-history-card">
                              <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', display: 'flex', justifyContent: 'space-between' }}>
                                <span>📜 Giving History for {donor.name}</span>
                                <span>Total: {formatCurrency(totalGiven, org.currency_symbol)}</span>
                              </h4>
                              {donorTxs.length === 0 ? (
                                <p className="text-muted" style={{ margin: 0, fontSize: '13px' }}>No transactions recorded for this donor profile yet.</p>
                              ) : (
                                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                                    <thead>
                                      <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-secondary)' }}>
                                        <th style={{ padding: '6px' }}>Date</th>
                                        <th style={{ padding: '6px' }}>Receipt #</th>
                                        <th style={{ padding: '6px' }}>Category</th>
                                        <th style={{ padding: '6px' }}>Method</th>
                                        <th style={{ padding: '6px' }}>Status</th>
                                        <th style={{ padding: '6px', textAlign: 'right' }}>Amount</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {donorTxs.map(tx => (
                                        <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                          <td style={{ padding: '6px' }}>{formatDate(tx.transaction_date)}</td>
                                          <td style={{ padding: '6px' }}><code>{tx.receipt_number || '—'}</code></td>
                                          <td style={{ padding: '6px' }}>{tx.category}</td>
                                          <td style={{ padding: '6px' }}>{tx.method}</td>
                                          <td style={{ padding: '6px' }}>
                                            <span className={`status-badge status-${(tx.status || 'pending').toLowerCase()}`}>
                                              {tx.status}
                                            </span>
                                          </td>
                                          <td style={{ padding: '6px', textAlign: 'right', fontWeight: 'bold' }}>
                                            {formatCurrency(tx.total_amount, org.currency_symbol)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
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

        {filteredDonors.length > itemsPerPage && (
          <Pagination 
            currentPage={currentPage}
            totalItems={filteredDonors.length}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
          />
        )}
      </div>
    </section>
  );
}

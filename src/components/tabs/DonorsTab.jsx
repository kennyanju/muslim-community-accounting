'use client';

import React, { useState, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import Pagination from '@/components/common/Pagination';

export default function DonorsTab() {
  const { donors, transactions, org, user, openModal } = useApp();

  const [search, setSearch] = useState('');
  const [giftAidFilter, setGiftAidFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

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

    if (search) {
      const s = search.toLowerCase();
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
  }, [donors, search, giftAidFilter]);

  const paginatedDonors = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredDonors.slice(start, start + itemsPerPage);
  }, [filteredDonors, currentPage]);

  return (
    <section className="content-view active-view" aria-label="Donor Directory">
      <div className="view-header">
        <div>
          <h2 className="view-title">Donor Directory &amp; Gift Aid Registry</h2>
          <p className="view-subtitle">Manage donor declarations and UK HMRC Gift Aid postal address compliance</p>
        </div>
        {user?.role === 'ADMIN' && (
          <div className="view-actions">
            <button type="button" className="btn btn-primary" onClick={() => openModal('donor')}>
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
        <div className="table-wrapper">
          <table className="ledger-table table-perf">
            <thead>
              <tr>
                <th>Donor Name</th>
                <th>Email / Contact</th>
                <th>Address</th>
                <th>Postcode</th>
                <th>Gift Aid Status</th>
                <th>Lifetime Donations</th>
              </tr>
            </thead>
            <tbody>
              {paginatedDonors.length === 0 ? (
                <tr>
                  <td colSpan="6" className="empty-state">No matching donors found.</td>
                </tr>
              ) : (
                paginatedDonors.map(donor => (
                  <tr key={donor.id}>
                    <td>
                      <strong>{donor.name}</strong>
                      {donor.is_anonymous && <span className="badge-anon">Default Anonymous</span>}
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
                      <strong>{org.currency_symbol || '£'}{(donorContributions[donor.id] || 0).toFixed(2)}</strong>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination 
          currentPage={currentPage}
          totalItems={filteredDonors.length}
          itemsPerPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      </div>
    </section>
  );
}

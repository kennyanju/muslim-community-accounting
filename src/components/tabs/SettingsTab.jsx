'use client';

import React, { useState, useRef } from 'react';
import { useApp } from '@/context/AppContext';

export default function SettingsTab() {
  const { org, setOrg, funds, usersList, fetchAPI, addToast, refreshData, openModal } = useApp();

  const [subtab, setSubtab] = useState('profile');
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const handleUpdateOrganisation = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const updated = await fetchAPI('/api/organisation', {
        method: 'PUT',
        body: JSON.stringify(org)
      });
      setOrg(updated);
      try {
        localStorage.setItem('masjid_org_profile', JSON.stringify(updated));
      } catch (e) {}
      addToast('Mosque & organisation profile updated successfully.', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleArchiveFund = async (fund) => {
    try {
      await fetchAPI(`/api/funds/${fund.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_archived: !fund.is_archived })
      });
      addToast(`Fund "${fund.name}" ${fund.is_archived ? 'restored' : 'archived'}.`, 'info');
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleToggleUserStatus = async (targetUser) => {
    const newStatus = targetUser.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await fetchAPI(`/api/users/${targetUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      addToast(`User ${targetUser.email} marked as ${newStatus}.`, 'info');
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDownloadBackup = () => {
    window.open('/api/backup', '_blank');
    addToast('Database JSON backup downloaded.', 'success');
  };

  const handleRestoreFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target.result);
        const confirmRestore = window.confirm(
          'CAUTION: Restoring will overwrite current database records with the backup file. Proceed?'
        );
        if (!confirmRestore) return;

        setSubmitting(true);
        await fetchAPI('/api/backup', {
          method: 'POST',
          body: JSON.stringify(json)
        });
        addToast('Database backup successfully restored!', 'success');
        refreshData();
      } catch (err) {
        addToast(`Restore failed: ${err.message}`, 'error');
      } finally {
        setSubmitting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleResetDatabase = async () => {
    const confirmReset = window.confirm(
      '⚠️ DANGER: Are you sure you want to reset the database to a clean state?\n\nThis will clear all transactions, splits, and sample donors so you can start from scratch. Your login will be preserved.\n\nThis action cannot be undone.'
    );
    if (!confirmReset) return;

    setSubmitting(true);
    try {
      await fetchAPI('/api/backup', { method: 'DELETE' });
      addToast('Database reset to fresh state. Ready for setup!', 'success');
      refreshData();
    } catch (err) {
      addToast(`Reset failed: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="content-view active-view" aria-label="Settings and Administration">
      <div className="view-header">
        <div>
          <h2 className="view-title">Mosque Settings &amp; Administration</h2>
          <p className="view-subtitle">Configure organisation profile, custom Islamic funds, staff accounts, and database backups</p>
        </div>
      </div>

      <nav className="settings-subnav" aria-label="Settings Sub-navigation">
        <button 
          type="button" 
          className={`settings-subtab ${subtab === 'profile' ? 'active' : ''}`} 
          onClick={() => setSubtab('profile')}
        >
          🕌 Mosque Profile
        </button>
        <button 
          type="button" 
          className={`settings-subtab ${subtab === 'funds' ? 'active' : ''}`} 
          onClick={() => setSubtab('funds')}
        >
          💼 Fund Management ({funds.length})
        </button>
        <button 
          type="button" 
          className={`settings-subtab ${subtab === 'users' ? 'active' : ''}`} 
          onClick={() => setSubtab('users')}
        >
          👥 User Accounts ({usersList.length})
        </button>
        <button 
          type="button" 
          className={`settings-subtab ${subtab === 'backup' ? 'active' : ''}`} 
          onClick={() => setSubtab('backup')}
        >
          🛡️ Backup &amp; Recovery
        </button>
      </nav>

      {/* Subtab 1: Mosque Profile */}
      {subtab === 'profile' && (
        <div className="glass-card" style={{ maxWidth: '720px' }}>
          <h3>Organisation &amp; Charity Details</h3>
          <p className="info-p" style={{ marginBottom: '20px' }}>
            These details will be displayed across the software, receipts, and HMRC reports.
          </p>
          
          <form onSubmit={handleUpdateOrganisation}>
            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="org-name">Mosque / Centre Full Name</label>
                <input 
                  id="org-name" 
                  type="text" 
                  value={org.name} 
                  onChange={e => setOrg({ ...org, name: e.target.value })} 
                  required 
                />
              </div>
              <div className="form-group">
                <label htmlFor="org-short-name">Short Name (Acronym)</label>
                <input 
                  id="org-short-name" 
                  type="text" 
                  value={org.short_name} 
                  onChange={e => setOrg({ ...org, short_name: e.target.value })} 
                  required 
                />
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="org-tagline">Tagline / Subtitle</label>
                <input 
                  id="org-tagline" 
                  type="text" 
                  value={org.tagline} 
                  onChange={e => setOrg({ ...org, tagline: e.target.value })} 
                />
              </div>
              <div className="form-group">
                <label htmlFor="org-charity-no">UK Charity Commission Reg No.</label>
                <input 
                  id="org-charity-no" 
                  type="text" 
                  value={org.charity_number} 
                  onChange={e => setOrg({ ...org, charity_number: e.target.value })} 
                  required 
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="org-address">Registered Address</label>
              <input 
                id="org-address" 
                type="text" 
                value={org.address} 
                onChange={e => setOrg({ ...org, address: e.target.value })} 
                required 
              />
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="org-email">Finance Contact Email</label>
                <input 
                  id="org-email" 
                  type="email" 
                  value={org.email} 
                  onChange={e => setOrg({ ...org, email: e.target.value })} 
                  required 
                />
              </div>
              <div className="form-group">
                <label htmlFor="org-phone">Contact Phone</label>
                <input 
                  id="org-phone" 
                  type="text" 
                  value={org.phone} 
                  onChange={e => setOrg({ ...org, phone: e.target.value })} 
                />
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="org-currency">Currency Symbol</label>
                <input 
                  id="org-currency" 
                  type="text" 
                  value={org.currency_symbol} 
                  onChange={e => setOrg({ ...org, currency_symbol: e.target.value })} 
                  required 
                />
              </div>
              <div className="form-group">
                <label htmlFor="org-country">Country / Jurisdiction</label>
                <input 
                  id="org-country" 
                  type="text" 
                  value={org.country} 
                  onChange={e => setOrg({ ...org, country: e.target.value })} 
                  required 
                />
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '24px' }}>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Saving...' : '💾 Save Organisation Profile'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Subtab 2: Fund Management */}
      {subtab === 'funds' && (
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h3>Custom Islamic Funds &amp; Wallets</h3>
              <p className="info-p">Configure Restricted (Zakat, Fitrana) and Unrestricted (Lillah, Building) fund buckets.</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => openModal('fund', { mode: 'create' })}>
              + Add New Fund
            </button>
          </div>

          <div className="table-wrapper">
            <table className="ledger-table table-perf">
              <thead>
                <tr>
                  <th>Fund Name</th>
                  <th>Classification</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {funds.map(f => (
                  <tr key={f.id} style={{ opacity: f.is_archived ? 0.6 : 1 }}>
                    <td><strong>{f.name}</strong></td>
                    <td>
                      <span className={`wallet-type ${f.is_restricted ? 'type-restricted' : 'type-unrestricted'}`}>
                        {f.is_restricted ? 'Restricted' : 'Unrestricted'}
                      </span>
                    </td>
                    <td>{f.description || '—'}</td>
                    <td>
                      <span className={`status-badge ${f.is_archived ? 'status-voided' : 'status-active'}`}>
                        {f.is_archived ? 'Archived' : 'Active'}
                      </span>
                    </td>
                    <td>
                      {f.name !== 'Interest/Riba' && f.name !== 'Zakat' && f.name !== 'Fitrana' && (
                        <button 
                          type="button"
                          className="action-btn" 
                          onClick={() => handleToggleArchiveFund(f)}
                        >
                          {f.is_archived ? 'Restore' : 'Archive'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 3: User Management */}
      {subtab === 'users' && (
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h3>User Accounts &amp; Access Controls</h3>
              <p className="info-p">Manage committee logins for Financial Secretaries (Admin), Trustees (Reviewers), and Auditors.</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => openModal('user', { mode: 'create' })}>
              + Add User
            </button>
          </div>

          <div className="table-wrapper">
            <table className="ledger-table table-perf">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {usersList.map(u => (
                  <tr key={u.id} style={{ opacity: u.status === 'INACTIVE' ? 0.6 : 1 }}>
                    <td><strong>{u.name || 'User'}</strong></td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`badge ${u.role === 'ADMIN' ? 'badge-admin' : u.role === 'REVIEWER' ? 'badge-reviewer' : 'badge-auditor'}`}>
                        {u.role === 'ADMIN' ? 'Financial Secretary' : u.role === 'REVIEWER' ? 'Trustee' : 'Auditor'}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${u.status === 'ACTIVE' ? 'status-active' : 'status-voided'}`}>
                        {u.status}
                      </span>
                    </td>
                    <td>
                      <button 
                        type="button"
                        className="action-btn" 
                        onClick={() => handleToggleUserStatus(u)}
                      >
                        {u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 4: Backup & Recovery */}
      {subtab === 'backup' && (
        <div className="glass-card" style={{ maxWidth: '720px' }}>
          <h3>Database Backup &amp; Recovery</h3>
          <p className="info-p" style={{ marginBottom: '20px' }}>
            Export or restore the entire database. Passwords are encrypted and sanitized.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button type="button" className="btn btn-primary" onClick={handleDownloadBackup}>
                📥 Download JSON Backup
              </button>
              <span className="text-secondary" style={{ fontSize: '0.85rem' }}>
                Complete snapshot of funds, transactions, donors, and settings.
              </span>
            </div>

            <hr style={{ borderColor: 'var(--border-color)', margin: '16px 0' }} />

            <div>
              <label htmlFor="restore-file-input" style={{ fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                Restore from Backup JSON
              </label>
              <input 
                id="restore-file-input"
                type="file" 
                accept=".json" 
                ref={fileInputRef} 
                onChange={handleRestoreFileSelect}
                disabled={submitting}
              />
            </div>

            <hr style={{ borderColor: 'var(--border-color)', margin: '16px 0' }} />

            <div style={{ background: 'var(--danger-light)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--danger)' }}>
              <h4 style={{ color: 'var(--danger)', margin: '0 0 8px 0' }}>⚠️ Danger Zone: Clean Database Reset</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Wipe all transactions, splits, and sample donor records to start fresh for a new financial year. Your login account will be preserved.
              </p>
              <button 
                type="button" 
                className="btn btn-danger" 
                onClick={handleResetDatabase}
                disabled={submitting}
              >
                {submitting ? 'Resetting...' : '⚠️ Reset Database to Clean State'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

'use client';

import React, { useState, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import EmptyState from '@/components/common/EmptyState';
import { validateClientOrganisation } from '@/lib/clientValidation';

export default function SettingsTab() {
  const { org, setOrg, funds, usersList, fetchAPI, addToast, refreshData, openModal, optimisticToggleFundArchive, optimisticToggleUserStatus } = useApp();

  const [subtab, setSubtab] = useState('profile');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [isResettingDb, setIsResettingDb] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmInput, setResetConfirmInput] = useState('');
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreConfirmInput, setRestoreConfirmInput] = useState('');
  const [pendingRestorePayload, setPendingRestorePayload] = useState(null);
  const fileInputRef = useRef(null);

  const [lockDate, setLockDate] = useState('');
  const [lockReason, setLockReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [isUpdatingPeriodLock, setIsUpdatingPeriodLock] = useState(false);

  const handleLockPeriod = async (e) => {
    e.preventDefault();
    if (!lockDate) {
      addToast('Please select a date through which to lock the ledger.', 'error');
      return;
    }
    if (!lockReason || lockReason.trim().length < 5) {
      addToast('An audit reason of at least 5 characters is required.', 'error');
      return;
    }

    setIsUpdatingPeriodLock(true);
    try {
      const updated = await fetchAPI('/api/organisation/period-lock', {
        method: 'POST',
        body: JSON.stringify({
          action: 'close',
          closed_until_date: lockDate,
          reason: lockReason
        })
      });
      setOrg(updated);
      setLockReason('');
      addToast(`Accounting period closed and locked through ${lockDate}.`, 'success');
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setIsUpdatingPeriodLock(false);
    }
  };

  const handleReopenPeriod = async (e) => {
    e.preventDefault();
    if (!reopenReason || reopenReason.trim().length < 5) {
      addToast('A justification of at least 5 characters is required to reopen the period.', 'error');
      return;
    }

    setIsUpdatingPeriodLock(true);
    try {
      const updated = await fetchAPI('/api/organisation/period-lock', {
        method: 'POST',
        body: JSON.stringify({
          action: 'reopen',
          reason: reopenReason
        })
      });
      setOrg(updated);
      setReopenReason('');
      addToast('Accounting period reopened successfully.', 'success');
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setIsUpdatingPeriodLock(false);
    }
  };

  const handleUpdateOrganisation = async (e) => {
    e.preventDefault();

    // Client-side schema validation
    const { isValid, errors: validationErrors } = validateClientOrganisation(org);
    if (!isValid) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
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

  const handleToggleArchiveFund = (fund) => {
    optimisticToggleFundArchive(fund);
  };

  const handleToggleUserStatus = (targetUser) => {
    optimisticToggleUserStatus(targetUser);
  };

  const handleDownloadBackup = () => {
    setIsExportingBackup(true);
    try {
      window.open('/api/backup', '_blank');
      addToast('Database JSON backup downloaded.', 'success');
    } catch (err) {
      addToast('Failed to export backup.', 'error');
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handleRestoreFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target.result);
        setPendingRestorePayload(json);
        setRestoreConfirmInput('');
        setShowRestoreModal(true);
      } catch (err) {
        addToast(`Invalid backup JSON file: ${err.message}`, 'error');
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteRestore = async () => {
    if (restoreConfirmInput.trim() !== 'RESTORE' || !pendingRestorePayload) return;
    setShowRestoreModal(false);
    setIsRestoringBackup(true);
    try {
      await fetchAPI('/api/backup', {
        method: 'POST',
        body: JSON.stringify(pendingRestorePayload)
      });
      addToast('Database backup successfully restored!', 'success');
      refreshData();
    } catch (err) {
      addToast(`Restore failed: ${err.message}`, 'error');
    } finally {
      setIsRestoringBackup(false);
      setPendingRestorePayload(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleOpenResetModal = () => {
    setResetConfirmInput('');
    setShowResetModal(true);
  };

  const handleExecuteReset = async () => {
    if (resetConfirmInput.trim() !== 'RESET') return;
    setShowResetModal(false);
    setIsResettingDb(true);
    try {
      await fetchAPI('/api/backup', { method: 'DELETE' });
      addToast('Database reset to fresh state. Ready for setup!', 'success');
      refreshData();
    } catch (err) {
      addToast(`Reset failed: ${err.message}`, 'error');
    } finally {
      setIsResettingDb(false);
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
        <>
        <div className="glass-card" style={{ maxWidth: '720px' }}>
          <h3>Organisation &amp; Charity Details</h3>
          <p className="info-p" style={{ marginBottom: '20px' }}>
            These details will be displayed across the software, receipts, and HMRC reports.
          </p>
          
          <form onSubmit={handleUpdateOrganisation} noValidate>
            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="org-name">Mosque / Centre Full Name *</label>
                <input 
                  id="org-name" 
                  name="name"
                  type="text" 
                  autoComplete="organization"
                  value={org.name} 
                  onChange={e => {
                    setOrg({ ...org, name: e.target.value });
                    if (errors.name) setErrors(prev => ({ ...prev, name: null }));
                  }} 
                  required 
                />
                {errors.name && <span className="field-error">{errors.name}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="org-short-name">Short Name (Acronym)</label>
                <input 
                  id="org-short-name" 
                  name="short_name"
                  type="text" 
                  autoComplete="organization-title"
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
                  name="tagline"
                  type="text" 
                  value={org.tagline} 
                  onChange={e => setOrg({ ...org, tagline: e.target.value })} 
                />
              </div>
              <div className="form-group">
                <label htmlFor="org-charity-no">UK Charity Commission Reg No.</label>
                <input 
                  id="org-charity-no" 
                  name="charity_number"
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
                name="address"
                type="text" 
                autoComplete="street-address"
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
                  name="email"
                  type="email" 
                  autoComplete="email"
                  value={org.email} 
                  onChange={e => {
                    setOrg({ ...org, email: e.target.value });
                    if (errors.email) setErrors(prev => ({ ...prev, email: null }));
                  }} 
                  required 
                />
                {errors.email && <span className="field-error">{errors.email}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="org-phone">Contact Phone</label>
                <input 
                  id="org-phone" 
                  name="phone"
                  type="tel" 
                  autoComplete="tel"
                  value={org.phone} 
                  onChange={e => setOrg({ ...org, phone: e.target.value })} 
                />
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="org-currency">Currency Symbol *</label>
                <input 
                  id="org-currency" 
                  name="currency_symbol"
                  type="text" 
                  value={org.currency_symbol} 
                  onChange={e => {
                    setOrg({ ...org, currency_symbol: e.target.value });
                    if (errors.currency_symbol) setErrors(prev => ({ ...prev, currency_symbol: null }));
                  }} 
                  required 
                />
                {errors.currency_symbol && <span className="field-error">{errors.currency_symbol}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="org-country">Country / Jurisdiction</label>
                <input 
                  id="org-country" 
                  name="country"
                  type="text" 
                  autoComplete="country-name"
                  value={org.country} 
                  onChange={e => setOrg({ ...org, country: e.target.value })} 
                  required 
                />
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: '24px' }}>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Saving Changes...' : '💾 Save Organisation Profile'}
              </button>
            </div>
          </form>
        </div>

        <div className="glass-card" style={{ marginTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3>Accounting Period Close &amp; Audit Governance</h3>
              <p className="info-p">Anti-tamper controls: prevent backdated postings, modifications, or voids into historical audited periods.</p>
            </div>
            <span
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 700,
                background: org.closed_until_date ? 'rgba(229, 62, 62, 0.15)' : 'rgba(72, 187, 120, 0.15)',
                color: org.closed_until_date ? '#e53e3e' : '#48bb78',
                border: `1px solid ${org.closed_until_date ? '#e53e3e' : '#48bb78'}`
              }}
            >
              {org.closed_until_date ? `🔒 Closed Through ${org.closed_until_date}` : '🟢 Ledger Active (Open)'}
            </span>
          </div>

          {org.closed_until_date ? (
            <div style={{ background: 'rgba(229, 62, 62, 0.06)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(229, 62, 62, 0.2)' }}>
              <p style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                <strong>Audit Notice:</strong> The books for periods on or prior to <strong>{org.closed_until_date}</strong> are permanently locked.
                Any attempts to create backdated transactions, void entries, or transfer funds on or prior to this date will be blocked.
              </p>
              <form onSubmit={handleReopenPeriod}>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="reopen-reason">Reopen Justification / Audit Reason *</label>
                  <input
                    id="reopen-reason"
                    type="text"
                    className="input-field"
                    placeholder="e.g., Independent Examiner requested audit adjustment for year end 2024"
                    value={reopenReason}
                    onChange={e => setReopenReason(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-outline"
                  disabled={isUpdatingPeriodLock}
                  style={{ color: '#e53e3e', borderColor: '#e53e3e' }}
                >
                  {isUpdatingPeriodLock ? 'Reopening...' : '🔓 Reopen Accounting Period'}
                </button>
              </form>
            </div>
          ) : (
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                To finalize quarterly accounts or your Charity Commission annual return, close the accounting period up to your audit date.
              </p>
              <form onSubmit={handleLockPeriod}>
                <div className="form-row-2">
                  <div className="form-group">
                    <label htmlFor="period-lock-date">Close Books Through Date *</label>
                    <input
                      id="period-lock-date"
                      type="date"
                      className="input-field"
                      value={lockDate}
                      onChange={e => setLockDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="period-lock-reason">Audit Sign-off Justification *</label>
                    <input
                      id="period-lock-reason"
                      type="text"
                      className="input-field"
                      placeholder="e.g., Trustees approved Q4 accounts / Annual audit complete"
                      value={lockReason}
                      onChange={e => setLockReason(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isUpdatingPeriodLock}
                  style={{ marginTop: '8px' }}
                >
                  {isUpdatingPeriodLock ? 'Locking Period...' : '🔒 Close & Lock Accounting Period'}
                </button>
              </form>
            </div>
          )}
        </div>
        </>
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

          {funds.length === 0 ? (
            <EmptyState
              icon="💼"
              title="No Islamic Funds Found"
              description="Create segregated fund wallets (e.g. Zakat, Fitrana, Lillah, Building) to track financial allocations."
              actionLabel="+ Add New Fund"
              onAction={() => openModal('fund', { mode: 'create' })}
            />
          ) : (
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
          )}
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

          {usersList.length === 0 ? (
            <EmptyState
              icon="👥"
              title="No User Accounts Configured"
              description="Create accounts for financial secretaries, committee trustees, and auditors with role-based access control."
              actionLabel="+ Add User"
              onAction={() => openModal('user', { mode: 'create' })}
            />
          ) : (
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
          )}
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
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleDownloadBackup}
                disabled={isExportingBackup}
              >
                {isExportingBackup ? '📥 Generating Backup...' : '📥 Download JSON Backup'}
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
                disabled={isRestoringBackup}
              />
              {isRestoringBackup && (
                <p style={{ fontSize: '0.85rem', color: 'var(--primary)', marginTop: '8px' }}>
                  ⏳ Validating schema and restoring database records...
                </p>
              )}
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
                onClick={handleOpenResetModal}
                disabled={isResettingDb}
              >
                {isResettingDb ? '⚠️ Resetting Database...' : '⚠️ Reset Database to Clean State'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Typed Confirmation Modal for Clean Reset */}
      {showResetModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="reset-modal-title">
          <div className="modal-card glass-card" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 id="reset-modal-title" style={{ color: 'var(--danger)' }}>⚠️ Confirm Clean Database Reset</h3>
              <button 
                type="button" 
                className="btn-icon" 
                onClick={() => setShowResetModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div style={{ padding: '16px 0' }}>
              <p style={{ fontSize: '0.9rem', marginBottom: '14px', lineHeight: 1.5 }}>
                This destructive action will <strong>permanently erase all transactions, splits, and sample donors</strong> to prepare for a fresh financial year. Your current administrator account will remain intact.
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                To proceed, please type <strong style={{ color: 'var(--danger)' }}>RESET</strong> in capital letters below:
              </p>
              <input
                type="text"
                value={resetConfirmInput}
                onChange={e => setResetConfirmInput(e.target.value)}
                placeholder="Type RESET to confirm"
                style={{ width: '100%', padding: '10px', fontSize: '1rem', border: '2px solid var(--danger)', borderRadius: 'var(--radius-sm)' }}
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setShowResetModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={resetConfirmInput.trim() !== 'RESET' || isResettingDb}
                onClick={handleExecuteReset}
              >
                {isResettingDb ? 'Resetting...' : 'Permanently Wipe & Reset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Typed Confirmation Modal for Restore */}
      {showRestoreModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="restore-modal-title">
          <div className="modal-card glass-card" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 id="restore-modal-title" style={{ color: 'var(--primary)' }}>♻️ Confirm Database Restore</h3>
              <button 
                type="button" 
                className="btn-icon" 
                onClick={() => { setShowRestoreModal(false); setPendingRestorePayload(null); }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div style={{ padding: '16px 0' }}>
              <p style={{ fontSize: '0.9rem', marginBottom: '14px', lineHeight: 1.5 }}>
                Restoring will overwrite your current active ledger records with the data from the selected backup file.
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                To proceed, please type <strong style={{ color: 'var(--primary)' }}>RESTORE</strong> below:
              </p>
              <input
                type="text"
                value={restoreConfirmInput}
                onChange={e => setRestoreConfirmInput(e.target.value)}
                placeholder="Type RESTORE to confirm"
                style={{ width: '100%', padding: '10px', fontSize: '1rem', border: '2px solid var(--primary)', borderRadius: 'var(--radius-sm)' }}
                autoFocus
              />
            </div>
            <div className="modal-actions">
              <button 
                type="button" 
                className="btn btn-outline" 
                onClick={() => { setShowRestoreModal(false); setPendingRestorePayload(null); }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={restoreConfirmInput.trim() !== 'RESTORE' || isRestoringBackup}
                onClick={handleExecuteRestore}
              >
                {isRestoringBackup ? 'Restoring...' : 'Confirm Restore'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';

export default function FundModal() {
  const { modals, closeModal, fetchAPI, addToast, refreshData } = useApp();

  const [form, setForm] = useState({
    name: '',
    is_restricted: false,
    description: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const fundData = modals.fund;
  if (!fundData) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      addToast('Fund name is required.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await fetchAPI('/api/funds', {
        method: 'POST',
        body: JSON.stringify(form)
      });

      addToast(`Fund "${form.name}" created successfully.`, 'success');
      closeModal('fund');
      setForm({ name: '', is_restricted: false, description: '' });
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="fund-modal-title">
      <div className="modal-card glass-card" style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h3 id="fund-modal-title">💼 Add New Islamic Fund</h3>
          <button type="button" className="btn-icon" onClick={() => closeModal('fund')} aria-label="Close modal">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="fund-name-input">Fund Name *</label>
            <input 
              id="fund-name-input"
              type="text" 
              placeholder="e.g. Youth Activities, Ramadan Iftar, Funeral Services" 
              value={form.name} 
              onChange={e => setForm({ ...form, name: e.target.value })} 
              required 
            />
          </div>

          <div className="form-group checkbox-group-align" style={{ margin: '14px 0' }}>
            <label className="checkbox-label">
              <input 
                type="checkbox" 
                checked={form.is_restricted} 
                onChange={e => setForm({ ...form, is_restricted: e.target.checked })} 
              />
              <span><strong>Restricted Fund</strong> (Donations must strictly be spent on its stated objective)</span>
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="fund-desc-input">Description / Intended Purpose</label>
            <textarea 
              id="fund-desc-input"
              rows="3" 
              placeholder="Describe what these funds are designated for..." 
              value={form.description} 
              onChange={e => setForm({ ...form, description: e.target.value })} 
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={() => closeModal('fund')}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating...' : '💾 Create Fund'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';

export default function UserModal() {
  const { modals, closeModal, fetchAPI, addToast, refreshData } = useApp();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'REVIEWER'
  });
  const [submitting, setSubmitting] = useState(false);

  const userData = modals.user;
  if (!userData) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email.trim() || !form.password) {
      addToast('Email and password are required.', 'error');
      return;
    }

    if (form.password.length < 6) {
      addToast('Password must be at least 6 characters.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await fetchAPI('/api/users', {
        method: 'POST',
        body: JSON.stringify(form)
      });

      addToast(`User account created for ${form.email}.`, 'success');
      closeModal('user');
      setForm({ name: '', email: '', password: '', role: 'REVIEWER' });
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="user-modal-title">
      <div className="modal-card glass-card" style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h3 id="user-modal-title">👥 Add Committee User Account</h3>
          <button type="button" className="btn-icon" onClick={() => closeModal('user')} aria-label="Close modal">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="user-name-input">Full Name</label>
            <input 
              id="user-name-input"
              type="text" 
              placeholder="e.g. Imam Farooq / Br. Bilal" 
              value={form.name} 
              onChange={e => setForm({ ...form, name: e.target.value })} 
            />
          </div>

          <div className="form-group">
            <label htmlFor="user-email-input">Login Email *</label>
            <input 
              id="user-email-input"
              type="email" 
              placeholder="e.g. treasurer@bsmc.org.uk" 
              value={form.email} 
              onChange={e => setForm({ ...form, email: e.target.value })} 
              required 
            />
          </div>

          <div className="form-group">
            <label htmlFor="user-role-input">Assigned System Role *</label>
            <select 
              id="user-role-input"
              value={form.role} 
              onChange={e => setForm({ ...form, role: e.target.value })}
            >
              <option value="REVIEWER">Trustee / Committee Member (Read &amp; Export)</option>
              <option value="AUDITOR">Independent Auditor (Read Only &amp; Audit Logs)</option>
              <option value="ADMIN">Financial Secretary (Full Administrative Access)</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="user-password-input">Temporary Password (Min. 6 chars) *</label>
            <input 
              id="user-password-input"
              type="password" 
              placeholder="••••••••" 
              value={form.password} 
              onChange={e => setForm({ ...form, password: e.target.value })} 
              required 
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={() => closeModal('user')}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating...' : '💾 Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

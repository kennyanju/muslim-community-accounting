'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { validateClientUser } from '@/lib/clientValidation';
import { useModalFocusTrap } from '@/hooks/useModalFocusTrap';

const INITIAL_USER_FORM = {
  name: '',
  email: '',
  password: '',
  role: 'REVIEWER'
};

export default function UserModal() {
  const { modals, closeModal, fetchAPI, addToast, refreshData } = useApp();
  const modalContainerRef = useRef(null);

  const [form, setForm] = useState(INITIAL_USER_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const handleClose = useCallback(() => {
    setErrors({});
    setForm(INITIAL_USER_FORM);
    closeModal('user');
  }, [closeModal]);

  // Focus trapping & accessible keyboard cycling
  useModalFocusTrap(Boolean(modals.user), handleClose, modalContainerRef);

  const userData = modals.user;
  if (!userData) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();

    const { isValid, errors: validationErrors } = validateClientUser(form);
    if (!isValid) {
      setErrors(validationErrors);
      const firstErr = Object.values(validationErrors)[0];
      addToast(firstErr, 'error');
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      await fetchAPI('/api/users', {
        method: 'POST',
        body: JSON.stringify(form)
      });

      addToast(`User account created for ${form.email}.`, 'success');
      handleClose();
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="user-modal-title">
      <div className="modal-card glass-card" ref={modalContainerRef} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h3 id="user-modal-title">👥 Add Committee User Account</h3>
          <button 
            type="button" 
            className="btn-icon" 
            onClick={handleClose} 
            aria-label="Close modal"
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="user-name-input">Full Name *</label>
            <input 
              id="user-name-input"
              name="name"
              type="text" 
              autoComplete="name"
              placeholder="e.g. Imam Farooq / Br. Bilal" 
              value={form.name} 
              onChange={e => {
                setForm({ ...form, name: e.target.value });
                if (errors.name) setErrors(prev => ({ ...prev, name: null }));
              }} 
              required
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="user-email-input">Login Email *</label>
            <input 
              id="user-email-input"
              name="email"
              type="email" 
              autoComplete="email"
              placeholder="e.g. treasurer@bsmc.org.uk" 
              value={form.email} 
              onChange={e => {
                setForm({ ...form, email: e.target.value });
                if (errors.email) setErrors(prev => ({ ...prev, email: null }));
              }} 
              required 
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="user-role-input">Assigned System Role *</label>
            <select 
              id="user-role-input"
              name="role"
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
              name="password"
              type="password" 
              autoComplete="new-password"
              placeholder="••••••••" 
              value={form.password} 
              onChange={e => {
                setForm({ ...form, password: e.target.value });
                if (errors.password) setErrors(prev => ({ ...prev, password: null }));
              }} 
              required 
            />
            {errors.password && <span className="field-error">{errors.password}</span>}
          </div>

          <div className="modal-actions">
            <button 
              type="button" 
              className="btn btn-outline" 
              onClick={handleClose}
              style={{ minHeight: '44px' }}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={submitting}
              style={{ minHeight: '44px' }}
            >
              {submitting ? 'Creating...' : '💾 Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

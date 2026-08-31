'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { validateClientDonor } from '@/lib/clientValidation';
import { useModalFocusTrap } from '@/hooks/useModalFocusTrap';

const INITIAL_DONOR_FORM = {
  name: '',
  email: '',
  address_line_1: '',
  address_line_2: '',
  city: '',
  postcode: '',
  giftAidEligible: false
};

export default function DonorModal() {
  const { modals, closeModal, fetchAPI, addToast, refreshData } = useApp();
  const modalContainerRef = useRef(null);

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState(INITIAL_DONOR_FORM);

  const handleClose = useCallback(() => {
    setErrors({});
    setForm(INITIAL_DONOR_FORM);
    closeModal('donor');
  }, [closeModal]);

  // Focus trapping & accessible keyboard cycling
  useModalFocusTrap(Boolean(modals.donor), handleClose, modalContainerRef);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const { isValid, errors: validationErrors } = validateClientDonor(form);
    if (!isValid) {
      setErrors(validationErrors);
      const firstErr = Object.values(validationErrors)[0];
      addToast(firstErr, 'error');
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      await fetchAPI('/api/donors', {
        method: 'POST',
        body: JSON.stringify(form)
      });

      addToast(`Donor "${form.name}" registered successfully.`, 'success');
      handleClose();
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!modals.donor) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="donor-modal-title">
      <div className="modal-card glass-card" ref={modalContainerRef}>
        <div className="modal-header">
          <h3 id="donor-modal-title">👤 Register New Donor Profile</h3>
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
            <label htmlFor="donor-name">Donor Full Name *</label>
            <input 
              id="donor-name"
              name="name"
              type="text" 
              autoComplete="name"
              placeholder="e.g. Dr. Majid Khan" 
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
            <label htmlFor="donor-email">Email Address (Optional)</label>
            <input 
              id="donor-email"
              name="email"
              type="email" 
              autoComplete="email"
              placeholder="e.g. majid.khan@example.com" 
              value={form.email} 
              onChange={e => {
                setForm({ ...form, email: e.target.value });
                if (errors.email) setErrors(prev => ({ ...prev, email: null }));
              }} 
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="form-divider">UK HMRC Gift Aid Declaration &amp; Address</div>

          <div className="form-group checkbox-group-align" style={{ marginBottom: '14px' }}>
            <label className="checkbox-label">
              <input 
                type="checkbox" 
                name="giftAidEligible"
                checked={form.giftAidEligible} 
                onChange={e => setForm({ ...form, giftAidEligible: e.target.checked })} 
              />
              <span><strong>Signed UK Gift Aid Declaration on file (+25% tax reclaim)</strong></span>
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="donor-addr1">Address Line 1 {form.giftAidEligible ? '*' : '(Optional)'}</label>
            <input 
              id="donor-addr1"
              name="address_line_1"
              type="text" 
              autoComplete="address-line1"
              placeholder="House name / number and street" 
              value={form.address_line_1} 
              onChange={e => {
                setForm({ ...form, address_line_1: e.target.value });
                if (errors.address_line_1) setErrors(prev => ({ ...prev, address_line_1: null }));
              }} 
              required={form.giftAidEligible}
            />
            {errors.address_line_1 && <span className="field-error">{errors.address_line_1}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="donor-addr2">Address Line 2 (Optional)</label>
            <input 
              id="donor-addr2"
              name="address_line_2"
              type="text" 
              autoComplete="address-line2"
              placeholder="Apartment, suite, unit, etc." 
              value={form.address_line_2} 
              onChange={e => setForm({ ...form, address_line_2: e.target.value })} 
            />
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label htmlFor="donor-city">Town / City</label>
              <input 
                id="donor-city"
                name="city"
                type="text" 
                autoComplete="address-level2"
                placeholder="e.g. Bristol" 
                value={form.city} 
                onChange={e => setForm({ ...form, city: e.target.value })} 
              />
            </div>
            <div className="form-group">
              <label htmlFor="donor-postcode">UK Postcode {form.giftAidEligible ? '*' : '(Optional)'}</label>
              <input 
                id="donor-postcode"
                name="postcode"
                type="text" 
                autoComplete="postal-code"
                placeholder="e.g. BS3 1AB" 
                value={form.postcode} 
                onChange={e => {
                  setForm({ ...form, postcode: e.target.value.toUpperCase() });
                  if (errors.postcode) setErrors(prev => ({ ...prev, postcode: null }));
                }} 
                required={form.giftAidEligible}
              />
              {errors.postcode && <span className="field-error">{errors.postcode}</span>}
            </div>
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
              {submitting ? 'Registering...' : '💾 Save Donor Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

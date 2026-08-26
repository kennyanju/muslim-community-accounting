'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { validateClientDonor } from '@/lib/clientValidation';

export default function DonorModal() {
  const { modals, closeModal, fetchAPI, addToast, refreshData } = useApp();

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState({
    name: '',
    email: '',
    address_line_1: '',
    address_line_2: '',
    city: '',
    postcode: '',
    giftAidEligible: false
  });

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
      closeModal('donor');
      setForm({
        name: '',
        email: '',
        address_line_1: '',
        address_line_2: '',
        city: '',
        postcode: '',
        giftAidEligible: false
      });
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
      <div className="modal-card glass-card">
        <div className="modal-header">
          <h3 id="donor-modal-title">👤 Register New Donor Profile</h3>
          <button type="button" className="btn-icon" onClick={() => closeModal('donor')} aria-label="Close modal">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="donor-name">Donor Full Name *</label>
            <input 
              id="donor-name"
              type="text" 
              placeholder="e.g. Dr. Majid Khan" 
              value={form.name} 
              onChange={e => setForm({ ...form, name: e.target.value })} 
              required 
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="donor-email">Email Address (Optional)</label>
            <input 
              id="donor-email"
              type="email" 
              placeholder="e.g. majid.khan@example.com" 
              value={form.email} 
              onChange={e => setForm({ ...form, email: e.target.value })} 
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="form-divider">UK HMRC Gift Aid Declaration &amp; Address</div>

          <div className="form-group checkbox-group-align" style={{ marginBottom: '14px' }}>
            <label className="checkbox-label">
              <input 
                type="checkbox" 
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
              type="text" 
              placeholder="House name / number and street" 
              value={form.address_line_1} 
              onChange={e => setForm({ ...form, address_line_1: e.target.value })} 
              required={form.giftAidEligible}
            />
            {errors.address_line_1 && <span className="field-error">{errors.address_line_1}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="donor-addr2">Address Line 2 (Optional)</label>
            <input 
              id="donor-addr2"
              type="text" 
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
                type="text" 
                placeholder="e.g. Bristol" 
                value={form.city} 
                onChange={e => setForm({ ...form, city: e.target.value })} 
              />
            </div>
            <div className="form-group">
              <label htmlFor="donor-postcode">UK Postcode {form.giftAidEligible ? '*' : '(Optional)'}</label>
              <input 
                id="donor-postcode"
                type="text" 
                placeholder="e.g. BS3 1AB" 
                value={form.postcode} 
                onChange={e => setForm({ ...form, postcode: e.target.value.toUpperCase() })} 
                required={form.giftAidEligible}
              />
              {errors.postcode && <span className="field-error">{errors.postcode}</span>}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={() => closeModal('donor')}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Registering...' : '💾 Save Donor Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

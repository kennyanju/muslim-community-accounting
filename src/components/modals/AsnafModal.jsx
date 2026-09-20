'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { useModalFocusTrap } from '@/hooks/useModalFocusTrap';

const ASNAF_CATEGORIES = [
  { value: 'FUQARA', label: 'Fuqara (The Poor - without basic living means)' },
  { value: 'MASAKEEN', label: 'Masakeen (The Destitute - severe distress)' },
  { value: 'GHARIMEEN', label: 'Gharimeen (Debtors unable to resolve essential debt)' },
  { value: 'IBN_SABIL', label: 'Ibn Sabil (Stranded travellers & wayfarers)' },
  { value: 'AMILINA_ALAYHA', label: 'Amilina Alayha (Appointed Zakat collectors & administrators)' },
  { value: 'MUALLAFAT_QULUB', label: 'Muallafat Qulub (Reconciling hearts & new Muslims)' },
  { value: 'FIR_RIQAB', label: 'Fir-Riqab (Bondage emancipation & relief)' },
  { value: 'FI_SABILILLAH', label: 'Fi-Sabilillah (In the divine pathway & community defence)' }
];

export default function AsnafModal() {
  const { modals, closeModal, fetchAPI, addToast, refreshData } = useApp();
  const modalContainerRef = useRef(null);

  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    beneficiary_name: '',
    asnaf_category: 'FUQARA',
    amount: '',
    distribution_date: new Date().toISOString().split('T')[0],
    witness_name: '',
    verification_notes: ''
  });

  const handleClose = useCallback(() => {
    setForm({
      beneficiary_name: '',
      asnaf_category: 'FUQARA',
      amount: '',
      distribution_date: new Date().toISOString().split('T')[0],
      witness_name: '',
      verification_notes: ''
    });
    closeModal('asnaf');
  }, [closeModal]);

  useModalFocusTrap(Boolean(modals.asnaf), handleClose, modalContainerRef);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.beneficiary_name.trim()) {
      addToast('Beneficiary name or pseudonym is required for audit verification.', 'error');
      return;
    }
    if (!form.amount || parseFloat(form.amount) <= 0) {
      addToast('Valid disbursement amount is required.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await fetchAPI('/api/asnaf', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          transaction_id: modals.asnaf?.transaction_id || 'manual'
        })
      });

      addToast('Asnaf distribution audit record saved.', 'success');
      handleClose();
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!modals.asnaf) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="asnaf-modal-title">
      <div className="modal-card glass-card" ref={modalContainerRef} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h3 id="asnaf-modal-title">📜 Asnaf Zakat Beneficiary Audit Record</h3>
          <button 
            type="button" 
            className="btn-icon" 
            onClick={handleClose} 
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '14px' }}>
            <label htmlFor="asnaf-category">Quranic Asnaf Category *</label>
            <select
              id="asnaf-category"
              value={form.asnaf_category}
              onChange={e => setForm({ ...form, asnaf_category: e.target.value })}
            >
              {ASNAF_CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label htmlFor="asnaf-name">Beneficiary Name / Pseudonym *</label>
              <input
                id="asnaf-name"
                type="text"
                placeholder="e.g. Brother Z.K. or Full Name"
                value={form.beneficiary_name}
                onChange={e => setForm({ ...form, beneficiary_name: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="asnaf-amount">Amount Disbursed (£) *</label>
              <input
                id="asnaf-amount"
                type="number"
                step="0.01"
                placeholder="e.g. 250.00"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label htmlFor="asnaf-date">Distribution Date *</label>
              <input
                id="asnaf-date"
                type="date"
                value={form.distribution_date}
                onChange={e => setForm({ ...form, distribution_date: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="asnaf-witness">Trustee Witness Name</label>
              <input
                id="asnaf-witness"
                type="text"
                placeholder="e.g. Imam Farooq / Trustee Ahmed"
                value={form.witness_name}
                onChange={e => setForm({ ...form, witness_name: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label htmlFor="asnaf-notes">Eligibility Verification &amp; Need Assessment Notes</label>
            <textarea
              id="asnaf-notes"
              rows={3}
              placeholder="e.g. Family of 4 verified with emergency food voucher requirement; rent arrears utility bill sighted."
              value={form.verification_notes}
              onChange={e => setForm({ ...form, verification_notes: e.target.value })}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={handleClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving Audit...' : '💾 Save Asnaf Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

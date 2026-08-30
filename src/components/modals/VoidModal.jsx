'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { validateClientVoid } from '@/lib/clientValidation';

export default function VoidModal() {
  const { modals, closeModal, org, fetchAPI, addToast, refreshData } = useApp();

  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const targetTx = modals.voidTx;
  if (!targetTx) return null;

  const handleConfirmVoid = async (e) => {
    e.preventDefault();

    // Client-side schema validation
    const { isValid, errors: validationErrors } = validateClientVoid({ reason });
    if (!isValid) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      await fetchAPI(`/api/transactions/${targetTx.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() })
      });

      addToast(`Transaction ${targetTx.receipt_number || targetTx.id} marked as voided.`, 'info');
      closeModal('voidTx');
      setReason('');
      setErrors({});
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="void-modal-title">
      <div className="modal-card glass-card" style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h3 id="void-modal-title">🚫 Confirm Transaction Void</h3>
          <button type="button" className="btn-icon" onClick={() => closeModal('voidTx')} aria-label="Close modal">✕</button>
        </div>

        <form onSubmit={handleConfirmVoid} noValidate>
          <div className="void-tx-summary" style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: 'var(--radius-md)', marginBottom: '16px' }}>
            <div><strong>Ref:</strong> {targetTx.reference_note || targetTx.description}</div>
            <div><strong>Date:</strong> {targetTx.transaction_date} &bull; <strong>Amount:</strong> {org.currency_symbol || '£'}{parseFloat(targetTx.total_amount).toFixed(2)}</div>
            <div><strong>Category:</strong> {targetTx.category} &bull; <strong>Donor:</strong> {targetTx.donorName || 'Anonymous'}</div>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Voiding will zero out its balance impact across all fund wallets while preserving the entry in the ledger with your explanation.
          </p>

          <div className="form-group">
            <label htmlFor="void-reason-input">Reason for Voiding *</label>
            <textarea 
              id="void-reason-input"
              rows="3" 
              placeholder="e.g. Duplicate entry from card terminal, donor requested cancellation, incorrect fund entered..." 
              value={reason} 
              onChange={e => {
                setReason(e.target.value);
                if (errors.reason) setErrors(prev => ({ ...prev, reason: null }));
              }} 
              required 
            />
            {errors.reason && <span className="field-error">{errors.reason}</span>}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={() => closeModal('voidTx')} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-danger" disabled={submitting}>
              {submitting ? 'Voiding...' : '🚫 Confirm Permanent Void'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

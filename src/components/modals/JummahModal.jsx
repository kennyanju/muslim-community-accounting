'use client';

import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { validateClientJummah } from '@/lib/clientValidation';
import { useModalFocusTrap } from '@/hooks/useModalFocusTrap';

export default function JummahModal() {
  const { modals, closeModal, balances, org, fetchAPI, addToast, refreshData } = useApp();
  const modalContainerRef = useRef(null);

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState({
    date: new Date().toISOString().substring(0, 10),
    totalAmount: '',
    counter1: '',
    counter2: '',
    notes: '',
    splits: [
      { fund_id: 'fund-lillah', amount: '' },
      { fund_id: 'fund-building', amount: '' }
    ]
  });

  const splitSum = useMemo(() => {
    return form.splits.reduce((acc, s) => acc + (parseFloat(s.amount) || 0), 0);
  }, [form.splits]);

  const totalNum = parseFloat(form.totalAmount) || 0;
  const isSplitTotalMismatch = totalNum > 0 && Math.round(splitSum * 100) !== Math.round(totalNum * 100);

  const handleClose = useCallback(() => {
    setErrors({});
    closeModal('jummah');
  }, [closeModal]);

  // Focus trapping & accessible keyboard cycling
  useModalFocusTrap(Boolean(modals.jummah), handleClose, modalContainerRef);

  const handleAddSplit = () => {
    const defaultFund = balances.find(b => !b.isArchived)?.fundId || 'fund-lillah';
    setForm(prev => ({
      ...prev,
      splits: [...prev.splits, { fund_id: defaultFund, amount: '' }]
    }));
    if (errors.splits) setErrors(prev => ({ ...prev, splits: null }));
  };

  const handleRemoveSplit = (index) => {
    if (form.splits.length <= 1) return;
    setForm(prev => ({
      ...prev,
      splits: prev.splits.filter((_, idx) => idx !== index)
    }));
    if (errors.splits) setErrors(prev => ({ ...prev, splits: null }));
  };

  const handleSplitChange = (index, field, value) => {
    setForm(prev => {
      const updated = [...prev.splits];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, splits: updated };
    });
    if (errors.splits) setErrors(prev => ({ ...prev, splits: null }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Client-side schema validation
    const { isValid, errors: validationErrors } = validateClientJummah(form);
    if (!isValid) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const auditNote = `Jummah Cash Collection counted by: ${form.counter1.trim()} & ${form.counter2.trim()}.${form.notes ? ' Notes: ' + form.notes.trim() : ''}`;

      await fetchAPI('/api/transactions', {
        method: 'POST',
        body: JSON.stringify({
          type: 'INCOME',
          status: 'PENDING', // Cash on Hand
          method: 'CASH',
          totalAmount: totalNum,
          date: form.date,
          donorId: 'anonymous',
          reference_note: `Jummah Cash Collection (${form.date})`,
          category: 'Donation',
          splits: form.splits.map(s => ({ fund_id: s.fund_id, amount: parseFloat(s.amount) || 0 })),
          notes: auditNote
        })
      });

      addToast("Jummah Friday collection logged successfully.", "success");
      closeModal('jummah');
      refreshData();
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!modals.jummah) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="jummah-modal-title">
      <div className="modal-card glass-card" ref={modalContainerRef}>
        <div className="modal-header">
          <h3 id="jummah-modal-title">🕌 Log Friday (Jummah) Cash Collection</h3>
          <button type="button" className="btn-icon" onClick={handleClose} aria-label="Close modal">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <p className="info-p" style={{ marginBottom: '16px' }}>
            Enter the verified cash bucket counts from Friday prayers. Both independent witness signatures are recorded in the immutable audit log.
          </p>

          <div className="form-row-2">
            <div className="form-group">
              <label htmlFor="jummah-amount">Total Cash Counted ({org.currency_symbol || '£'}) *</label>
              <input 
                id="jummah-amount"
                type="number" 
                min="0.01" 
                step="0.01" 
                placeholder="0.00" 
                value={form.totalAmount} 
                onChange={e => {
                  setForm({ ...form, totalAmount: e.target.value });
                  if (errors.totalAmount) setErrors(prev => ({ ...prev, totalAmount: null }));
                }} 
                required 
              />
              {errors.totalAmount && <span className="field-error">{errors.totalAmount}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="jummah-date">Collection Date *</label>
              <input 
                id="jummah-date"
                type="date" 
                value={form.date} 
                onChange={e => {
                  setForm({ ...form, date: e.target.value });
                  if (errors.date) setErrors(prev => ({ ...prev, date: null }));
                }} 
                required 
              />
              {errors.date && <span className="field-error">{errors.date}</span>}
            </div>
          </div>

          <div className="form-divider">Dual Witness Cash Audit (Governance Requirement)</div>

          <div className="form-row-2">
            <div className="form-group">
              <label htmlFor="jummah-counter-1">Counter 1 Full Name *</label>
              <input 
                id="jummah-counter-1"
                type="text" 
                placeholder="e.g. Br. Tariq Mahmood" 
                value={form.counter1} 
                onChange={e => {
                  setForm({ ...form, counter1: e.target.value });
                  if (errors.counter1) setErrors(prev => ({ ...prev, counter1: null }));
                }} 
                required 
              />
              {errors.counter1 && <span className="field-error">{errors.counter1}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="jummah-counter-2">Counter 2 Full Name *</label>
              <input 
                id="jummah-counter-2"
                type="text" 
                placeholder="e.g. Br. Usman Ali" 
                value={form.counter2} 
                onChange={e => {
                  setForm({ ...form, counter2: e.target.value });
                  if (errors.counter2) setErrors(prev => ({ ...prev, counter2: null }));
                }} 
                required 
              />
              {errors.counter2 && <span className="field-error">{errors.counter2}</span>}
            </div>
          </div>

          <div className="form-divider">
            Fund Segregation Breakdown
            <span className={`split-counter-badge ${isSplitTotalMismatch ? 'badge-mismatch' : 'badge-match'}`}>
              Allocated: {org.currency_symbol || '£'}{splitSum.toFixed(2)} / {org.currency_symbol || '£'}{totalNum.toFixed(2)}
            </span>
          </div>

          {errors.splits && <div className="field-error" style={{ marginBottom: '10px' }}>{errors.splits}</div>}

          <div className="splits-container">
            {form.splits.map((split, idx) => (
              <div key={idx} className="split-row">
                <div className="split-fund-select">
                  <label htmlFor={`jummah-split-fund-${idx}`} className="sr-only">Fund</label>
                  <select 
                    id={`jummah-split-fund-${idx}`}
                    value={split.fund_id} 
                    onChange={e => handleSplitChange(idx, 'fund_id', e.target.value)}
                  >
                    {balances.filter(b => !b.isArchived).map(b => (
                      <option key={b.fundId} value={b.fundId}>
                        {b.fundName} ({b.isRestricted ? 'Restricted' : 'Unrestricted'})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="split-amount-input">
                  <label htmlFor={`jummah-split-amt-${idx}`} className="sr-only">Amount</label>
                  <input 
                    id={`jummah-split-amt-${idx}`}
                    type="number" 
                    step="0.01" 
                    placeholder="0.00" 
                    value={split.amount} 
                    onChange={e => handleSplitChange(idx, 'amount', e.target.value)} 
                    required 
                  />
                </div>
                {form.splits.length > 1 && (
                  <button 
                    type="button" 
                    className="btn-icon btn-danger-icon" 
                    onClick={() => handleRemoveSplit(idx)}
                    title="Remove split"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn-link" onClick={handleAddSplit}>+ Add Another Fund Split</button>
          </div>

          <div className="form-group" style={{ marginTop: '12px' }}>
            <label htmlFor="jummah-notes">Additional Collection Notes (Optional)</label>
            <textarea 
              id="jummah-notes"
              rows="2" 
              placeholder="e.g. Special appeal for winter heating fund..." 
              value={form.notes} 
              onChange={e => setForm({ ...form, notes: e.target.value })} 
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={() => closeModal('jummah')} disabled={submitting}>
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={submitting || (totalNum > 0 && isSplitTotalMismatch)}
            >
              {submitting ? 'Recording...' : '💾 Log Jummah Collection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

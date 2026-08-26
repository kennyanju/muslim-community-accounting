'use client';

import React, { useState, useMemo } from 'react';
import { useApp } from '@/context/AppContext';

const INCOME_CATEGORIES = ["Donation", "Zakat", "Fitrana", "Madrasah Fees", "Event Tickets", "Interest", "Other"];
const EXPENSE_CATEGORIES = ["Utilities", "Salaries", "Maintenance", "Charitable Payout", "Office Supplies", "Travel", "Other"];

export default function TransactionModal() {
  const { modals, closeModal, balances, donors, org, fetchAPI, addToast, refreshData } = useApp();

  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    type: 'income',
    totalAmount: '',
    date: new Date().toISOString().substring(0, 10),
    donorId: 'anonymous',
    method: 'CASH',
    category: 'Donation',
    reference_note: '',
    notes: '',
    giftAid: false,
    splits: [{ fund_id: balances.find(b => !b.isArchived)?.fundId || 'fund-lillah', amount: '' }]
  });

  const isRestrictedExpenseViolation = useMemo(() => {
    if (form.type !== 'expense') return false;
    
    return form.splits.some(s => {
      const fund = balances.find(b => b.fundId === s.fund_id);
      if (fund && fund.isRestricted && (fund.fundName === 'Zakat' || fund.fundName === 'Fitrana')) {
        return form.category !== 'Charitable Payout' || !form.notes || !form.notes.trim();
      }
      return false;
    });
  }, [form.type, form.splits, form.category, form.notes, balances]);

  const splitSum = useMemo(() => {
    return form.splits.reduce((acc, s) => acc + (parseFloat(s.amount) || 0), 0);
  }, [form.splits]);

  const totalNum = parseFloat(form.totalAmount) || 0;
  const isSplitTotalMismatch = Math.round(splitSum * 100) !== Math.round(totalNum * 100);

  const handleTypeChange = (type) => {
    setForm(prev => ({
      ...prev,
      type,
      category: type === 'income' ? 'Donation' : 'Utilities',
      giftAid: type === 'income' ? prev.giftAid : false
    }));
  };

  const handleAddSplit = () => {
    const defaultFund = balances.find(b => !b.isArchived)?.fundId || 'fund-lillah';
    setForm(prev => ({
      ...prev,
      splits: [...prev.splits, { fund_id: defaultFund, amount: '' }]
    }));
  };

  const handleRemoveSplit = (index) => {
    if (form.splits.length <= 1) return;
    setForm(prev => ({
      ...prev,
      splits: prev.splits.filter((_, idx) => idx !== index)
    }));
  };

  const handleSplitChange = (index, field, value) => {
    setForm(prev => {
      const updated = [...prev.splits];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, splits: updated };
    });
  };

  const handleDonorSelect = (donorId) => {
    if (donorId === 'anonymous') {
      setForm(prev => ({ ...prev, donorId, giftAid: false }));
    } else {
      const d = donors.find(donor => donor.id === donorId);
      setForm(prev => ({
        ...prev,
        donorId,
        giftAid: d ? !!d.gift_aid_eligible : false
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isRestrictedExpenseViolation) {
      addToast("Compliance Violation: Zakat and Fitrana funds can only be disbursed under 'Charitable Payout' with Asnaf notes.", "error");
      return;
    }

    if (isSplitTotalMismatch) {
      addToast(`Fund allocations (£${splitSum.toFixed(2)}) must exactly equal total amount (£${totalNum.toFixed(2)}).`, "error");
      return;
    }

    setSubmitting(true);
    try {
      await fetchAPI('/api/transactions', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          type: form.type.toUpperCase(),
          totalAmount: totalNum,
          splits: form.splits.map(s => ({ fund_id: s.fund_id, amount: parseFloat(s.amount) || 0 }))
        })
      });

      addToast("Transaction recorded successfully.", "success");
      closeModal('transaction');
      refreshData();
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!modals.transaction) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="tx-modal-title">
      <div className="modal-card glass-card">
        <div className="modal-header">
          <h3 id="tx-modal-title">Record Financial Transaction</h3>
          <button type="button" className="btn-icon" onClick={() => closeModal('transaction')} aria-label="Close modal">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-type-selector">
            <button 
              type="button" 
              className={`type-toggle-btn ${form.type === 'income' ? 'active-income' : ''}`}
              onClick={() => handleTypeChange('income')}
            >
              📥 Income (Donation / Fees)
            </button>
            <button 
              type="button" 
              className={`type-toggle-btn ${form.type === 'expense' ? 'active-expense' : ''}`}
              onClick={() => handleTypeChange('expense')}
            >
              📤 Expense (Payout / Bills)
            </button>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label htmlFor="tx-amount">Total Amount ({org.currency_symbol || '£'}) *</label>
              <input 
                id="tx-amount"
                type="number" 
                min="0.01" 
                step="0.01" 
                placeholder="0.00" 
                value={form.totalAmount} 
                onChange={e => setForm({ ...form, totalAmount: e.target.value })} 
                required 
              />
            </div>
            <div className="form-group">
              <label htmlFor="tx-date">Transaction Date *</label>
              <input 
                id="tx-date"
                type="date" 
                value={form.date} 
                onChange={e => setForm({ ...form, date: e.target.value })} 
                required 
              />
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label htmlFor="tx-category">Category *</label>
              <select 
                id="tx-category"
                value={form.category} 
                onChange={e => setForm({ ...form, category: e.target.value })}
              >
                {(form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="tx-method">Payment Method</label>
              <select 
                id="tx-method"
                value={form.method} 
                onChange={e => setForm({ ...form, method: e.target.value })}
              >
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CARD">Card / POS</option>
                <option value="CHEQUE">Cheque</option>
                <option value="DIRECT_DEBIT">Standing Order / Direct Debit</option>
              </select>
            </div>
          </div>

          {form.type === 'income' && (
            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="tx-donor">Donor Profile</label>
                <select 
                  id="tx-donor"
                  value={form.donorId} 
                  onChange={e => handleDonorSelect(e.target.value)}
                >
                  <option value="anonymous">Anonymous Cash Donor</option>
                  {donors.filter(d => !d.is_anonymous).map(d => (
                    <option key={d.id} value={d.id}>{d.name} {d.gift_aid_eligible ? '(Gift Aid Eligible)' : ''}</option>
                  ))}
                </select>
              </div>
              <div className="form-group checkbox-group-align">
                <label className="checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={form.giftAid} 
                    onChange={e => setForm({ ...form, giftAid: e.target.checked })}
                    disabled={form.donorId === 'anonymous'}
                  />
                  <span>Claim UK HMRC Gift Aid (+25%)</span>
                </label>
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="tx-ref">Reference / Description</label>
            <input 
              id="tx-ref"
              type="text" 
              placeholder="e.g. Ramadan Iftar Sponsorship, Gas Utility Bill" 
              value={form.reference_note} 
              onChange={e => setForm({ ...form, reference_note: e.target.value })} 
            />
          </div>

          <div className="form-divider">
            Fund Segregation &amp; Split Allocation
            <span className={`split-counter-badge ${isSplitTotalMismatch ? 'badge-mismatch' : 'badge-match'}`}>
              Allocated: {org.currency_symbol || '£'}{splitSum.toFixed(2)} / {org.currency_symbol || '£'}{totalNum.toFixed(2)}
            </span>
          </div>

          <div className="splits-container">
            {form.splits.map((split, idx) => (
              <div key={idx} className="split-row">
                <div className="split-fund-select">
                  <label htmlFor={`split-fund-${idx}`} className="sr-only">Fund</label>
                  <select 
                    id={`split-fund-${idx}`}
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
                  <label htmlFor={`split-amt-${idx}`} className="sr-only">Amount</label>
                  <input 
                    id={`split-amt-${idx}`}
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

          {isRestrictedExpenseViolation && (
            <div className="compliance-warning-box">
              ⚠️ <strong>Strict Shariah Restriction:</strong> Zakat and Fitrana restricted funds can ONLY be disbursed under category <em>'Charitable Payout'</em> to eligible Asnaf beneficiaries with detailed audit notes.
            </div>
          )}

          <div className="form-group" style={{ marginTop: '12px' }}>
            <label htmlFor="tx-notes">
              Audit Notes {form.type === 'expense' && form.splits.some(s => s.fund_id === 'fund-zakat' || s.fund_id === 'fund-fitrana') ? '(Mandatory Asnaf Beneficiary Details) *' : '(Optional)'}
            </label>
            <textarea 
              id="tx-notes"
              rows="2" 
              placeholder="Enter auditor notes, invoice reference, or beneficiary justification..." 
              value={form.notes} 
              onChange={e => setForm({ ...form, notes: e.target.value })} 
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={() => closeModal('transaction')}>
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={submitting || isRestrictedExpenseViolation || (totalNum > 0 && isSplitTotalMismatch)}
            >
              {submitting ? 'Recording...' : '💾 Save Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

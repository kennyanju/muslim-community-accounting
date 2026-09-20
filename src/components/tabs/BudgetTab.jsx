'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { formatCurrency } from '@/utils/formatters';

export default function BudgetTab() {
  const { funds, balances, org, user, fetchAPI, addToast } = useApp();

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);

  // Zakat Nisab Calculator state
  const [goldPricePerGram, setGoldPricePerGram] = useState(65.50);
  const [silverPricePerGram, setSilverPricePerGram] = useState(0.82);

  // Edit budget modal state
  const [editingBudget, setEditingBudget] = useState(null);
  const [formTarget, setFormTarget] = useState('');
  const [formLimit, setFormLimit] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const goldNisab = useMemo(() => 87.48 * (parseFloat(goldPricePerGram) || 0), [goldPricePerGram]);
  const silverNisab = useMemo(() => 612.36 * (parseFloat(silverPricePerGram) || 0), [silverPricePerGram]);

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let active = true;
    fetchAPI(`/api/budgets?year=${selectedYear}`)
      .then(data => {
        if (active) {
          setBudgets(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch(err => {
        if (active) {
          addToast(err.message, 'error');
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedYear, refreshTrigger, fetchAPI, addToast]);

  const budgetMap = useMemo(() => {
    const map = {};
    budgets.forEach(b => {
      map[b.fund_id] = b;
    });
    return map;
  }, [budgets]);

  const handleOpenEdit = (fund) => {
    const existing = budgetMap[fund.id] || {};
    setEditingBudget(fund);
    setFormTarget(existing.target_amount !== undefined ? String(existing.target_amount) : '');
    setFormLimit(existing.max_spend_limit !== undefined && existing.max_spend_limit !== null ? String(existing.max_spend_limit) : '');
    setFormNotes(existing.notes || '');
  };

  const handleSaveBudget = async (e) => {
    e.preventDefault();
    if (!editingBudget) return;

    setSaving(true);
    try {
      await fetchAPI('/api/budgets', {
        method: 'POST',
        body: JSON.stringify({
          fund_id: editingBudget.id,
          fiscal_year: selectedYear,
          target_amount: parseFloat(formTarget) || 0,
          max_spend_limit: formLimit ? parseFloat(formLimit) : null,
          notes: formNotes
        })
      });

      addToast(`Budget for ${editingBudget.name} updated successfully.`, 'success');
      setEditingBudget(null);
      setLoading(true);
      setRefreshTrigger(n => n + 1);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="content-view active-view" aria-label="Budget and Nisab Planning">
      <div className="view-header">
        <div>
          <h2 className="view-title">🕌 Islamic Financial Planning &amp; Budgets</h2>
          <p className="view-subtitle">Annual fund target allocations, spending limits, and Zakat Nisab evaluation</p>
        </div>
        <div className="view-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label htmlFor="budget-year" style={{ fontSize: '13px', fontWeight: 600 }}>Fiscal Year:</label>
          <select 
            id="budget-year"
            value={selectedYear} 
            onChange={e => {
              setLoading(true);
              setSelectedYear(parseInt(e.target.value, 10));
            }}
            style={{ padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
          >
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Zakat Nisab Calculator Banner */}
      <div className="glass-card" style={{ padding: '20px', marginBottom: '24px', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(6, 78, 59, 0.12) 100%)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚖️</span> Zakat Nisab Threshold Reference
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Standard Islamic Nisab values based on 87.48g Gold and 612.36g Silver benchmark rates.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ background: 'var(--bg-secondary)', padding: '10px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>Silver Rate (£/g)</span>
              <input
                type="number"
                step="0.01"
                value={silverPricePerGram}
                onChange={e => setSilverPricePerGram(e.target.value)}
                style={{ width: '80px', padding: '4px', marginTop: '4px', fontSize: '13px' }}
              />
              <div style={{ fontSize: '12px', fontWeight: 'bold', marginTop: '4px', color: 'var(--primary)' }}>
                Nisab: {formatCurrency(silverNisab, org.currency_symbol)}
              </div>
            </div>

            <div style={{ background: 'var(--bg-secondary)', padding: '10px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>Gold Rate (£/g)</span>
              <input
                type="number"
                step="0.1"
                value={goldPricePerGram}
                onChange={e => setGoldPricePerGram(e.target.value)}
                style={{ width: '80px', padding: '4px', marginTop: '4px', fontSize: '13px' }}
              />
              <div style={{ fontSize: '12px', fontWeight: 'bold', marginTop: '4px', color: 'var(--primary)' }}>
                Nisab: {formatCurrency(goldNisab, org.currency_symbol)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fund Budgets Grid */}
      <h3 style={{ fontSize: '1.1rem', marginBottom: '16px' }}>Annual Fund Allocations &amp; Targets ({selectedYear})</h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        {funds.map(fund => {
          const budget = budgetMap[fund.id];
          const fundBal = balances.find(b => b.fundId === fund.id);
          const currentBalance = fundBal ? fundBal.balance : 0;
          const target = budget ? budget.target_amount : 0;
          const limit = budget ? budget.max_spend_limit : null;

          const progressPercent = target > 0 ? Math.min(100, Math.max(0, Math.round((currentBalance / target) * 100))) : 0;
          const isOverLimit = limit !== null && limit > 0 && Math.abs(currentBalance) > limit;

          return (
            <div key={fund.id} className="glass-card" style={{ padding: '20px', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {fund.name}
                    {fund.is_restricted ? (
                      <span className="badge-restricted" style={{ fontSize: '10px' }}>Shariah Restricted</span>
                    ) : (
                      <span className="badge-unrestricted" style={{ fontSize: '10px' }}>Unrestricted</span>
                    )}
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {fund.description || 'General Fund'}
                  </p>
                </div>
                {user?.role === 'ADMIN' && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => handleOpenEdit(fund)}
                    style={{ minHeight: '32px', padding: '4px 10px', fontSize: '12px' }}
                  >
                    ⚙️ Set Budget
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>Current Balance</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: currentBalance >= 0 ? 'var(--text-primary)' : 'var(--danger)' }}>
                    {formatCurrency(currentBalance, org.currency_symbol)}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>Annual Target</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--primary)' }}>
                    {target > 0 ? formatCurrency(target, org.currency_symbol) : 'Not Set'}
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  <span>Progress to Target</span>
                  <span>{target > 0 ? `${progressPercent}%` : 'No Target'}</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: 'var(--bg-primary)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      width: `${progressPercent}%`, 
                      height: '100%', 
                      background: isOverLimit ? 'var(--danger)' : 'var(--primary)', 
                      borderRadius: '4px',
                      transition: 'width 0.4s ease'
                    }} 
                  />
                </div>
              </div>

              {limit !== null && limit > 0 && (
                <div style={{ fontSize: '12px', padding: '6px 10px', borderRadius: 'var(--radius-sm)', background: isOverLimit ? 'var(--danger-light)' : 'var(--bg-subtle)', color: isOverLimit ? 'var(--danger)' : 'var(--text-secondary)' }}>
                  {isOverLimit ? '⚠️ Over Maximum Spend Limit: ' : 'Spend Cap: '}
                  <strong>{formatCurrency(limit, org.currency_symbol)}</strong>
                </div>
              )}

              {budget?.notes && (
                <div style={{ fontSize: '12px', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                  &ldquo;{budget.notes}&rdquo;
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit Budget Modal */}
      {editingBudget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-budget-title">
          <div className="modal-card glass-card" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3 id="edit-budget-title">Set Annual Budget for {editingBudget.name}</h3>
              <button 
                type="button" 
                className="btn-icon" 
                onClick={() => setEditingBudget(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBudget}>
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label htmlFor="target-amount">Annual Target Amount ({org.currency_symbol}) *</label>
                <input
                  id="target-amount"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 15000"
                  value={formTarget}
                  onChange={e => setFormTarget(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label htmlFor="spend-limit">Maximum Spend Cap ({org.currency_symbol}) (Optional)</label>
                <input
                  id="spend-limit"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 20000 (leave blank if unrestricted)"
                  value={formLimit}
                  onChange={e => setFormLimit(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label htmlFor="budget-notes">Governance &amp; Shariah Notes</label>
                <textarea
                  id="budget-notes"
                  rows={2}
                  placeholder="e.g. Approved at 2026 Trustee AGM for community outreach"
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setEditingBudget(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : '💾 Save Allocation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

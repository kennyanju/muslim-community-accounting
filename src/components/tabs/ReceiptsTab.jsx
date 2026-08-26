'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';

export default function ReceiptsTab({ preloadedTx }) {
  const { donors, org } = useApp();

  const [receiptDoc, setReceiptDoc] = useState({
    number: `${(org?.short_name || 'BSMC').replace(/[^a-zA-Z0-9]/g, '')}-${new Date().getFullYear()}-0001`,
    date: new Date().toISOString().substring(0, 10),
    type: 'receipt',
    donorId: '',
    from: `${org?.name || 'Bristol South Muslim Community'}\n${org?.address || '100 Mosque Road, Bristol, BS3 1AB'}\nCharity No: ${org?.charity_number || '1234567'}\nEmail: ${org?.email || 'finance@bsmc.org.uk'}`,
    to: '',
    giftAid: false,
    items: [
      { desc: 'General Mosque Lillah & Maintenance Contribution', qty: 1, amount: 100.00 }
    ]
  });

  useEffect(() => {
    if (preloadedTx) {
      const donor = donors.find(d => d.id === preloadedTx.donor_id);
      const donorAddr = donor ? [donor.address_line_1, donor.address_line_2, donor.city, donor.postcode].filter(Boolean).join(', ') : 'Anonymous';
      const formattedNum = preloadedTx.receipt_number || `${(org?.short_name || 'BSMC').replace(/[^a-zA-Z0-9]/g, '')}-${preloadedTx.id.substring(0, 8)}`;

      setReceiptDoc(prev => ({
        ...prev,
        number: formattedNum,
        date: preloadedTx.transaction_date,
        donorId: preloadedTx.donor_id,
        to: `${donor ? donor.name : 'Anonymous Donor'}\n${donorAddr}`,
        giftAid: preloadedTx.giftAid,
        items: [{
          desc: `${preloadedTx.category || 'Donation'} - ${preloadedTx.reference_note || preloadedTx.description || 'Contribution'}`,
          qty: 1,
          amount: parseFloat(preloadedTx.total_amount) || 0
        }]
      }));
    }
  }, [preloadedTx, donors, org]);

  const handleDonorSelect = (donorId) => {
    const d = donors.find(donor => donor.id === donorId);
    if (d) {
      const addr = [d.address_line_1, d.address_line_2, d.city, d.postcode].filter(Boolean).join(', ');
      setReceiptDoc(prev => ({
        ...prev,
        donorId,
        to: `${d.name}\n${addr}`,
        giftAid: d.gift_aid_eligible
      }));
    } else {
      setReceiptDoc(prev => ({ ...prev, donorId: '', to: '', giftAid: false }));
    }
  };

  const updateReceipt = (fields) => {
    setReceiptDoc(prev => ({ ...prev, ...fields }));
  };

  return (
    <section className="content-view active-view" aria-label="Receipt Generator">
      <div className="view-header">
        <div>
          <h2 className="view-title">Official Receipt &amp; Invoice Generator</h2>
          <p className="view-subtitle">Generate branded donation receipts and vendor payment documentation</p>
        </div>
      </div>

      <div className="invoice-workspace">
        <div className="invoice-form-panel glass-card">
          <h3>Document Customizer</h3>
          <form onSubmit={e => e.preventDefault()}>
            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="receipt-ref">Document Ref No.</label>
                <input 
                  id="receipt-ref"
                  type="text" 
                  value={receiptDoc.number} 
                  onChange={e => updateReceipt({ number: e.target.value })} 
                />
              </div>
              <div className="form-group">
                <label htmlFor="receipt-type">Document Type</label>
                <select 
                  id="receipt-type"
                  value={receiptDoc.type} 
                  onChange={e => updateReceipt({ type: e.target.value })}
                >
                  <option value="receipt">Official Donation Receipt</option>
                  <option value="invoice">Standard Invoice</option>
                </select>
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="receipt-date">Issue Date</label>
                <input 
                  id="receipt-date"
                  type="date" 
                  value={receiptDoc.date} 
                  onChange={e => updateReceipt({ date: e.target.value })} 
                />
              </div>
              <div className="form-group">
                <label htmlFor="receipt-donor-load">Load Donor Profile</label>
                <select 
                  id="receipt-donor-load"
                  value={receiptDoc.donorId} 
                  onChange={e => handleDonorSelect(e.target.value)}
                >
                  <option value="">Select Donor...</option>
                  {donors.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-divider">Issuer Details (From Mosque Profile)</div>
            <div className="form-group">
              <textarea 
                rows="3" 
                value={receiptDoc.from} 
                onChange={e => updateReceipt({ from: e.target.value })}
                aria-label="Issuer Details"
              />
            </div>

            <div className="form-divider">Recipient Details</div>
            <div className="form-group">
              <textarea 
                rows="3" 
                placeholder="Enter recipient full name and address" 
                value={receiptDoc.to} 
                onChange={e => updateReceipt({ to: e.target.value })}
                aria-label="Recipient Details"
              />
            </div>

            <div className="form-divider">Itemised Value</div>
            <div className="invoice-item-row">
              <div className="col-desc">
                <label htmlFor="receipt-item-desc" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Description</label>
                <input 
                  id="receipt-item-desc"
                  type="text" 
                  value={receiptDoc.items[0]?.desc || ''} 
                  onChange={e => {
                    const updated = [...receiptDoc.items];
                    updated[0].desc = e.target.value;
                    updateReceipt({ items: updated });
                  }} 
                />
              </div>
              <div className="col-rate">
                <label htmlFor="receipt-item-amount" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  Amount ({org.currency_symbol || '£'})
                </label>
                <input 
                  id="receipt-item-amount"
                  type="number" 
                  min="0" 
                  step="0.01" 
                  value={receiptDoc.items[0]?.amount || 0} 
                  onChange={e => {
                    const updated = [...receiptDoc.items];
                    updated[0].amount = parseFloat(e.target.value) || 0;
                    updateReceipt({ items: updated });
                  }} 
                />
              </div>
            </div>
          </form>
        </div>

        <div className="invoice-preview-panel glass-card">
          <div className="preview-actions">
            <h4>Document Preview</h4>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>
              <span aria-hidden="true">🖨️</span> Print / Save PDF
            </button>
          </div>

          <div className="invoice-paper">
            <div className="invoice-paper-header">
              <div className="invoice-brand">
                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px', borderRadius: '8px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                    <path d="M12 3L3 8.5L12 14L21 8.5L12 3Z" fill="white" />
                    <path d="M3 13.5L12 19L21 13.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <h3 className="brand-title">{org.name}</h3>
                  <p className="brand-tagline">Charity Reg No: {org.charity_number}</p>
                </div>
              </div>
              <div className="invoice-title-block">
                <h3 className="invoice-main-title">{receiptDoc.type === 'receipt' ? 'DONATION RECEIPT' : 'INVOICE'}</h3>
                <div className="invoice-meta-item">Ref No: <strong>{receiptDoc.number}</strong></div>
                <div className="invoice-meta-item">Date: <strong>{receiptDoc.date}</strong></div>
              </div>
            </div>

            <hr className="invoice-hr" />

            <div className="invoice-billing-addresses">
              <div className="billing-col">
                <span className="billing-header">ISSUER:</span>
                <pre className="billing-pre">{receiptDoc.from}</pre>
              </div>
              <div className="billing-col">
                <span className="billing-header">DONOR / RECIPIENT:</span>
                <pre className="billing-pre">{receiptDoc.to || 'Anonymous Donor'}</pre>
              </div>
            </div>

            <table className="invoice-preview-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="col-qty text-right">Qty</th>
                  <th className="col-rate text-right">Amount</th>
                  <th className="col-total text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {receiptDoc.items.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.desc}</td>
                    <td className="text-right">{item.qty}</td>
                    <td className="text-right">{org.currency_symbol || '£'}{item.amount.toFixed(2)}</td>
                    <td className="text-right">{org.currency_symbol || '£'}{(item.qty * item.amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="invoice-totals-section">
              <div className="totals-block">
                <div className="total-row">
                  <span>Total Amount:</span>
                  <span>{org.currency_symbol || '£'}{(receiptDoc.items[0]?.qty * receiptDoc.items[0]?.amount || 0).toFixed(2)}</span>
                </div>
                {receiptDoc.giftAid && (
                  <div className="total-row" style={{ color: '#10b981' }}>
                    <span>Gift Aid Claimable (25%):</span>
                    <span>{org.currency_symbol || '£'}{(receiptDoc.items[0]?.qty * receiptDoc.items[0]?.amount * 0.25 || 0).toFixed(2)}</span>
                  </div>
                )}
                <hr className="totals-hr" />
                <div className="total-row grand-total-row">
                  <span>Total Received:</span>
                  <span>{org.currency_symbol || '£'}{(receiptDoc.items[0]?.qty * receiptDoc.items[0]?.amount || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="invoice-footer-notes">
              <p>Jazakum Allahu Khairan. May Allah bless and reward your contribution to {org.name}.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

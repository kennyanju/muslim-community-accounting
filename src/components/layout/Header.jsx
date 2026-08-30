'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';

export default function Header({ onOpenMobileMenu }) {
  const { activeTab, user, theme, handleThemeChange, openModal } = useApp();

  const getTitle = () => {
    switch (activeTab) {
      case 'dashboard': return 'Financial Overview & Fund Balances';
      case 'transactions': return 'Transaction Ledger & Fund Allocations';
      case 'donors': return 'Donor Directory & Gift Aid Registry';
      case 'reports': return 'Financial Statements & HMRC Gift Aid Export';
      case 'receipts': return 'Official Donation Receipt Generator';
      case 'settings': return 'Mosque Organisation & System Settings';
      default: return 'Financial Management';
    }
  };

  return (
    <header className="main-header" aria-label="Page Header">
      <div className="header-left">
        <button 
          type="button" 
          className="mobile-menu-btn" 
          onClick={onOpenMobileMenu}
          aria-label="Open Navigation Menu"
          id="btn-mobile-menu"
          style={{ minHeight: '44px', minWidth: '44px' }}
        >
          <span aria-hidden="true">☰</span> Menu
        </button>

        <div>
          <h1 className="header-title">{getTitle()}</h1>
          <p className="header-subtitle">
            {activeTab === 'dashboard' && 'Live segregated accounting & Shariah compliance monitor'}
            {activeTab === 'transactions' && 'Search, filter, allocate splits, and reconcile journal entries'}
            {activeTab === 'donors' && 'Manage donor declarations and UK Gift Aid address eligibility'}
            {activeTab === 'reports' && 'Generate UK Charity Commission reports & HMRC Gift Aid schedules'}
            {activeTab === 'receipts' && 'Generate and print official tax-exempt donation receipts'}
            {activeTab === 'settings' && 'Configure mosque details, segregated funds, and role-based access'}
          </p>
        </div>
      </div>

      <div className="header-actions">
        {user?.role === 'ADMIN' && (
          <>
            <button 
              type="button" 
              className="btn btn-primary"
              onClick={() => openModal('transaction')}
              id="btn-new-transaction"
              style={{ minHeight: '44px' }}
            >
              <span aria-hidden="true">+</span> <span>Record Transaction</span>
            </button>

            <button 
              type="button" 
              className="btn btn-secondary"
              onClick={() => openModal('jummah')}
              id="btn-log-jummah"
              style={{ minHeight: '44px' }}
            >
              <span aria-hidden="true">🕌</span> <span>Jummah Collection</span>
            </button>

            <button 
              type="button" 
              className="btn btn-outline"
              onClick={() => openModal('donor')}
              id="btn-new-donor"
              style={{ minHeight: '44px' }}
            >
              <span aria-hidden="true">👤</span> <span>New Donor</span>
            </button>
          </>
        )}

        <div className="theme-toggle" title="Select theme mode">
          <label htmlFor="theme-select" className="sr-only">Theme</label>
          <select 
            id="theme-select"
            value={theme} 
            onChange={(e) => handleThemeChange(e.target.value)}
            className="theme-select-input"
            aria-label="Color Theme"
          >
            <option value="system">🖥️ System</option>
            <option value="light">☀️ Light</option>
            <option value="dark">🌙 Dark</option>
          </select>
        </div>
      </div>
    </header>
  );
}

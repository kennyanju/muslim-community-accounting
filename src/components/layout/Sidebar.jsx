'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { useWindowResize } from '@/hooks/usePerformanceHooks';

export default function Sidebar({ isOpen, onClose }) {
  const { activeTab, setActiveTab, user, org, handleLogout } = useApp();

  // Auto-close mobile drawer on desktop resize with throttled listener
  useWindowResize(() => {
    if (isOpen && typeof window !== 'undefined' && window.innerWidth >= 1024) {
      if (onClose) onClose();
    }
  }, 150);

  const handleNavClick = (tab) => {
    setActiveTab(tab);
    if (onClose) onClose();
  };

  return (
    <>
      <div 
        className={`mobile-overlay ${isOpen ? 'open' : ''}`} 
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`sidebar ${isOpen ? 'open' : ''}`} aria-label="Main Navigation">
        <div className="sidebar-header">
          <div className="logo-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6a3 3 0 0 1 6 0v6" />
            </svg>
          </div>
          <div className="sidebar-brand">
            <span className="brand-title">{org.short_name || 'MASJID'}</span>
            <span className="brand-subtitle">{org.name || 'Masjid Accounting'}</span>
          </div>
        </div>

        <nav className="sidebar-menu" role="navigation" aria-label="Main App Sections">
          <button 
            type="button"
            aria-current={activeTab === 'dashboard' ? 'page' : undefined}
            className={`menu-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => handleNavClick('dashboard')}
            id="tab-btn-dashboard"
            style={{ minHeight: '44px' }}
          >
            <span className="menu-icon" aria-hidden="true">📊</span>
            <span>Dashboard</span>
          </button>

          <button 
            type="button"
            aria-current={activeTab === 'transactions' ? 'page' : undefined}
            className={`menu-item ${activeTab === 'transactions' ? 'active' : ''}`}
            onClick={() => handleNavClick('transactions')}
            id="tab-btn-transactions"
            style={{ minHeight: '44px' }}
          >
            <span className="menu-icon" aria-hidden="true">📑</span>
            <span>Transactions</span>
          </button>

          <button 
            type="button"
            aria-current={activeTab === 'donors' ? 'page' : undefined}
            className={`menu-item ${activeTab === 'donors' ? 'active' : ''}`}
            onClick={() => handleNavClick('donors')}
            id="tab-btn-donors"
            style={{ minHeight: '44px' }}
          >
            <span className="menu-icon" aria-hidden="true">👥</span>
            <span>Donors</span>
          </button>

          <button 
            type="button"
            aria-current={activeTab === 'reports' ? 'page' : undefined}
            className={`menu-item ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => handleNavClick('reports')}
            id="tab-btn-reports"
            style={{ minHeight: '44px' }}
          >
            <span className="menu-icon" aria-hidden="true">📈</span>
            <span>Reports &amp; P&amp;L</span>
          </button>

          <button 
            type="button"
            aria-current={activeTab === 'receipts' ? 'page' : undefined}
            className={`menu-item ${activeTab === 'receipts' ? 'active' : ''}`}
            onClick={() => handleNavClick('receipts')}
            id="tab-btn-receipts"
            style={{ minHeight: '44px' }}
          >
            <span className="menu-icon" aria-hidden="true">🧾</span>
            <span>Receipts</span>
          </button>

          {user?.role === 'ADMIN' && (
            <button 
              type="button"
              aria-current={activeTab === 'settings' ? 'page' : undefined}
              className={`menu-item ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => handleNavClick('settings')}
              id="tab-btn-settings"
              style={{ minHeight: '44px' }}
            >
              <span className="menu-icon" aria-hidden="true">⚙️</span>
              <span>Settings</span>
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar" aria-hidden="true">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="user-info">
              <span className="user-name">{user?.name || 'User'}</span>
              <span className="user-role-badge">{user?.role || 'VIEWER'}</span>
            </div>
          </div>
          <button 
            type="button"
            className="btn-logout" 
            onClick={handleLogout}
            title="Sign Out of Mosque Finance"
            aria-label="Sign Out"
            id="btn-logout"
            style={{ minWidth: '44px', minHeight: '44px' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </aside>
    </>
  );
}

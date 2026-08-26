'use client';

import React, { useState } from 'react';
import { AppProvider, useApp } from '@/context/AppContext';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import DashboardTab from '@/components/tabs/DashboardTab';
import TransactionsTab from '@/components/tabs/TransactionsTab';
import DonorsTab from '@/components/tabs/DonorsTab';
import ReportsTab from '@/components/tabs/ReportsTab';
import ReceiptsTab from '@/components/tabs/ReceiptsTab';
import SettingsTab from '@/components/tabs/SettingsTab';
import TransactionModal from '@/components/modals/TransactionModal';
import JummahModal from '@/components/modals/JummahModal';
import DonorModal from '@/components/modals/DonorModal';
import VoidModal from '@/components/modals/VoidModal';
import FundModal from '@/components/modals/FundModal';
import UserModal from '@/components/modals/UserModal';
import Toast from '@/components/common/Toast';

function MainApp() {
  const { activeTab, setActiveTab, user, loading } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [preloadedReceiptTx, setPreloadedReceiptTx] = useState(null);

  const handleLoadReceipt = (tx) => {
    setPreloadedReceiptTx(tx);
    setActiveTab('receipts');
  };

  return (
    <div className="app-container">
      <Sidebar isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

      <main className="main-content" id="main-content">
        <Header onOpenMobileMenu={() => setMobileMenuOpen(true)} />

        {loading ? (
          <div className="loading-state" style={{ padding: '60px', textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <p className="text-secondary">Loading financial records &amp; fund balances...</p>
          </div>
        ) : (
          <div className="tab-viewport">
            {activeTab === 'dashboard' && <DashboardTab />}
            {activeTab === 'transactions' && <TransactionsTab onLoadReceipt={handleLoadReceipt} />}
            {activeTab === 'donors' && <DonorsTab />}
            {activeTab === 'reports' && <ReportsTab />}
            {activeTab === 'receipts' && <ReceiptsTab preloadedTx={preloadedReceiptTx} />}
            {activeTab === 'settings' && user?.role === 'ADMIN' && <SettingsTab />}
          </div>
        )}
      </main>

      {/* Global Modals */}
      <TransactionModal />
      <JummahModal />
      <DonorModal />
      <VoidModal />
      <FundModal />
      <UserModal />

      {/* Global Toast Notifications */}
      <Toast />
    </div>
  );
}

export default function Home() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}

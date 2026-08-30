'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { AppProvider, useApp } from '@/context/AppContext';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import DashboardTab from '@/components/tabs/DashboardTab';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { TableSkeleton, CardSkeleton } from '@/components/common/Skeleton';

// Code-split heavy tabs with skeleton fallbacks
const TransactionsTab = dynamic(() => import('@/components/tabs/TransactionsTab'), {
  loading: () => <TableSkeleton rows={8} columns={8} />
});
const DonorsTab = dynamic(() => import('@/components/tabs/DonorsTab'), {
  loading: () => <TableSkeleton rows={6} columns={6} />
});
const ReportsTab = dynamic(() => import('@/components/tabs/ReportsTab'), {
  loading: () => <CardSkeleton count={3} />
});
const ReceiptsTab = dynamic(() => import('@/components/tabs/ReceiptsTab'), {
  loading: () => <CardSkeleton count={2} />
});
const SettingsTab = dynamic(() => import('@/components/tabs/SettingsTab'), {
  loading: () => <CardSkeleton count={4} />
});

// Modals
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
          <div className="tab-viewport" style={{ padding: '24px' }}>
            <CardSkeleton count={3} />
            <div style={{ marginTop: '24px' }}>
              <TableSkeleton rows={6} columns={6} />
            </div>
          </div>
        ) : (
          <div className="tab-viewport">
            <ErrorBoundary componentName="TabViewport" fallbackTitle="Tab Load Error">
              {activeTab === 'dashboard' && (
                <ErrorBoundary componentName="DashboardTab">
                  <DashboardTab />
                </ErrorBoundary>
              )}
              {activeTab === 'transactions' && (
                <ErrorBoundary componentName="TransactionsTab">
                  <TransactionsTab onLoadReceipt={handleLoadReceipt} />
                </ErrorBoundary>
              )}
              {activeTab === 'donors' && (
                <ErrorBoundary componentName="DonorsTab">
                  <DonorsTab />
                </ErrorBoundary>
              )}
              {activeTab === 'reports' && (
                <ErrorBoundary componentName="ReportsTab">
                  <ReportsTab />
                </ErrorBoundary>
              )}
              {activeTab === 'receipts' && (
                <ErrorBoundary componentName="ReceiptsTab">
                  <ReceiptsTab preloadedTx={preloadedReceiptTx} />
                </ErrorBoundary>
              )}
              {activeTab === 'settings' && user?.role === 'ADMIN' && (
                <ErrorBoundary componentName="SettingsTab">
                  <SettingsTab />
                </ErrorBoundary>
              )}
            </ErrorBoundary>
          </div>
        )}
      </main>

      {/* Global Modals */}
      <ErrorBoundary componentName="TransactionModal">
        <TransactionModal />
      </ErrorBoundary>
      <ErrorBoundary componentName="JummahModal">
        <JummahModal />
      </ErrorBoundary>
      <ErrorBoundary componentName="DonorModal">
        <DonorModal />
      </ErrorBoundary>
      <ErrorBoundary componentName="VoidModal">
        <VoidModal />
      </ErrorBoundary>
      <ErrorBoundary componentName="FundModal">
        <FundModal />
      </ErrorBoundary>
      <ErrorBoundary componentName="UserModal">
        <UserModal />
      </ErrorBoundary>

      {/* Global Toast Notifications */}
      <Toast />
    </div>
  );
}

export default function Home() {
  return (
    <ErrorBoundary componentName="RootHome">
      <AppProvider>
        <MainApp />
      </AppProvider>
    </ErrorBoundary>
  );
}

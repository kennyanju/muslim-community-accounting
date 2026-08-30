'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { AppProvider, useApp } from '@/context/AppContext';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { TableSkeleton, CardSkeleton } from '@/components/common/Skeleton';

// Code-split tabs with skeleton fallbacks
const DashboardTab = dynamic(() => import('@/components/tabs/DashboardTab'), {
  loading: () => <CardSkeleton count={3} />
});
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

// Code-split modals on demand (loaded only when triggered by user)
const TransactionModal = dynamic(() => import('@/components/modals/TransactionModal'), { ssr: false });
const JummahModal = dynamic(() => import('@/components/modals/JummahModal'), { ssr: false });
const DonorModal = dynamic(() => import('@/components/modals/DonorModal'), { ssr: false });
const VoidModal = dynamic(() => import('@/components/modals/VoidModal'), { ssr: false });
const FundModal = dynamic(() => import('@/components/modals/FundModal'), { ssr: false });
const UserModal = dynamic(() => import('@/components/modals/UserModal'), { ssr: false });

import Toast from '@/components/common/Toast';

function MainApp() {
  const { activeTab, setActiveTab, user, loading, modals } = useApp();
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

      {/* Global Modals - Loaded on demand only when opened */}
      {modals?.transaction && (
        <ErrorBoundary componentName="TransactionModal">
          <TransactionModal />
        </ErrorBoundary>
      )}
      {modals?.jummah && (
        <ErrorBoundary componentName="JummahModal">
          <JummahModal />
        </ErrorBoundary>
      )}
      {modals?.donor && (
        <ErrorBoundary componentName="DonorModal">
          <DonorModal />
        </ErrorBoundary>
      )}
      {modals?.voidTx && (
        <ErrorBoundary componentName="VoidModal">
          <VoidModal />
        </ErrorBoundary>
      )}
      {modals?.fund && (
        <ErrorBoundary componentName="FundModal">
          <FundModal />
        </ErrorBoundary>
      )}
      {modals?.user && (
        <ErrorBoundary componentName="UserModal">
          <UserModal />
        </ErrorBoundary>
      )}

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

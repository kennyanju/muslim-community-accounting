'use client';

import { useMemo, useCallback } from 'react';
import { useApp } from '@/context/AppContext';

/**
 * Targeted hook for transaction ledger operations.
 * Isolates components that only need transactions and balances, avoiding unnecessary re-renders.
 */
export function useTransactions() {
  const {
    transactions,
    setTransactions,
    balances,
    org,
    user,
    fetchAPI,
    addToast,
    refreshData,
    openModal,
    optimisticBankDeposit,
    optimisticVoidTx,
    optimisticReconcileLock
  } = useApp();

  const activeTransactions = useMemo(() => {
    return transactions.filter(t => t.status !== 'VOIDED' && t.status !== 'FAILED');
  }, [transactions]);

  const recordTransaction = useCallback(async (payload) => {
    try {
      const res = await fetchAPI('/api/transactions', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      addToast('Transaction recorded successfully', 'success');
      refreshData();
      return res;
    } catch (err) {
      addToast(err.message, 'error');
      throw err;
    }
  }, [fetchAPI, addToast, refreshData]);

  return {
    transactions,
    setTransactions,
    activeTransactions,
    balances,
    org,
    user,
    recordTransaction,
    bankDeposit: optimisticBankDeposit,
    voidTransaction: optimisticVoidTx,
    reconcileLock: optimisticReconcileLock,
    openModal
  };
}

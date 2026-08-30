'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { reportClientError, addBreadcrumb } from '@/lib/errorReporting';

const AppContext = createContext(null);

const DEFAULT_ORGANISATION = {
  name: 'Bristol South Muslim Community',
  short_name: 'BSMC',
  tagline: 'Bristol South Mosque & Islamic Centre',
  charity_number: '1234567',
  address: '100 Mosque Road, Bristol, BS3 1AB',
  email: 'finance@bsmc.org.uk',
  phone: '0117 000 0000',
  currency_symbol: '£',
  country: 'United Kingdom'
};

export function AppProvider({ children }) {
  const router = useRouter();
  const hasInitialized = useRef(false);
  const dataVersionRef = useRef(0);

  const [user, setUser] = useState({ id: 'user-sec-1', role: 'ADMIN', name: 'Financial Secretary' });
  const [org, setOrg] = useState(DEFAULT_ORGANISATION);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [theme, setTheme] = useState('system');
  const [toasts, setToasts] = useState([]);
  
  // Data entities
  const [balances, setBalances] = useState([]);
  const [funds, setFunds] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [donors, setDonors] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active Modals
  const [modals, setModals] = useState({
    transaction: false,
    jummah: false,
    donor: false,
    voidTx: null,
    fund: null, // null or { mode: 'create' | 'edit', fund: object }
    user: null, // null or { mode: 'create' | 'edit', user: object }
  });

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => {
      // Cap toasts to max 4 active to prevent viewport overflow
      const trimmed = prev.length >= 4 ? prev.slice(prev.length - 3) : prev;
      return [...trimmed, { id, message, type }];
    });

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const applyTheme = useCallback((t) => {
    let active = t;
    if (t === 'system') {
      const isDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
      active = isDark ? 'dark' : 'light';
    }
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', active);
    }
  }, []);

  const handleThemeChange = useCallback((newTheme) => {
    setTheme(newTheme);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('masjid-theme', newTheme);
    }
    applyTheme(newTheme);
  }, [applyTheme]);

  // Unified fetch helper that extracts .data from standard API response envelopes
  const fetchAPI = useCallback(async (url, options = {}) => {
    try {
      const res = await fetch(url, options);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = body?.error?.message || body?.error || body?.message || 'Request failed';
        throw new Error(errMsg);
      }
      return body?.data !== undefined ? body.data : body;
    } catch (err) {
      reportClientError(err, { url, method: options.method || 'GET' });
      throw err;
    }
  }, []);

  const userRole = user?.role;

  // Synchronized data refresh with race condition prevention
  const refreshData = useCallback(async () => {
    const currentVersion = ++dataVersionRef.current;
    
    try {
      const [balancesData, txData, donorsData, fundsData, orgData] = await Promise.all([
        fetchAPI('/api/funds/balances').catch(() => []),
        fetchAPI('/api/transactions').catch(() => []),
        fetchAPI('/api/donors').catch(() => []),
        fetchAPI('/api/funds').catch(() => []),
        fetchAPI('/api/organisation').catch(() => DEFAULT_ORGANISATION)
      ]);

      // Only update state if this request is still the newest version
      if (currentVersion === dataVersionRef.current) {
        setBalances(Array.isArray(balancesData) ? balancesData : []);
        setTransactions(Array.isArray(txData) ? txData : []);
        setDonors(Array.isArray(donorsData) ? donorsData : []);
        setFunds(Array.isArray(fundsData) ? fundsData : []);
        if (orgData && orgData.name) setOrg(orgData);

        if (userRole === 'ADMIN') {
          const [usersData, logsData] = await Promise.all([
            fetchAPI('/api/users').catch(() => []),
            fetchAPI('/api/audits').catch(() => [])
          ]);
          if (currentVersion === dataVersionRef.current) {
            setUsersList(Array.isArray(usersData) ? usersData : []);
            setAuditLogs(Array.isArray(logsData) ? logsData : []);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load application data:', err);
    } finally {
      if (currentVersion === dataVersionRef.current) {
        setLoading(false);
      }
    }
  }, [fetchAPI, userRole]);

  // Initial Auth & Data Load - Protected against multi-invocation & redirect loops
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const init = async () => {
      try {
        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) {
          const body = await meRes.json();
          const authData = body.data || body;
          if (authData.user) setUser(authData.user);
          if (authData.organisation) setOrg(authData.organisation);
        } else if (meRes.status === 401) {
          if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
            const redirectUrl = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
            router.push(redirectUrl);
          }
          return;
        }
      } catch (err) {
        console.error('Auth verification failed:', err);
      }

      if (typeof localStorage !== 'undefined') {
        const savedTheme = localStorage.getItem('masjid-theme') || localStorage.getItem('bsmc-theme') || 'system';
        setTheme(savedTheme);
        applyTheme(savedTheme);
      }

      await refreshData();
    };

    init();
  }, [applyTheme, refreshData, router]);

  // Optimistic UI mutation helper for banking cash
  const optimisticBankDeposit = useCallback(async (txId) => {
    const previousTransactions = transactions;
    
    // 1. Apply optimistic update immediately
    setTransactions(prev => prev.map(t => t.id === txId ? { ...t, status: 'BANKED' } : t));
    addBreadcrumb('mutation', `Optimistically banked transaction: ${txId}`);

    try {
      await fetchAPI(`/api/transactions/${txId}/bank`, { method: 'POST' });
      addToast('Cash deposit marked as banked.', 'success');
      refreshData();
    } catch (err) {
      // Rollback on server error
      setTransactions(previousTransactions);
      addToast(`Banking failed: ${err.message}`, 'error');
    }
  }, [transactions, fetchAPI, addToast, refreshData]);

  // Optimistic UI mutation helper for voiding transaction
  const optimisticVoidTx = useCallback(async (txId, voidReason) => {
    const previousTransactions = transactions;

    // Apply optimistic update immediately
    setTransactions(prev => prev.map(t => t.id === txId ? { ...t, status: 'VOIDED', void_reason: voidReason } : t));

    try {
      await fetchAPI(`/api/transactions/${txId}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: voidReason })
      });
      addToast('Transaction marked as voided.', 'success');
      refreshData();
    } catch (err) {
      // Rollback on failure
      setTransactions(previousTransactions);
      addToast(`Void failed: ${err.message}`, 'error');
    }
  }, [transactions, fetchAPI, addToast, refreshData]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      addToast('Signed out successfully', 'info');
      router.push('/login');
    } catch (e) {
      router.push('/login');
    }
  };

  const openModal = (modalName, payload = true) => {
    setModals(prev => ({ ...prev, [modalName]: payload }));
  };

  const closeModal = (modalName) => {
    setModals(prev => ({ ...prev, [modalName]: modalName === 'voidTx' || modalName === 'fund' || modalName === 'user' ? null : false }));
  };

  const value = {
    user,
    setUser,
    org,
    setOrg,
    activeTab,
    setActiveTab,
    theme,
    handleThemeChange,
    toasts,
    addToast,
    removeToast,
    balances,
    setBalances,
    funds,
    setFunds,
    transactions,
    setTransactions,
    donors,
    setDonors,
    usersList,
    auditLogs,
    loading,
    refreshData,
    handleLogout,
    modals,
    openModal,
    closeModal,
    fetchAPI,
    optimisticBankDeposit,
    optimisticVoidTx
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

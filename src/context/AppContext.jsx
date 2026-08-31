'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { reportClientError, addBreadcrumb, setUserContext, clearUserContext, setMosqueContext } from '@/lib/errorReporting';
import { trackPageView, trackThemeChanged } from '@/lib/analytics';
import { fetchAPI as baseFetchAPI, NetworkError } from '@/utils/api';

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
  const abortControllerRef = useRef(null);

  const [user, setUser] = useState({ id: 'user-sec-1', role: 'ADMIN', name: 'Financial Secretary' });
  const [org, setOrg] = useState(DEFAULT_ORGANISATION);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [theme, setTheme] = useState('system');
  const [toasts, setToasts] = useState([]);
  const [isOnline, setIsOnline] = useState(() => {
    return typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? navigator.onLine : true;
  });
  
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

  const addToast = useCallback((message, type = 'info', options = {}) => {
    const id = Date.now() + Math.random();
    const duration = options.duration || (type === 'error' ? 6000 : 4500);

    setToasts(prev => {
      // Cap toasts to max 4 active to prevent viewport overflow
      const trimmed = prev.length >= 4 ? prev.slice(prev.length - 3) : prev;
      return [...trimmed, { id, message, type, action: options.action, duration }];
    });
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
    trackThemeChanged(newTheme);
  }, [applyTheme]);

  // Track tab page views with deduplication
  useEffect(() => {
    trackPageView(activeTab, `Tab: ${activeTab}`);
  }, [activeTab]);

  // Listen for real-time OS theme preference changes when theme is set to 'system'
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };
    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, [theme, applyTheme]);

  // Unified fetch helper that extracts .data from standard API response envelopes
  const fetchAPI = useCallback(async (url, options = {}) => {
    try {
      const body = await baseFetchAPI(url, options);
      return body?.data !== undefined ? body.data : body;
    } catch (err) {
      if (err.name !== 'AbortError') {
        reportClientError(err, { url, method: options.method || 'GET' });
      }
      throw err;
    }
  }, []);

  const userRole = user?.role;

  // Synchronized data refresh with AbortController cancellation & version tag
  const refreshData = useCallback(async () => {
    // 1. Cancel previous in-flight refresh request if still active
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const currentVersion = ++dataVersionRef.current;
    
    try {
      const fetchOpts = { signal: controller.signal };
      const [balancesData, txData, donorsData, fundsData, orgData] = await Promise.all([
        fetchAPI('/api/funds/balances', fetchOpts).catch((e) => e.name === 'AbortError' ? null : []),
        fetchAPI('/api/transactions', fetchOpts).catch((e) => e.name === 'AbortError' ? null : []),
        fetchAPI('/api/donors', fetchOpts).catch((e) => e.name === 'AbortError' ? null : []),
        fetchAPI('/api/funds', fetchOpts).catch((e) => e.name === 'AbortError' ? null : []),
        fetchAPI('/api/organisation', fetchOpts).catch((e) => e.name === 'AbortError' ? null : DEFAULT_ORGANISATION)
      ]);

      // If aborted, exit cleanly
      if (controller.signal.aborted || currentVersion !== dataVersionRef.current) {
        return;
      }

      setBalances(Array.isArray(balancesData) ? balancesData : []);
      setTransactions(Array.isArray(txData) ? txData : []);
      setDonors(Array.isArray(donorsData) ? donorsData : []);
      setFunds(Array.isArray(fundsData) ? fundsData : []);
      if (orgData && orgData.name) setOrg(orgData);

      if (userRole === 'ADMIN') {
        const [usersData, logsData] = await Promise.all([
          fetchAPI('/api/users', fetchOpts).catch((e) => e.name === 'AbortError' ? null : []),
          fetchAPI('/api/audits', fetchOpts).catch((e) => e.name === 'AbortError' ? null : [])
        ]);
        if (!controller.signal.aborted && currentVersion === dataVersionRef.current) {
          setUsersList(Array.isArray(usersData) ? usersData : []);
          setAuditLogs(Array.isArray(logsData) ? logsData : []);
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        reportClientError(err, { context: 'refreshData' });
      }
    } finally {
      if (currentVersion === dataVersionRef.current) {
        setLoading(false);
      }
    }
  }, [fetchAPI, userRole]);

  // Online / Offline connectivity listener
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      addToast('🌐 Network connection restored. Synchronizing data...', 'success');
      refreshData();
    };

    const handleOffline = () => {
      setIsOnline(false);
      addToast('⚡ Network connection lost. Working in offline mode.', 'warning', { duration: 6000 });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [addToast, refreshData]);

  // Manual connectivity test
  const checkConnectivity = useCallback(async () => {
    try {
      const res = await fetch('/api/funds/balances', { method: 'GET', cache: 'no-store' });
      if (res.ok) {
        setIsOnline(true);
        addToast('🌐 Connection verified. Synchronized!', 'success');
        refreshData();
      } else {
        setIsOnline(false);
        addToast('Server is currently unreachable. Please check connection.', 'warning');
      }
    } catch (err) {
      setIsOnline(false);
      addToast('Connection test failed. You appear to be offline.', 'error');
    }
  }, [addToast, refreshData]);

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
          if (authData.user) {
            setUser(authData.user);
            setUserContext(authData.user);
          }
          if (authData.organisation) {
            setOrg(authData.organisation);
            setMosqueContext(authData.organisation);
          }
        } else if (meRes.status === 401) {
          if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
            const redirectUrl = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
            router.push(redirectUrl);
          }
          return;
        }
      } catch (err) {
        reportClientError(err, { context: 'auth_init' });
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

  const retryRefs = useRef({});

  // Optimistic UI mutation helper for banking cash with granular rollback
  const optimisticBankDeposit = useCallback(async (txId) => {
    const originalTx = transactions.find(t => t.id === txId);
    if (!originalTx) return;
    
    // 1. Apply optimistic update surgically
    setTransactions(prev => prev.map(t => t.id === txId ? { ...t, status: 'BANKED' } : t));
    addBreadcrumb('mutation', `Optimistically banked transaction: ${txId}`);

    try {
      await fetchAPI(`/api/transactions/${txId}/bank`, { method: 'POST' });
      addToast('Cash deposit marked as banked.', 'success');
      refreshData();
    } catch (err) {
      // Surgical rollback of target item
      setTransactions(prev => prev.map(t => t.id === txId ? originalTx : t));
      addToast(`Banking failed: ${err.message}`, 'error', {
        action: { label: 'Retry', onClick: () => retryRefs.current.bankDeposit?.(txId) }
      });
    }
  }, [transactions, fetchAPI, addToast, refreshData]);

  // Optimistic UI mutation helper for voiding transaction with granular rollback
  const optimisticVoidTx = useCallback(async (txId, voidReason) => {
    const originalTx = transactions.find(t => t.id === txId);
    if (!originalTx) return;

    // Apply optimistic update surgically
    setTransactions(prev => prev.map(t => t.id === txId ? { ...t, status: 'VOIDED', void_reason: voidReason } : t));
    addBreadcrumb('mutation', `Optimistically voided transaction: ${txId}`);

    try {
      await fetchAPI(`/api/transactions/${txId}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: voidReason })
      });
      addToast('Transaction marked as voided.', 'success');
      refreshData();
    } catch (err) {
      // Surgical rollback
      setTransactions(prev => prev.map(t => t.id === txId ? originalTx : t));
      addToast(`Void failed: ${err.message}`, 'error', {
        action: { label: 'Retry', onClick: () => retryRefs.current.voidTx?.(txId, voidReason) }
      });
    }
  }, [transactions, fetchAPI, addToast, refreshData]);

  // Optimistic UI mutation helper for permanently locking and reconciling transactions
  const optimisticReconcileLock = useCallback(async (txId) => {
    const originalTx = transactions.find(t => t.id === txId);
    if (!originalTx) return;

    setTransactions(prev => prev.map(t => t.id === txId ? { ...t, is_reconciled: true } : t));
    addBreadcrumb('mutation', `Optimistically locked transaction: ${txId}`);

    try {
      await fetchAPI(`/api/transactions/${txId}/reconcile`, { method: 'POST' });
      addToast('Transaction reconciled and permanently locked.', 'success');
      refreshData();
    } catch (err) {
      // Surgical rollback
      setTransactions(prev => prev.map(t => t.id === txId ? originalTx : t));
      addToast(`Reconcile failed: ${err.message}`, 'error', {
        action: { label: 'Retry', onClick: () => retryRefs.current.reconcileLock?.(txId) }
      });
    }
  }, [transactions, fetchAPI, addToast, refreshData]);

  // Optimistic UI mutation helper for toggling fund archive status
  const optimisticToggleFundArchive = useCallback(async (fund) => {
    const originalFund = funds.find(f => f.id === fund.id);
    const newArchived = !fund.is_archived;

    setFunds(prev => prev.map(f => f.id === fund.id ? { ...f, is_archived: newArchived } : f));
    addBreadcrumb('mutation', `Optimistically toggled fund archive: ${fund.id} -> ${newArchived}`);

    try {
      await fetchAPI(`/api/funds/${fund.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_archived: newArchived })
      });
      addToast(`Fund "${fund.name}" ${newArchived ? 'archived' : 'restored'}.`, 'info');
      refreshData();
    } catch (err) {
      if (originalFund) {
        setFunds(prev => prev.map(f => f.id === fund.id ? originalFund : f));
      }
      addToast(`Fund update failed: ${err.message}`, 'error', {
        action: { label: 'Retry', onClick: () => retryRefs.current.toggleFundArchive?.(fund) }
      });
    }
  }, [funds, fetchAPI, addToast, refreshData]);

  // Optimistic UI mutation helper for toggling user account status
  const optimisticToggleUserStatus = useCallback(async (targetUser) => {
    const originalUser = usersList.find(u => u.id === targetUser.id);
    const newStatus = targetUser.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    setUsersList(prev => prev.map(u => u.id === targetUser.id ? { ...u, status: newStatus } : u));
    addBreadcrumb('mutation', `Optimistically toggled user status: ${targetUser.id} -> ${newStatus}`);

    try {
      await fetchAPI(`/api/users/${targetUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      addToast(`User ${targetUser.email} marked as ${newStatus}.`, 'info');
      refreshData();
    } catch (err) {
      if (originalUser) {
        setUsersList(prev => prev.map(u => u.id === targetUser.id ? originalUser : u));
      }
      addToast(`User status update failed: ${err.message}`, 'error', {
        action: { label: 'Retry', onClick: () => retryRefs.current.toggleUserStatus?.(targetUser) }
      });
    }
  }, [usersList, fetchAPI, addToast, refreshData]);

  // Synchronize retry refs in effect to comply with React 19 render purity rules
  useEffect(() => {
    retryRefs.current = {
      bankDeposit: optimisticBankDeposit,
      voidTx: optimisticVoidTx,
      reconcileLock: optimisticReconcileLock,
      toggleFundArchive: optimisticToggleFundArchive,
      toggleUserStatus: optimisticToggleUserStatus
    };
  }, [optimisticBankDeposit, optimisticVoidTx, optimisticReconcileLock, optimisticToggleFundArchive, optimisticToggleUserStatus]);

  const handleLogout = async () => {
    try {
      clearUserContext();
      await fetch('/api/auth/logout', { method: 'POST' });
      addToast('Signed out successfully', 'info');
      router.push('/login');
    } catch (e) {
      clearUserContext();
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
    isOnline,
    checkConnectivity,
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
    optimisticVoidTx,
    optimisticReconcileLock,
    optimisticToggleFundArchive,
    optimisticToggleUserStatus
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

'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

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
    setToasts(prev => [...prev, { id, message, type }]);
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
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      active = isDark ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', active);
  }, []);

  const handleThemeChange = useCallback((newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('masjid-theme', newTheme);
    applyTheme(newTheme);
  }, [applyTheme]);

  // Unified fetch helper that extracts .data from standard API response envelopes
  const fetchAPI = useCallback(async (url, options = {}) => {
    const res = await fetch(url, options);
    const body = await res.json();
    if (!res.ok) {
      const errMsg = body?.error?.message || body?.error || body?.message || 'Request failed';
      throw new Error(errMsg);
    }
    return body?.data !== undefined ? body.data : body;
  }, []);

  // Synchronized data refresh
  const refreshData = useCallback(async () => {
    try {
      const [balancesData, txData, donorsData, fundsData, orgData] = await Promise.all([
        fetchAPI('/api/funds/balances').catch(() => []),
        fetchAPI('/api/transactions').catch(() => []),
        fetchAPI('/api/donors').catch(() => []),
        fetchAPI('/api/funds').catch(() => []),
        fetchAPI('/api/organisation').catch(() => DEFAULT_ORGANISATION)
      ]);

      setBalances(Array.isArray(balancesData) ? balancesData : []);
      setTransactions(Array.isArray(txData) ? txData : []);
      setDonors(Array.isArray(donorsData) ? donorsData : []);
      setFunds(Array.isArray(fundsData) ? fundsData : []);
      if (orgData && orgData.name) setOrg(orgData);

      if (user?.role === 'ADMIN') {
        const [usersData, logsData] = await Promise.all([
          fetchAPI('/api/users').catch(() => []),
          fetchAPI('/api/audits').catch(() => [])
        ]);
        setUsersList(Array.isArray(usersData) ? usersData : []);
        setAuditLogs(Array.isArray(logsData) ? logsData : []);
      }
    } catch (err) {
      console.error('Failed to load application data:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchAPI, user?.role]);

  // Initial Auth & Data Load
  useEffect(() => {
    const init = async () => {
      try {
        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) {
          const body = await meRes.json();
          const authData = body.data || body;
          if (authData.user) setUser(authData.user);
          if (authData.organisation) setOrg(authData.organisation);
        } else if (meRes.status === 401) {
          router.push('/login');
          return;
        }
      } catch (err) {
        console.error('Auth verification failed:', err);
      }

      const savedTheme = localStorage.getItem('masjid-theme') || 'system';
      setTheme(savedTheme);
      applyTheme(savedTheme);

      await refreshData();
    };

    init();
  }, [applyTheme, refreshData, router]);

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
    funds,
    transactions,
    donors,
    usersList,
    auditLogs,
    loading,
    refreshData,
    handleLogout,
    modals,
    openModal,
    closeModal,
    fetchAPI
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

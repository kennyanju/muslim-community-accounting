'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { fetchAPI } from '@/utils/api';

export default function Home() {
  const router = useRouter();
  
  // 1. Roles and Identity Session States
  const [user, setUser] = useState({
    id: 'user-sec-1',
    email: 'secretary@bsmc.org.uk',
    name: 'Financial Secretary',
    role: 'ADMIN' // ADMIN, REVIEWER, AUDITOR
  });

  const [org, setOrg] = useState({
    name: 'Bristol South Muslim Community',
    short_name: 'BSMC',
    tagline: 'Bristol South Mosque & Islamic Centre',
    charity_number: '1234567',
    address: '100 Mosque Road, Bristol, BS3 1AB',
    email: 'finance@bsmc.org.uk',
    phone: '0117 000 0000',
    currency_symbol: '£',
    country: 'United Kingdom'
  });

  // 2. Core State
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, transactions, donors, reports, receipts, settings
  const [settingsSubtab, setSettingsSubtab] = useState('profile'); // profile, funds, users, backup
  
  const [transactions, setTransactions] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);
  const [donors, setDonors] = useState([]);
  const [funds, setFunds] = useState([]);
  const [balances, setBalances] = useState([]);
  const [audits, setAudits] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Toast Notification System
  const [toasts, setToasts] = useState([]);
  const addToast = (message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };
  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Form Modals State
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [donorModalOpen, setDonorModalOpen] = useState(false);
  const [jummahModalOpen, setJummahModalOpen] = useState(false);
  const [fundModalOpen, setFundModalOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [targetVoidTx, setTargetVoidTx] = useState(null);
  const [voidReasonInput, setVoidReasonInput] = useState('');

  // Transaction Form Fields
  const [txForm, setTxForm] = useState({
    type: 'income',
    date: new Date().toISOString().substring(0, 10),
    description: '',
    fundId: 'fund-lillah',
    category: 'Donation',
    amount: '',
    method: 'Cash',
    donorId: 'anonymous',
    giftAid: false,
    notes: '',
    isSplit: false,
    splits: [{ fundId: 'fund-lillah', amount: '' }]
  });

  // Donor Form Fields (Structured Address)
  const [donorForm, setDonorForm] = useState({
    name: '',
    address_line_1: '',
    address_line_2: '',
    city: '',
    postcode: '',
    giftAidEligible: true
  });

  // Jummah Form Fields
  const [jummahForm, setJummahForm] = useState({
    date: new Date().toISOString().substring(0, 10),
    amount: '',
    fundId: 'fund-lillah',
    counter1: '',
    counter2: '',
    notes: ''
  });

  // Fund Form Fields
  const [fundForm, setFundForm] = useState({
    name: '',
    is_restricted: false,
    description: ''
  });

  // User Form Fields
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'REVIEWER'
  });

  // Filter States
  const [filterType, setFilterType] = useState('all');
  const [filterFund, setFilterFund] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterJummahOnly, setFilterJummahOnly] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // File input ref for backup restore
  const fileInputRef = useRef(null);

  // 3. Load active session & organisation data
  useEffect(() => {
    // 1. Optimistic instant load from localStorage
    try {
      const cachedOrg = localStorage.getItem('masjid_org_profile');
      if (cachedOrg) {
        const parsed = JSON.parse(cachedOrg);
        if (parsed && parsed.name) {
          setOrg(parsed);
        }
      }
    } catch (e) {}

    fetchAPI('/api/auth/me')
      .then(data => {
        if (data && data.user) {
          setUser(data.user);
        }
        if (data && data.organisation && data.organisation.name) {
          setOrg(data.organisation);
          try {
            localStorage.setItem('masjid_org_profile', JSON.stringify(data.organisation));
          } catch (e) {}
        }
      })
      .catch(err => {
        console.error("Session verification failed:", err.message);
        router.push('/login');
      });
  }, [router]);

  // 4. Data Fetching
  const fetchData = async () => {
    try {
      const queryParams = new URLSearchParams();
      if (filterType !== 'all') queryParams.append('type', filterType);
      if (filterFund !== 'all') queryParams.append('fund', filterFund);
      if (filterCategory !== 'all') queryParams.append('category', filterCategory);
      if (filterStatus !== 'all') queryParams.append('status', filterStatus);
      if (filterSearch) queryParams.append('search', filterSearch);
      if (filterDateFrom) queryParams.append('dateFrom', filterDateFrom);
      if (filterDateTo) queryParams.append('dateTo', filterDateTo);
      if (filterJummahOnly) queryParams.append('jummahOnly', 'true');

      const [txData, allTxData, donorData, fundsData, balData, auditData, orgData] = await Promise.all([
        fetchAPI(`/api/transactions?${queryParams.toString()}`),
        fetchAPI('/api/transactions'), // Unfiltered for global cards
        fetchAPI('/api/donors'),
        fetchAPI('/api/funds'),
        fetchAPI('/api/funds/balances'),
        fetchAPI('/api/audits'),
        fetchAPI('/api/organisation')
      ]);

      setTransactions(txData);
      setAllTransactions(allTxData);
      setDonors(donorData);
      setFunds(fundsData);
      setBalances(balData);
      setAudits(auditData);
      if (orgData && orgData.name) {
        setOrg(orgData);
        try {
          localStorage.setItem('masjid_org_profile', JSON.stringify(orgData));
        } catch (e) {}
      }

      if (user.role === 'ADMIN') {
        const usersData = await fetchAPI('/api/users').catch(() => []);
        setUsersList(usersData);
      }

      setLoading(false);
    } catch (err) {
      console.error("Failed to load financial API data:", err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filterType, filterFund, filterCategory, filterStatus, filterSearch, filterDateFrom, filterDateTo, filterJummahOnly]);

  // Handle Theme switching
  const [theme, setTheme] = useState('system');
  useEffect(() => {
    const saved = localStorage.getItem('masjid-theme') || localStorage.getItem('bsmc-theme') || 'system';
    setTheme(saved);
    applyTheme(saved);
  }, []);

  const handleThemeChange = (e) => {
    const val = e.target.value;
    setTheme(val);
    localStorage.setItem('masjid-theme', val);
    applyTheme(val);
  };

  const applyTheme = (t) => {
    document.documentElement.setAttribute('data-theme', t);
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (t === 'dark') {
      if (meta) meta.content = 'dark';
    } else if (t === 'light') {
      if (meta) meta.content = 'light';
    } else {
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (meta) meta.content = systemPrefersDark ? 'dark' : 'light';
    }
  };

  // Logout Workflow
  const handleLogout = async () => {
    try {
      await fetchAPI('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (err) {
      router.push('/login');
    }
  };

  // Switch Active Tab
  const handleTabSwitch = (tabName) => {
    setActiveTab(tabName);
    setCurrentPage(1);
  };

  // Helper to resolve fund name
  const getFundName = (fId) => {
    const fund = balances.find(b => b.fundId === fId);
    return fund ? fund.fundName : 'Unknown';
  };

  // Consolidated Balances from unfiltered transaction set
  const consolidated = useMemo(() => {
    let total = 0;
    let restricted = 0;
    let unrestricted = 0;
    let ribaBalance = 0;
    let bankTotal = 0;
    let cashTotal = 0;

    balances.forEach(b => {
      if (b.fundName === 'Interest/Riba') {
        ribaBalance += b.balance;
      } else {
        total += b.balance;
        if (b.isRestricted) {
          restricted += b.balance;
        } else {
          unrestricted += b.balance;
        }
      }
    });

    allTransactions.forEach(t => {
      if (t.status === 'VOIDED' || t.status === 'FAILED') return;
      const change = t.type === 'INCOME' ? parseFloat(t.total_amount) : -parseFloat(t.total_amount);
      if (t.method === 'CASH' && t.status === 'PENDING') {
        cashTotal += change;
      } else {
        bankTotal += change;
      }
    });

    return { total, bankTotal, cashTotal, restricted, unrestricted, ribaBalance };
  }, [balances, allTransactions]);

  // Quick Date Filter Helpers
  const setQuickDateRange = (rangeType) => {
    const today = new Date();
    const curYear = today.getFullYear();

    if (rangeType === 'all') {
      setFilterDateFrom('');
      setFilterDateTo('');
    } else if (rangeType === 'this_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().substring(0, 10);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().substring(0, 10);
      setFilterDateFrom(firstDay);
      setFilterDateTo(lastDay);
    } else if (rangeType === 'last_3_months') {
      const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, 1).toISOString().substring(0, 10);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().substring(0, 10);
      setFilterDateFrom(threeMonthsAgo);
      setFilterDateTo(lastDay);
    } else if (rangeType === 'uk_tax_year') {
      // UK Tax year runs 6 April to 5 April
      let taxStartYear = curYear;
      if (today.getMonth() < 3 || (today.getMonth() === 3 && today.getDate() < 6)) {
        taxStartYear = curYear - 1;
      }
      setFilterDateFrom(`${taxStartYear}-04-06`);
      setFilterDateTo(`${taxStartYear + 1}-04-05`);
    }
  };

  // Shariah Compliance Rule Checker for transaction entry
  const isRestrictedExpenseViolation = useMemo(() => {
    if (txForm.type !== 'expense') return false;
    const selectedFund = balances.find(b => b.fundId === txForm.fundId);
    if (!selectedFund || !selectedFund.isRestricted) return false;
    
    const isOpCat = ['Utilities', 'Salaries', 'Maintenance', 'Office Supplies', 'Travel'].includes(txForm.category);
    const hasOpKeyword = (txForm.description || '').toLowerCase().match(/utility|maintenance|salary|bill|rent|repair|clean/);
    
    return (selectedFund.fundName === 'Zakat' || selectedFund.fundName === 'Fitrana') && (isOpCat || hasOpKeyword);
  }, [txForm, balances]);

  // 5. API Operations
  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (isRestrictedExpenseViolation) {
      addToast("Shariah Compliance Violation: Cannot draw operational expenses from Zakat/Fitrana restricted funds.", "error");
      return;
    }

    setSubmitting(true);
    let finalSplits = [];
    if (txForm.isSplit) {
      finalSplits = txForm.splits.map(s => ({ fund_id: s.fundId, amount: parseFloat(s.amount) }));
    } else {
      finalSplits = [{ fund_id: txForm.fundId, amount: parseFloat(txForm.amount) }];
    }

    const payload = {
      type: txForm.type.toUpperCase(),
      status: txForm.method === 'CASH' ? 'PENDING' : 'BANKED',
      method: txForm.method.toUpperCase().replace(' ', '_'),
      totalAmount: parseFloat(txForm.amount),
      date: txForm.date,
      donorId: txForm.donorId,
      receiptUrl: '',
      reference_note: txForm.description,
      category: txForm.category,
      splits: finalSplits,
      giftAid: txForm.giftAid,
      notes: txForm.notes
    };

    try {
      await fetchAPI('/api/transactions', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      addToast("Transaction recorded successfully.", "success");
      setTxModalOpen(false);
      // Reset Form
      setTxForm({
        type: 'income',
        date: new Date().toISOString().substring(0, 10),
        description: '',
        fundId: 'fund-lillah',
        category: 'Donation',
        amount: '',
        method: 'Cash',
        donorId: 'anonymous',
        giftAid: false,
        notes: '',
        isSplit: false,
        splits: [{ fundId: 'fund-lillah', amount: '' }]
      });
      fetchData();
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogJummah = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    const payload = {
      type: 'INCOME',
      status: 'PENDING',
      method: 'CASH',
      totalAmount: parseFloat(jummahForm.amount),
      date: jummahForm.date,
      donorId: 'anonymous',
      receiptUrl: '',
      reference_note: 'Friday Jummah Cash Collection',
      category: 'Donation',
      splits: [{ fund_id: jummahForm.fundId, amount: parseFloat(jummahForm.amount) }],
      giftAid: false,
      notes: `Counters: ${jummahForm.counter1} & ${jummahForm.counter2}. ${jummahForm.notes || 'Friday cash counting slip signed.'}`
    };

    try {
      await fetchAPI('/api/transactions', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      addToast("Jummah cash collection logged as Cash on Hand.", "success");
      setJummahModalOpen(false);
      setJummahForm({
        date: new Date().toISOString().substring(0, 10),
        amount: '',
        fundId: 'fund-lillah',
        counter1: '',
        counter2: '',
        notes: ''
      });
      fetchData();
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddDonor = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetchAPI('/api/donors', {
        method: 'POST',
        body: JSON.stringify(donorForm)
      });

      addToast("Donor profile registered successfully.", "success");
      setDonorModalOpen(false);
      setDonorForm({
        name: '',
        address_line_1: '',
        address_line_2: '',
        city: '',
        postcode: '',
        giftAidEligible: true
      });
      fetchData();
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const openVoidModal = (tx) => {
    setTargetVoidTx(tx);
    setVoidReasonInput('');
    setVoidModalOpen(true);
  };

  const handleConfirmVoidTx = async (e) => {
    e.preventDefault();
    if (!voidReasonInput.trim()) {
      addToast("Void reason is mandatory for financial audit integrity.", "error");
      return;
    }

    setSubmitting(true);
    try {
      await fetchAPI(`/api/transactions/${targetVoidTx.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: voidReasonInput.trim() })
      });
      addToast(`Transaction ${targetVoidTx.id} marked as VOIDED.`, "info");
      setVoidModalOpen(false);
      setTargetVoidTx(null);
      fetchData();
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBankDeposit = async (txId) => {
    try {
      await fetchAPI(`/api/transactions/${txId}/bank`, {
        method: 'POST'
      });
      addToast("Cash collection marked as Banked.", "success");
      fetchData();
    } catch (err) {
      addToast(err.message, "error");
    }
  };

  const handleReconcileLock = async (txId) => {
    try {
      await fetchAPI(`/api/transactions/${txId}/reconcile`, {
        method: 'POST'
      });
      addToast("Transaction reconciled and permanently locked.", "success");
      fetchData();
    } catch (err) {
      addToast(err.message, "error");
    }
  };

  // Fund Management Handlers
  const handleAddFund = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetchAPI('/api/funds', {
        method: 'POST',
        body: JSON.stringify(fundForm)
      });
      addToast(`Fund "${fundForm.name}" created successfully.`, "success");
      setFundModalOpen(false);
      setFundForm({ name: '', is_restricted: false, description: '' });
      fetchData();
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleArchiveFund = async (fund) => {
    try {
      await fetchAPI(`/api/funds/${fund.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_archived: !fund.is_archived })
      });
      addToast(`Fund "${fund.name}" ${fund.is_archived ? 'restored' : 'archived'}.`, "info");
      fetchData();
    } catch (err) {
      addToast(err.message, "error");
    }
  };

  // User Management Handlers
  const handleAddUser = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetchAPI('/api/users', {
        method: 'POST',
        body: JSON.stringify(userForm)
      });
      addToast(`User account created for ${userForm.email}.`, "success");
      setUserModalOpen(false);
      setUserForm({ name: '', email: '', password: '', role: 'REVIEWER' });
      fetchData();
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleUserStatus = async (targetUser) => {
    const newStatus = targetUser.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await fetchAPI(`/api/users/${targetUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      addToast(`User ${targetUser.email} marked as ${newStatus}.`, "info");
      fetchData();
    } catch (err) {
      addToast(err.message, "error");
    }
  };

  // Organisation Settings Update
  const handleUpdateOrganisation = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const updated = await fetchAPI('/api/organisation', {
        method: 'PUT',
        body: JSON.stringify(org)
      });
      setOrg(updated);
      try {
        localStorage.setItem('masjid_org_profile', JSON.stringify(updated));
      } catch (e) {}
      addToast("Mosque & organisation profile updated successfully.", "success");
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Database Backup Download & Restore
  const handleDownloadBackup = () => {
    window.open('/api/backup', '_blank');
    addToast("Database JSON backup downloaded.", "success");
  };

  const handleRestoreFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target.result);
        const confirmRestore = window.confirm("CAUTION: Restoring will overwrite current database records with the backup file. Proceed?");
        if (!confirmRestore) return;

        setSubmitting(true);
        await fetchAPI('/api/backup', {
          method: 'POST',
          body: JSON.stringify(json)
        });
        addToast("Database backup successfully restored!", "success");
        fetchData();
      } catch (err) {
        addToast(`Restore failed: ${err.message}`, "error");
      } finally {
        setSubmitting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleResetDatabase = async () => {
    const confirmReset = window.confirm(
      "⚠️ DANGER: Are you sure you want to reset the database to a fresh state?\n\nThis will clear all transactions, splits, and sample donors so you can start from scratch. Your login will be preserved.\n\nThis action cannot be undone."
    );
    if (!confirmReset) return;

    setSubmitting(true);
    try {
      await fetchAPI('/api/backup', { method: 'DELETE' });
      addToast("Database reset to fresh state. Ready for setup!", "success");
      fetchData();
    } catch (err) {
      addToast(`Reset failed: ${err.message}`, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Gift Aid claims CSV export API trigger
  const triggerGiftAidClaimsDownload = () => {
    let url = '/api/reports/giftaid';
    const params = [];
    if (filterDateFrom) params.push(`dateFrom=${filterDateFrom}`);
    if (filterDateTo) params.push(`dateTo=${filterDateTo}`);
    if (params.length > 0) url += `?${params.join('&')}`;
    window.open(url, '_blank');
  };

  // Full Ledger CSV Download
  const triggerLedgerDownload = () => {
    let url = '/api/transactions?format=csv';
    if (filterType !== 'all') url += `&type=${filterType}`;
    if (filterFund !== 'all') url += `&fund=${filterFund}`;
    if (filterCategory !== 'all') url += `&category=${filterCategory}`;
    if (filterStatus !== 'all') url += `&status=${filterStatus}`;
    if (filterSearch) url += `&search=${encodeURIComponent(filterSearch)}`;
    if (filterDateFrom) url += `&dateFrom=${filterDateFrom}`;
    if (filterDateTo) url += `&dateTo=${filterDateTo}`;
    if (filterJummahOnly) url += `&jummahOnly=true`;
    window.open(url, '_blank');
  };

  // Category and Form Configs
  const INCOME_CATEGORIES = ["Donation", "Zakat", "Fitrana", "Madrasah Fees", "Event Tickets", "Interest", "Other"];
  const EXPENSE_CATEGORIES = ["Utilities", "Salaries", "Maintenance", "Charitable Payout", "Office Supplies", "Travel", "Other"];

  const handleFormChange = (e) => {
    const { id, value, type, checked } = e.target;
    const key = id.replace('tx-', '');
    
    setTxForm(prev => {
      let updated = { ...prev, [key]: type === 'checkbox' ? checked : value };
      
      if (key === 'category' && value === 'Interest') {
        const ribaFund = balances.find(b => b.fundName === 'Interest/Riba');
        updated.fundId = ribaFund ? ribaFund.fundId : prev.fundId;
      }

      if (key === 'donorId') {
        if (value === 'anonymous') {
          updated.giftAid = false;
        } else {
          const donor = donors.find(d => d.id === value);
          if (donor) updated.giftAid = donor.gift_aid_eligible;
        }
      }
      return updated;
    });
  };

  // Real Dynamic 6-Month Inflow/Outflow Chart Calculation
  const trendChartData = useMemo(() => {
    const months = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = d.toLocaleString('default', { month: 'short' });
      months.push({ key, label: monthLabel, inflow: 0, outflow: 0 });
    }

    allTransactions.forEach(t => {
      if (t.status === 'VOIDED' || t.status === 'FAILED') return;
      const txMonthKey = (t.transaction_date || '').substring(0, 7);
      const match = months.find(m => m.key === txMonthKey);
      if (match) {
        const amt = parseFloat(t.total_amount) || 0;
        if (t.type === 'INCOME') {
          match.inflow += amt;
        } else {
          match.outflow += amt;
        }
      }
    });

    return months;
  }, [allTransactions]);

  const renderTrendChart = () => {
    const width = 500;
    const height = 240;
    const padding = 40;
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;

    const maxVal = Math.max(
      ...trendChartData.map(m => Math.max(m.inflow, m.outflow)),
      500
    ) * 1.15;

    const gridLines = [];
    for (let i = 0; i <= 4; i++) {
      const y = padding + chartHeight - (i * chartHeight / 4);
      const val = Math.round(i * maxVal / 4);
      gridLines.push(
        <g key={`grid-${i}`}>
          <line x1={padding} y1={y} x2={width - padding} y2={y} className="chart-grid-line" stroke="var(--border-color)" strokeDasharray="3 3" />
          <text x={padding - 8} y={y + 4} textAnchor="end" className="chart-text" fontSize="11" fill="var(--text-secondary)">{org.currency_symbol || '£'}{val}</text>
        </g>
      );
    }

    const colWidth = chartWidth / trendChartData.length;
    const barWidth = colWidth * 0.35;

    const bars = trendChartData.map((item, idx) => {
      const x = padding + (idx * colWidth);
      const infH = (item.inflow / maxVal) * chartHeight;
      const outH = (item.outflow / maxVal) * chartHeight;

      return (
        <g key={`month-${idx}`}>
          <text x={x + colWidth / 2} y={height - padding + 18} textAnchor="middle" className="chart-text" fontSize="12" fill="var(--text-secondary)">{item.label}</text>
          
          <rect
            x={x + (colWidth * 0.1)}
            y={padding + chartHeight - infH}
            width={barWidth}
            height={Math.max(infH, 2)}
            rx={3}
            fill="#10b981"
          >
            <title>{`${item.label} Inflow: ${org.currency_symbol || '£'}${item.inflow.toFixed(2)}`}</title>
          </rect>

          <rect
            x={x + (colWidth * 0.1) + barWidth + 4}
            y={padding + chartHeight - outH}
            width={barWidth}
            height={Math.max(outH, 2)}
            rx={3}
            fill="#ef4444"
          >
            <title>{`${item.label} Outflow: ${org.currency_symbol || '£'}${item.outflow.toFixed(2)}`}</title>
          </rect>
        </g>
      );
    });

    return (
      <>
        {gridLines}
        {bars}
      </>
    );
  };

  // Donut SVG Builder for Fund Allocation
  const renderDonutChart = () => {
    const activeBalances = balances.filter(b => b.balance > 0 && b.fundName !== 'Interest/Riba');
    const total = activeBalances.reduce((sum, b) => sum + b.balance, 0);

    if (total === 0) {
      return <text x="120" y="120" textAnchor="middle" className="chart-text" fill="var(--text-secondary)">No active funds</text>;
    }

    const colors = ["#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#14b8a6"];
    let currentAngle = -Math.PI / 2;
    const cx = 120;
    const cy = 120;
    const r = 80;

    return activeBalances.map((b, idx) => {
      const percentage = b.balance / total;
      const angle = percentage * 2 * Math.PI;

      const x1 = cx + r * Math.cos(currentAngle);
      const y1 = cy + r * Math.sin(currentAngle);
      const x2 = cx + r * Math.cos(currentAngle + angle);
      const y2 = cy + r * Math.sin(currentAngle + angle);

      const largeArc = percentage > 0.5 ? 1 : 0;
      currentAngle += angle;

      return (
        <path
          key={b.fundId}
          d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
          fill="none"
          stroke={colors[idx % colors.length]}
          strokeWidth="16"
          className="donut-slice"
        >
          <title>{`${b.fundName}: ${org.currency_symbol || '£'}${b.balance.toFixed(2)} (${Math.round(percentage * 100)}%)`}</title>
        </path>
      );
    });
  };

  // P&L Statement compilation
  const pl = useMemo(() => {
    const income = {};
    const opExpense = {};
    const restrictedDisb = {};

    let totalInc = 0;
    let totalOp = 0;
    let totalRest = 0;

    transactions.forEach(t => {
      if (t.status === 'VOIDED' || t.status === 'FAILED') return;
      const amt = parseFloat(t.total_amount) || 0;
      const cat = t.category || (t.type === 'INCOME' ? 'Donation' : 'Other');
      
      if (t.type === 'INCOME') {
        income[cat] = (income[cat] || 0) + amt;
        totalInc += amt;
      } else {
        const isRestricted = t.splits?.some(s => s.fundName === 'Zakat' || s.fundName === 'Fitrana');
        if (isRestricted) {
          restrictedDisb[cat] = (restrictedDisb[cat] || 0) + amt;
          totalRest += amt;
        } else {
          opExpense[cat] = (opExpense[cat] || 0) + amt;
          totalOp += amt;
        }
      }
    });

    return { income, opExpense, restrictedDisb, totalInc, totalOp, totalRest };
  }, [transactions]);

  // Paginated Transactions
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return transactions.slice(start, start + itemsPerPage);
  }, [transactions, currentPage]);

  const totalPages = Math.ceil(transactions.length / itemsPerPage) || 1;

  // Receipt Generator Template States
  const [receiptDoc, setReceiptDoc] = useState({
    number: 'MASJID-2026-0001',
    type: 'receipt',
    date: new Date().toISOString().substring(0, 10),
    donorId: '',
    from: `${org.name}\n${org.address}\nCharity Reg No: ${org.charity_number}\n${org.email}`,
    to: '',
    items: [{ desc: 'General Lillah Donation', amount: 250.00, qty: 1 }],
    giftAid: false
  });

  // Keep issuer info updated with org
  useEffect(() => {
    setReceiptDoc(prev => ({
      ...prev,
      from: `${org.name}\n${org.address}\nCharity Reg No: ${org.charity_number}\n${org.email}`
    }));
  }, [org]);

  const updateReceiptDoc = (fields) => {
    setReceiptDoc(prev => {
      const updated = { ...prev, ...fields };
      if (fields.donorId) {
        const d = donors.find(donor => donor.id === fields.donorId);
        if (d) {
          const addr = [d.address_line_1, d.address_line_2, d.city, d.postcode].filter(Boolean).join(', ');
          updated.to = `${d.name}\n${addr || 'No Address Specified'}\nGift Aid Signed: ${d.gift_aid_eligible ? 'YES' : 'NO'}`;
          updated.giftAid = d.gift_aid_eligible;
        }
      }
      return updated;
    });
  };

  const loadTxIntoReceipt = (tx) => {
    const donor = donors.find(d => d.id === tx.donor_id);
    const donorAddr = donor ? [donor.address_line_1, donor.address_line_2, donor.city, donor.postcode].filter(Boolean).join(', ') : 'Anonymous';
    
    setReceiptDoc({
      number: `REC-${tx.id.replace('tx-', '')}`,
      type: 'receipt',
      date: tx.transaction_date,
      donorId: tx.donor_id,
      from: `${org.name}\n${org.address}\nCharity Reg No: ${org.charity_number}\n${org.email}`,
      to: `${tx.donorName || 'Anonymous'}\n${donorAddr}\nGift Aid Declaration: ${tx.giftAid ? 'YES' : 'NO'}`,
      items: [{
        desc: `${tx.category || 'Donation'} (${tx.reference_note || tx.description || 'General'})`,
        amount: parseFloat(tx.total_amount),
        qty: 1
      }],
      giftAid: !!tx.giftAid
    });

    setActiveTab('receipts');
    addToast(`Transaction ${tx.id} loaded into receipt builder.`, "info");
  };

  return (
    <div className="app-container">
      {/* Toast Notification Container */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span>{t.message}</span>
            <button className="toast-close" onClick={() => removeToast(t.id)}>&times;</button>
          </div>
        ))}
      </div>

      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px', borderRadius: '10px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                <path d="M12 3L3 8.5L12 14L21 8.5L12 3Z" fill="white" />
                <path d="M3 13.5L12 19L21 13.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 8.5V14" stroke="#047857" strokeWidth="2" />
              </svg>
            </div>
            <div className="logo-meta">
              <span className="logo-text">{org.short_name || 'Masjid'} <span className="highlight" style={{ color: 'var(--primary)' }}>Finance</span></span>
              <span className="logo-subtext" style={{ fontSize: '0.72rem', color: 'var(--text-light)', maxWidth: '160px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {org.name}
              </span>
            </div>
          </div>
        </div>

        <nav className="sidebar-menu">
          <button className={`menu-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => handleTabSwitch('dashboard')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="menu-icon">
              <rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" />
              <rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" />
            </svg>
            <span>Dashboard</span>
          </button>
          
          <button className={`menu-item ${activeTab === 'transactions' ? 'active' : ''}`} onClick={() => handleTabSwitch('transactions')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="menu-icon">
              <rect x="2" y="5" width="20" height="14" rx="2" ry="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
              <line x1="8" y1="15" x2="16" y2="15" />
            </svg>
            <span>Transactions Ledger</span>
          </button>

          <button className={`menu-item ${activeTab === 'donors' ? 'active' : ''}`} onClick={() => handleTabSwitch('donors')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="menu-icon">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>Donors &amp; Gift Aid</span>
          </button>

          <button className={`menu-item ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => handleTabSwitch('reports')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="menu-icon">
              <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span>Reports &amp; Audits</span>
          </button>

          <button className={`menu-item ${activeTab === 'receipts' ? 'active' : ''}`} onClick={() => handleTabSwitch('receipts')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="menu-icon">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <span>Receipt Generator</span>
          </button>

          {user.role === 'ADMIN' && (
            <button className={`menu-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => handleTabSwitch('settings')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="menu-icon">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span>Settings &amp; Admin</span>
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Signed in as</span>
            <strong style={{ fontSize: '0.85rem', color: '#ffffff' }}>{user.name || user.email}</strong>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{user.email}</span>
            <button className="btn btn-secondary btn-sm" onClick={handleLogout} style={{ marginTop: '8px', padding: '6px 10px', justifyContent: 'center' }}>
              🚪 Log Out
            </button>
          </div>

          <div className="theme-switch-container">
            <label className="theme-label" htmlFor="theme-sel">Theme</label>
            <select id="theme-sel" className="theme-selector" value={theme} onChange={handleThemeChange}>
              <option value="system">⚡ System</option>
              <option value="light">☀️ Light</option>
              <option value="dark">🌙 Dark</option>
            </select>
          </div>
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="main-content">
        <header className="main-header">
          <div className="header-brand-title">
            <h2 className={`badge ${user.role === 'ADMIN' ? 'badge-admin' : user.role === 'REVIEWER' ? 'badge-reviewer' : 'badge-auditor'}`}>
              {user.role === 'ADMIN' ? '🛡️ Financial Secretary (Admin)' : user.role === 'REVIEWER' ? '👁️ Trustee (Read-Only)' : '🔍 Auditor (Read-Only)'}
            </h2>
          </div>
          {user.role === 'ADMIN' && (
            <div className="header-actions">
              <button className="btn btn-secondary" onClick={() => setJummahModalOpen(true)}>🕌 Log Jummah</button>
              <button className="btn btn-primary" onClick={() => setTxModalOpen(true)}>+ Add Transaction</button>
            </div>
          )}
        </header>

        <div className="scrollable-content">
          <div className="alerts-container">
            {allTransactions.filter(t => t.status === 'PENDING' && t.type === 'INCOME').length > 0 && (
              <div className="alert alert-warning">
                <span>⚠️ <strong>Unbanked Cash Alert:</strong> There is <strong>{org.currency_symbol || '£'}{consolidated.cashTotal.toFixed(2)}</strong> held as Cash on Hand. Deposit at bank and click "Banked" in the ledger.</span>
              </div>
            )}
            
            {consolidated.ribaBalance > 0 && (
              <div className="alert alert-info" style={{ borderColor: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)' }}>
                <span>⚖️ <strong>Interest / Riba Purging Notice:</strong> {org.currency_symbol || '£'}{consolidated.ribaBalance.toFixed(2)} in unlawful bank interest is segregated. Under Shariah rules, this must be disposed of to public charities without the intention of spiritual reward.</span>
              </div>
            )}
          </div>

          {/* 1. DASHBOARD VIEW */}
          {activeTab === 'dashboard' && (
            <section className="content-view active-view">
              <div className="view-header">
                <div>
                  <h1 className="view-title">{org.name}</h1>
                  <p className="view-subtitle">Islamic Restricted and Unrestricted fund balances &amp; live financial summary</p>
                </div>
                <div className="date-badge">
                  {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
                </div>
              </div>

              <div className="balances-summary-grid">
                <div className="balance-summary-card main-summary">
                  <span className="card-tag">Consolidated</span>
                  <h2>Total Net Funds</h2>
                  <span className="balance-amount">{org.currency_symbol || '£'}{consolidated.total.toFixed(2)}</span>
                  <div className="balance-meta-split">
                    <span>Bank: <strong>{org.currency_symbol || '£'}{consolidated.bankTotal.toFixed(2)}</strong></span>
                    <span>Cash on Hand: <strong>{org.currency_symbol || '£'}{consolidated.cashTotal.toFixed(2)}</strong></span>
                  </div>
                </div>

                <div className="balance-summary-card restricted-sum">
                  <span className="card-tag restricted">Restricted</span>
                  <h2>Zakat &amp; Fitrana</h2>
                  <span className="balance-amount">{org.currency_symbol || '£'}{consolidated.restricted.toFixed(2)}</span>
                  <p className="fund-subinfo">Reserved strictly for eligible Asnaf recipients.</p>
                </div>

                <div className="balance-summary-card unrestricted-sum">
                  <span className="card-tag unrestricted">Unrestricted</span>
                  <h2>Lillah &amp; Operations</h2>
                  <span className="balance-amount">{org.currency_symbol || '£'}{consolidated.unrestricted.toFixed(2)}</span>
                  <p className="fund-subinfo">Available for utilities, bills, imam salaries, and maintenance.</p>
                </div>
              </div>

              <h3 className="section-title">Islamic Fund Wallets</h3>
              <div className="funds-grid">
                {balances.filter(b => !b.isArchived).map(b => (
                  <div key={b.fundId} className="fund-wallet-card">
                    <div className="wallet-header">
                      <span className="wallet-name">{b.fundName}</span>
                      <span className={`wallet-type ${b.isRestricted ? 'type-restricted' : 'type-unrestricted'}`}>
                        {b.isRestricted ? 'Restricted' : 'Unrestricted'}
                      </span>
                    </div>
                    <span className="wallet-val">{org.currency_symbol || '£'}{b.balance.toFixed(2)}</span>
                    {b.fundName === 'Interest/Riba' && <span className="riba-tooltip">Segregated interest for disposal.</span>}
                  </div>
                ))}
              </div>

              <div className="dashboard-charts-grid">
                <div className="chart-card glass-card">
                  <div className="chart-header">
                    <h3>Financial Inflows vs Outflows (Trailing 6 Months)</h3>
                    <span className="chart-legend">
                      <span className="legend-item"><span className="legend-dot income-dot"></span>Inflow</span>
                      <span className="legend-item"><span className="legend-dot expense-dot"></span>Outflow</span>
                    </span>
                  </div>
                  <div className="chart-body">
                    <svg viewBox="0 0 500 240" className="interactive-chart">
                      {renderTrendChart()}
                    </svg>
                  </div>
                </div>

                <div className="chart-card glass-card small-chart">
                  <div className="chart-header">
                    <h3>Fund Allocation</h3>
                  </div>
                  <div className="chart-body donut-chart-body">
                    <svg viewBox="0 0 240 240" className="interactive-chart">
                      {renderDonutChart()}
                    </svg>
                  </div>
                  <div className="chart-category-legend">
                    {balances.filter(b => b.balance > 0 && b.fundName !== 'Interest/Riba' && !b.isArchived).map((b, idx) => (
                      <div key={b.fundId} className="legend-row">
                        <div className="legend-row-label">
                          <span className="legend-color-box" style={{ backgroundColor: ["#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#14b8a6"][idx % 7] }}></span>
                          <span>{b.fundName}</span>
                        </div>
                        <strong>{org.currency_symbol || '£'}{b.balance.toFixed(2)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="dashboard-table-card glass-card">
                <div className="table-card-header">
                  <h3>Recent Ledger Activities</h3>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleTabSwitch('transactions')}>Open Full Ledger</button>
                </div>
                <div className="table-wrapper">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Fund</th>
                        <th>Category</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allTransactions.slice(0, 5).map(tx => (
                        <tr key={tx.id} className={tx.status === 'VOIDED' ? 'tr-voided' : tx.status === 'FAILED' ? 'tr-failed' : ''}>
                          <td>{tx.transaction_date}</td>
                          <td>
                            <strong>{tx.reference_note || tx.description}</strong>
                            {tx.status === 'VOIDED' && tx.void_reason && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--danger)' }}>Void Reason: {tx.void_reason}</div>
                            )}
                          </td>
                          <td>{tx.splits?.map(s => `${s.fundName}: ${org.currency_symbol || '£'}${s.amount}`).join(', ')}</td>
                          <td>{tx.category || 'Donation'}</td>
                          <td className={tx.type === 'INCOME' ? 'val-income' : 'val-expense'}>
                            {tx.type === 'INCOME' ? '+' : '-'}{org.currency_symbol || '£'}{parseFloat(tx.total_amount).toFixed(2)}
                          </td>
                          <td>
                            <span className={`status-badge ${tx.status === 'PENDING' ? 'status-cash' : tx.status === 'BANKED' ? 'status-banked' : tx.status === 'VOIDED' ? 'status-voided' : 'status-failed'}`}>
                              {tx.status === 'PENDING' ? 'Cash on Hand' : tx.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* 2. TRANSACTIONS LEDGER VIEW */}
          {activeTab === 'transactions' && (
            <section className="content-view active-view">
              <div className="view-header">
                <div>
                  <h1 className="view-title">Transaction Ledger</h1>
                  <p className="view-subtitle">Audit-safe double-entry ledger with multi-fund splits and reconciliation locks</p>
                </div>
                <div className="header-actions">
                  <button className="btn btn-secondary" onClick={triggerLedgerDownload}>📥 Export CSV</button>
                  {user.role === 'ADMIN' && (
                    <button className="btn btn-primary" onClick={() => setTxModalOpen(true)}>+ Add Transaction</button>
                  )}
                </div>
              </div>

              {/* Jummah Collection Quick Banner */}
              <div className="jummah-banner">
                <div className="jummah-banner-text">
                  <h3>🕌 Jummah Cash Management</h3>
                  <p>Filter Friday collections with witness counter signatures, verify counting slips, and update bank deposit status.</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    className={`btn btn-sm ${filterJummahOnly ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setFilterJummahOnly(!filterJummahOnly)}
                  >
                    {filterJummahOnly ? '✓ Showing Jummah Only' : 'Filter Jummah Collections'}
                  </button>
                  {user.role === 'ADMIN' && (
                    <button className="btn btn-primary btn-sm" onClick={() => setJummahModalOpen(true)}>
                      + Log Friday Cash
                    </button>
                  )}
                </div>
              </div>

              {/* Advanced Filter Toolbar */}
              <div className="filter-toolbar glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                  <div className="filter-group">
                    <label>Type</label>
                    <select className="form-control-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
                      <option value="all">All Types</option>
                      <option value="income">Income (+)</option>
                      <option value="expense">Expense (-)</option>
                    </select>
                  </div>

                  <div className="filter-group">
                    <label>Fund</label>
                    <select className="form-control-sm" value={filterFund} onChange={e => setFilterFund(e.target.value)}>
                      <option value="all">All Funds</option>
                      {balances.map(b => (
                        <option key={b.fundId} value={b.fundId}>{b.fundName}</option>
                      ))}
                    </select>
                  </div>

                  <div className="filter-group">
                    <label>Category</label>
                    <select className="form-control-sm" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                      <option value="all">All Categories</option>
                      {[...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].filter((v, i, a) => a.indexOf(v) === i).map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div className="filter-group">
                    <label>Status</label>
                    <select className="form-control-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                      <option value="all">All Statuses</option>
                      <option value="Active">Active (Non-Voided)</option>
                      <option value="Cash on Hand">Cash on Hand</option>
                      <option value="Banked">Banked</option>
                      <option value="Voided">Voided</option>
                    </select>
                  </div>

                  <div className="filter-group search-filter" style={{ flexGrow: 1 }}>
                    <label>Search Keyword</label>
                    <input type="text" className="form-control-sm" placeholder="Search description, donor, notes..." value={filterSearch} onChange={e => setFilterSearch(e.target.value)} />
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Period:</span>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '3px 8px', fontSize: '0.75rem' }} onClick={() => setQuickDateRange('all')}>All Time</button>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '3px 8px', fontSize: '0.75rem' }} onClick={() => setQuickDateRange('this_month')}>This Month</button>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '3px 8px', fontSize: '0.75rem' }} onClick={() => setQuickDateRange('last_3_months')}>Last 3 Months</button>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ padding: '3px 8px', fontSize: '0.75rem' }} onClick={() => setQuickDateRange('uk_tax_year')}>UK Tax Year</button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                    <label style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>From:</label>
                    <input type="date" className="form-control-sm" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={{ padding: '3px 6px', fontSize: '0.75rem' }} />
                    <label style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>To:</label>
                    <input type="date" className="form-control-sm" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={{ padding: '3px 6px', fontSize: '0.75rem' }} />
                  </div>
                </div>
              </div>

              <div className="full-ledger-card glass-card">
                <div className="table-wrapper">
                  <table className="ledger-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Donor</th>
                        <th>Fund Allocation</th>
                        <th>Category</th>
                        <th>Method</th>
                        <th>Status</th>
                        <th>Amount</th>
                        <th className="actions-col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTransactions.length === 0 ? (
                        <tr>
                          <td colSpan="9" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                            No transactions match the selected filters.
                          </td>
                        </tr>
                      ) : (
                        paginatedTransactions.map(tx => {
                          const isIncome = tx.type === 'INCOME';
                          return (
                            <tr key={tx.id} className={`${tx.status === 'VOIDED' ? 'tr-voided' : tx.status === 'FAILED' ? 'tr-failed' : ''} ${tx.reconciled ? 'tr-reconciled' : ''}`}>
                              <td style={{ whiteSpace: 'nowrap' }}>{tx.transaction_date}</td>
                              <td>
                                <strong>{tx.reference_note || tx.description}</strong>
                                {tx.notes && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{tx.notes}</div>}
                                {tx.status === 'VOIDED' && tx.void_reason && (
                                  <div style={{ fontSize: '0.72rem', color: 'var(--danger)', fontWeight: 600 }}>VOID REASON: {tx.void_reason}</div>
                                )}
                              </td>
                              <td>
                                <span>{tx.donorName}</span>
                                {tx.giftAid && <span style={{ marginLeft: '4px', fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 700 }}>[GA]</span>}
                              </td>
                              <td>{tx.splits?.map(s => `${s.fundName}: ${org.currency_symbol || '£'}${s.amount}`).join(', ')}</td>
                              <td>{tx.category || 'Donation'}</td>
                              <td>{tx.method?.replace('_', ' ')}</td>
                              <td>
                                <span className={`status-badge ${tx.status === 'PENDING' ? 'status-cash' : tx.status === 'BANKED' ? 'status-banked' : tx.status === 'VOIDED' ? 'status-voided' : 'status-failed'}`}>
                                  {tx.status === 'PENDING' ? 'Cash on Hand' : tx.status}
                                </span>
                              </td>
                              <td className={isIncome ? 'val-income' : 'val-expense'} style={{ fontWeight: 700 }}>
                                {isIncome ? '+' : '-'}{org.currency_symbol || '£'}{parseFloat(tx.total_amount).toFixed(2)}
                              </td>
                              <td className="actions-col">
                                <div className="actions-btn-group">
                                  {isIncome && tx.status !== 'VOIDED' && (
                                    <button className="action-btn" title="Generate Receipt" onClick={() => loadTxIntoReceipt(tx)}>🧾</button>
                                  )}
                                  {user.role === 'ADMIN' && !tx.reconciled && tx.status !== 'VOIDED' && (
                                    <>
                                      {tx.status === 'PENDING' && tx.type === 'INCOME' && (
                                        <button className="action-btn" onClick={() => handleBankDeposit(tx.id)} title="Mark as Banked">🏦 Banked</button>
                                      )}
                                      <button className="action-btn" onClick={() => handleReconcileLock(tx.id)} title="Reconcile &amp; Lock">🔒 Lock</button>
                                      <button className="action-btn btn-void" onClick={() => openVoidModal(tx)} title="Void Transaction">⚠️ Void</button>
                                    </>
                                  )}
                                  {tx.reconciled && (
                                    <span className="status-badge status-active">🔒 Locked</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Toolbar */}
                {totalPages > 1 && (
                  <div className="pagination-container">
                    <span>Showing {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, transactions.length)} of {transactions.length} entries</span>
                    <div className="pagination-btn-group">
                      <button 
                        className="pagination-btn" 
                        disabled={currentPage === 1} 
                        onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                      >
                        &laquo; Prev
                      </button>
                      <span style={{ fontWeight: 600, padding: '0 8px' }}>Page {currentPage} of {totalPages}</span>
                      <button 
                        className="pagination-btn" 
                        disabled={currentPage === totalPages} 
                        onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                      >
                        Next &raquo;
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 3. DONORS & GIFT AID VIEW */}
          {activeTab === 'donors' && (
            <section className="content-view active-view">
              <div className="view-header">
                <div>
                  <h1 className="view-title">Donors &amp; UK Gift Aid</h1>
                  <p className="view-subtitle">HMRC Gift Aid schedule exporter &amp; GDPR-compliant donor registry</p>
                </div>
                {user.role === 'ADMIN' && (
                  <button className="btn btn-primary" onClick={() => setDonorModalOpen(true)}>+ New Donor</button>
                )}
              </div>

              <div className="donors-layout-grid">
                <div className="donors-list-card glass-card">
                  <h3>Registered Donors ({donors.filter(d => d.id !== 'anonymous').length})</h3>
                  <div className="table-wrapper">
                    <table className="ledger-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Address</th>
                          <th>Postcode</th>
                          <th>Gift Aid Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {donors.filter(d => d.id !== 'anonymous').map(d => (
                          <tr key={d.id}>
                            <td><strong>{d.name}</strong></td>
                            <td>{[d.address_line_1, d.address_line_2, d.city].filter(Boolean).join(', ') || 'N/A'}</td>
                            <td><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{d.postcode || '—'}</span></td>
                            <td>
                              <span className={`status-badge ${d.gift_aid_eligible ? 'status-active' : 'status-voided'}`}>
                                {d.gift_aid_eligible ? '✓ Signed Declaration' : '✗ Unsigned'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="gift-aid-panel glass-card">
                  <h3>HMRC Gift Aid Claims Assistant</h3>
                  <p className="info-p">Generate HMRC Gift Aid claim schedules on eligible donations with signed declarations and valid UK postcodes.</p>
                  
                  <div className="claim-stats">
                    <div className="claim-stat">
                      <span>Eligible Claims:</span>
                      <strong>{transactions.filter(t => t.type === 'INCOME' && t.status !== 'VOIDED' && t.status !== 'FAILED' && t.giftAid).length}</strong>
                    </div>
                    <div className="claim-stat">
                      <span>Donation Value:</span>
                      <strong>
                        {org.currency_symbol || '£'}{transactions.filter(t => t.type === 'INCOME' && t.status !== 'VOIDED' && t.status !== 'FAILED' && t.giftAid)
                          .reduce((sum, t) => sum + parseFloat(t.total_amount), 0).toFixed(2)}
                      </strong>
                    </div>
                    <div className="claim-stat">
                      <span>HMRC Rebate (25p per £1):</span>
                      <strong className="text-success" style={{ color: '#10b981' }}>
                        {org.currency_symbol || '£'}{(transactions.filter(t => t.type === 'INCOME' && t.status !== 'VOIDED' && t.status !== 'FAILED' && t.giftAid)
                          .reduce((sum, t) => sum + parseFloat(t.total_amount), 0) * 0.25).toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  <button className="btn btn-primary btn-block" onClick={triggerGiftAidClaimsDownload}>
                    📥 Export HMRC Gift Aid Schedule (CSV)
                  </button>

                  <h4 style={{ marginTop: '20px' }}>Eligible Donations in Active Ledger</h4>
                  <div className="table-wrapper ga-table-wrapper">
                    <table className="ledger-table mini-table">
                      <thead>
                        <tr>
                          <th>Donor</th>
                          <th>Postcode</th>
                          <th>Date</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.filter(t => t.type === 'INCOME' && t.status !== 'VOIDED' && t.status !== 'FAILED' && t.giftAid).map(t => (
                          <tr key={t.id}>
                            <td>{t.donorName}</td>
                            <td>{donors.find(d => d.id === t.donor_id)?.postcode || ''}</td>
                            <td>{t.transaction_date}</td>
                            <td>{org.currency_symbol || '£'}{parseFloat(t.total_amount).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 4. REPORTS & AUDITS VIEW */}
          {activeTab === 'reports' && (
            <section className="content-view active-view">
              <div className="view-header">
                <div>
                  <h1 className="view-title">Financial Statements &amp; Audit Logs</h1>
                  <p className="view-subtitle">Income &amp; Expenditure statement, Shariah compliance breakdown, and immutable audit trails</p>
                </div>
                <div className="header-actions">
                  <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Print Statement</button>
                </div>
              </div>

              <div className="reports-container-grid">
                <div className="report-block glass-card print-report-area">
                  <div className="report-block-header">
                    <h2>{org.name}</h2>
                    <h3>Income &amp; Expenditure Statement</h3>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Charity Reg No. {org.charity_number} &bull; Reporting Date: {new Date().toLocaleDateString('en-GB')}
                    </span>
                  </div>
                  
                  <div className="pl-statement">
                    <div className="pl-section">
                      <h4 className="pl-section-title">1. Incoming Resources (Income)</h4>
                      <div className="pl-rows">
                        {Object.keys(pl.income).length === 0 ? (
                          <div className="pl-row"><span>No income recorded</span><span>{org.currency_symbol || '£'}0.00</span></div>
                        ) : (
                          Object.keys(pl.income).map(cat => (
                            <div key={cat} className="pl-row">
                              <span>{cat}</span>
                              <span>{org.currency_symbol || '£'}{pl.income[cat].toFixed(2)}</span>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="pl-row pl-total-row">
                        <span>Total Incoming Resources</span>
                        <span>{org.currency_symbol || '£'}{pl.totalInc.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="pl-section">
                      <h4 className="pl-section-title">2. Operational Expenses (Lillah &amp; Unrestricted)</h4>
                      <div className="pl-rows">
                        {Object.keys(pl.opExpense).length === 0 ? (
                          <div className="pl-row"><span>No operating expenses</span><span>{org.currency_symbol || '£'}0.00</span></div>
                        ) : (
                          Object.keys(pl.opExpense).map(cat => (
                            <div key={cat} className="pl-row">
                              <span>{cat}</span>
                              <span className="expense-val">{org.currency_symbol || '£'}{pl.opExpense[cat].toFixed(2)}</span>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="pl-row pl-total-row">
                        <span>Total Operating Costs</span>
                        <span className="expense-val">{org.currency_symbol || '£'}{pl.totalOp.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="pl-section">
                      <h4 className="pl-section-title">3. Charitable Disbursements (Restricted Zakat &amp; Fitrana)</h4>
                      <div className="pl-rows">
                        {Object.keys(pl.restrictedDisb).length === 0 ? (
                          <div className="pl-row"><span>No restricted payouts</span><span>{org.currency_symbol || '£'}0.00</span></div>
                        ) : (
                          Object.keys(pl.restrictedDisb).map(cat => (
                            <div key={cat} className="pl-row">
                              <span>{cat}</span>
                              <span className="expense-val">{org.currency_symbol || '£'}{pl.restrictedDisb[cat].toFixed(2)}</span>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="pl-row pl-total-row">
                        <span>Total Restricted Payouts</span>
                        <span className="expense-val">{org.currency_symbol || '£'}{pl.totalRest.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="pl-section pl-net-income-section">
                      <div className="pl-row pl-net-income-row">
                        <span>Net Surplus / (Deficit)</span>
                        <span className={pl.totalInc - pl.totalOp - pl.totalRest >= 0 ? 'text-success' : 'expense-val'} style={{ fontWeight: 800 }}>
                          {org.currency_symbol || '£'}{(pl.totalInc - pl.totalOp - pl.totalRest).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="report-side-column">
                  <div className="analytics-stat-card glass-card">
                    <h3>Fund Segregation Compliance</h3>
                    <div className="compliance-metric">
                      <span>Zakat Fund:</span>
                      <strong>{org.currency_symbol || '£'}{(balances.find(b => b.fundName === 'Zakat')?.balance || 0).toFixed(2)}</strong>
                    </div>
                    <div className="compliance-metric">
                      <span>Fitrana Fund:</span>
                      <strong>{org.currency_symbol || '£'}{(balances.find(b => b.fundName === 'Fitrana')?.balance || 0).toFixed(2)}</strong>
                    </div>
                    <div className="compliance-metric">
                      <span>Interest/Riba Segregated:</span>
                      <strong className="expense-val">{org.currency_symbol || '£'}{(balances.find(b => b.fundName === 'Interest/Riba')?.balance || 0).toFixed(2)}</strong>
                    </div>
                    <hr style={{ borderColor: 'var(--border-color)', margin: '12px 0' }} />
                    <p className="micro-text" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      🔒 Shariah Compliance: Restricted funds (Zakat &amp; Fitrana) cannot be disbursed for general utility bills, capital repairs, or administrative expenses.
                    </p>
                  </div>

                  <div className="analytics-stat-card glass-card">
                    <h3>Immutable System Audit Logs</h3>
                    <div className="audit-timeline" style={{ maxHeight: '360px', overflowY: 'auto' }}>
                      {audits.slice(0, 20).map(log => (
                        <div key={log.id} className="timeline-item" style={{ padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                          <span className="timeline-time" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block' }}>
                            {new Date(log.timestamp).toLocaleString('en-GB')} by <strong>{log.userEmail || log.userName || log.user_id}</strong>
                          </span>
                          <span className="timeline-desc" style={{ fontSize: '0.8rem' }}>
                            {`Action ${log.action} on ${log.table_name} [${log.record_id}]`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 5. RECEIPTS VIEW */}
          {activeTab === 'receipts' && (
            <section className="content-view active-view">
              <div className="view-header">
                <div>
                  <h1 className="view-title">Receipt &amp; Invoice Builder</h1>
                  <p className="view-subtitle">Generate branded donation receipts and vendor payment documentation</p>
                </div>
              </div>

              <div className="invoice-workspace">
                <div className="invoice-form-panel glass-card">
                  <h3>Document Customizer</h3>
                  <form>
                    <div className="form-row-2">
                      <div className="form-group">
                        <label>Document Ref No.</label>
                        <input type="text" value={receiptDoc.number} onChange={e => updateReceiptDoc({ number: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label>Document Type</label>
                        <select value={receiptDoc.type} onChange={e => updateReceiptDoc({ type: e.target.value })}>
                          <option value="receipt">Official Donation Receipt</option>
                          <option value="invoice">Standard Invoice</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-row-2">
                      <div className="form-group">
                        <label>Issue Date</label>
                        <input type="date" value={receiptDoc.date} onChange={e => updateReceiptDoc({ date: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label>Load Donor Profile</label>
                        <select value={receiptDoc.donorId} onChange={e => updateReceiptDoc({ donorId: e.target.value })}>
                          <option value="">Select Donor...</option>
                          {donors.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="form-divider">Issuer Details (From Mosque Profile)</div>
                    <div className="form-group">
                      <textarea rows="3" value={receiptDoc.from} onChange={e => updateReceiptDoc({ from: e.target.value })} />
                    </div>

                    <div className="form-divider">Recipient Details</div>
                    <div className="form-group">
                      <textarea rows="3" placeholder="Enter recipient details" value={receiptDoc.to} onChange={e => updateReceiptDoc({ to: e.target.value })} />
                    </div>

                    <div className="form-divider">Itemised Value</div>
                    <div className="invoice-item-row">
                      <div className="col-desc">
                        <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Description</label>
                        <input type="text" value={receiptDoc.items[0]?.desc || ''} onChange={e => {
                          const updatedItems = [...receiptDoc.items];
                          updatedItems[0].desc = e.target.value;
                          updateReceiptDoc({ items: updatedItems });
                        }} />
                      </div>
                      <div className="col-rate">
                        <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Amount ({org.currency_symbol || '£'})</label>
                        <input type="number" min="0" step="0.01" value={receiptDoc.items[0]?.amount || 0} onChange={e => {
                          const updatedItems = [...receiptDoc.items];
                          updatedItems[0].amount = parseFloat(e.target.value) || 0;
                          updateReceiptDoc({ items: updatedItems });
                        }} />
                      </div>
                    </div>
                  </form>
                </div>

                <div className="invoice-preview-panel glass-card">
                  <div className="preview-actions">
                    <h4>Document Preview</h4>
                    <button className="btn btn-primary btn-sm" onClick={() => window.print()}>🖨️ Print / Save PDF</button>
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
                          <h2 className="brand-title">{org.name}</h2>
                          <p className="brand-tagline">Charity Reg No: {org.charity_number}</p>
                        </div>
                      </div>
                      <div className="invoice-title-block">
                        <h1 className="invoice-main-title">{receiptDoc.type === 'receipt' ? 'DONATION RECEIPT' : 'INVOICE'}</h1>
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
          )}

          {/* 6. SETTINGS & ADMIN VIEW */}
          {activeTab === 'settings' && user.role === 'ADMIN' && (
            <section className="content-view active-view">
              <div className="view-header">
                <div>
                  <h1 className="view-title">Mosque Settings &amp; Administration</h1>
                  <p className="view-subtitle">Configure organisation profile, custom Islamic funds, staff accounts, and database backups</p>
                </div>
              </div>

              {/* Subtabs navigation */}
              <div className="settings-subnav">
                <button className={`settings-subtab ${settingsSubtab === 'profile' ? 'active' : ''}`} onClick={() => setSettingsSubtab('profile')}>
                  🕌 Mosque Profile
                </button>
                <button className={`settings-subtab ${settingsSubtab === 'funds' ? 'active' : ''}`} onClick={() => setSettingsSubtab('funds')}>
                  💼 Fund Management ({funds.length})
                </button>
                <button className={`settings-subtab ${settingsSubtab === 'users' ? 'active' : ''}`} onClick={() => setSettingsSubtab('users')}>
                  👥 User Accounts ({usersList.length})
                </button>
                <button className={`settings-subtab ${settingsSubtab === 'backup' ? 'active' : ''}`} onClick={() => setSettingsSubtab('backup')}>
                  🛡️ Backup &amp; Recovery
                </button>
              </div>

              {/* Subtab 1: Mosque Profile */}
              {settingsSubtab === 'profile' && (
                <div className="glass-card" style={{ maxWidth: '720px' }}>
                  <h3>Organisation &amp; Charity Details</h3>
                  <p className="info-p" style={{ marginBottom: '20px' }}>These details will be displayed across the software, receipts, and HMRC reports.</p>
                  
                  <form onSubmit={handleUpdateOrganisation}>
                    <div className="form-row-2">
                      <div className="form-group">
                        <label>Mosque / Centre Full Name</label>
                        <input type="text" value={org.name} onChange={e => setOrg({ ...org, name: e.target.value })} required />
                      </div>
                      <div className="form-group">
                        <label>Short Name (Acronym)</label>
                        <input type="text" value={org.short_name} onChange={e => setOrg({ ...org, short_name: e.target.value })} required />
                      </div>
                    </div>

                    <div className="form-row-2">
                      <div className="form-group">
                        <label>Tagline / Subtitle</label>
                        <input type="text" value={org.tagline} onChange={e => setOrg({ ...org, tagline: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label>UK Charity Commission Reg No.</label>
                        <input type="text" value={org.charity_number} onChange={e => setOrg({ ...org, charity_number: e.target.value })} required />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Registered Address</label>
                      <input type="text" value={org.address} onChange={e => setOrg({ ...org, address: e.target.value })} required />
                    </div>

                    <div className="form-row-2">
                      <div className="form-group">
                        <label>Finance Contact Email</label>
                        <input type="email" value={org.email} onChange={e => setOrg({ ...org, email: e.target.value })} required />
                      </div>
                      <div className="form-group">
                        <label>Contact Phone</label>
                        <input type="text" value={org.phone} onChange={e => setOrg({ ...org, phone: e.target.value })} />
                      </div>
                    </div>

                    <div className="form-row-2">
                      <div className="form-group">
                        <label>Currency Symbol</label>
                        <input type="text" value={org.currency_symbol} onChange={e => setOrg({ ...org, currency_symbol: e.target.value })} required />
                      </div>
                      <div className="form-group">
                        <label>Country / Jurisdiction</label>
                        <input type="text" value={org.country} onChange={e => setOrg({ ...org, country: e.target.value })} required />
                      </div>
                    </div>

                    <div className="modal-actions" style={{ marginTop: '24px' }}>
                      <button type="submit" className="btn btn-primary" disabled={submitting}>
                        {submitting ? 'Saving...' : '💾 Save Organisation Profile'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Subtab 2: Fund Management */}
              {settingsSubtab === 'funds' && (
                <div className="glass-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div>
                      <h3>Custom Islamic Funds &amp; Wallets</h3>
                      <p className="info-p">Configure Restricted (Zakat, Fitrana) and Unrestricted (Lillah, Building) fund buckets.</p>
                    </div>
                    <button className="btn btn-primary" onClick={() => setFundModalOpen(true)}>+ Add New Fund</button>
                  </div>

                  <div className="table-wrapper">
                    <table className="ledger-table">
                      <thead>
                        <tr>
                          <th>Fund Name</th>
                          <th>Classification</th>
                          <th>Description</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {funds.map(f => (
                          <tr key={f.id} style={{ opacity: f.is_archived ? 0.6 : 1 }}>
                            <td><strong>{f.name}</strong></td>
                            <td>
                              <span className={`wallet-type ${f.is_restricted ? 'type-restricted' : 'type-unrestricted'}`}>
                                {f.is_restricted ? 'Restricted' : 'Unrestricted'}
                              </span>
                            </td>
                            <td>{f.description || '—'}</td>
                            <td>
                              <span className={`status-badge ${f.is_archived ? 'status-voided' : 'status-active'}`}>
                                {f.is_archived ? 'Archived' : 'Active'}
                              </span>
                            </td>
                            <td>
                              {f.name !== 'Interest/Riba' && f.name !== 'Zakat' && f.name !== 'Fitrana' && (
                                <button 
                                  className="action-btn" 
                                  onClick={() => handleToggleArchiveFund(f)}
                                >
                                  {f.is_archived ? 'Restore' : 'Archive'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Subtab 3: User Management */}
              {settingsSubtab === 'users' && (
                <div className="glass-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div>
                      <h3>User Accounts &amp; Access Controls</h3>
                      <p className="info-p">Manage committee logins for Financial Secretaries (Admin), Trustees (Reviewers), and Auditors.</p>
                    </div>
                    <button className="btn btn-primary" onClick={() => setUserModalOpen(true)}>+ Add User</button>
                  </div>

                  <div className="table-wrapper">
                    <table className="ledger-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Role</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usersList.map(u => (
                          <tr key={u.id} style={{ opacity: u.status === 'INACTIVE' ? 0.6 : 1 }}>
                            <td><strong>{u.name || 'User'}</strong></td>
                            <td>{u.email}</td>
                            <td>
                              <span className={`badge ${u.role === 'ADMIN' ? 'badge-admin' : u.role === 'REVIEWER' ? 'badge-reviewer' : 'badge-auditor'}`}>
                                {u.role === 'ADMIN' ? 'Financial Secretary' : u.role === 'REVIEWER' ? 'Trustee' : 'Auditor'}
                              </span>
                            </td>
                            <td>
                              <span className={`status-badge ${u.status === 'ACTIVE' ? 'status-active' : 'status-voided'}`}>
                                {u.status}
                              </span>
                            </td>
                            <td>
                              {u.id !== user.id && (
                                <button className="action-btn" onClick={() => handleToggleUserStatus(u)}>
                                  {u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Subtab 4: Backup & Recovery */}
              {settingsSubtab === 'backup' && (
                <div className="glass-card" style={{ maxWidth: '720px' }}>
                  <h3>Database Backup &amp; Disaster Recovery</h3>
                  <p className="info-p" style={{ marginBottom: '24px' }}>
                    Safely export complete financial archives or restore from a verified JSON backup snapshot.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div style={{ padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>📥 Download Full JSON Backup</h4>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                        Downloads all transactions, splits, donors, funds, organisation settings, and audit trails in a portable JSON format.
                      </p>
                      <button type="button" className="btn btn-primary" onClick={handleDownloadBackup}>
                        Download Database Backup
                      </button>
                    </div>

                    <div style={{ padding: '20px', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.04)' }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem', color: 'var(--danger)' }}>⚠️ Restore Database from JSON File</h4>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                        Overwrites current ledger records with the uploaded backup snapshot. Recommended to download a backup first.
                      </p>
                      <input 
                        type="file" 
                        accept=".json" 
                        ref={fileInputRef} 
                        onChange={handleRestoreFileSelect}
                        style={{ display: 'none' }} 
                      />
                      <button 
                        type="button" 
                        className="btn btn-secondary" 
                        style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={submitting}
                      >
                        {submitting ? 'Restoring...' : 'Upload & Restore Backup JSON'}
                      </button>
                    </div>

                    <div style={{ padding: '20px', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.06)' }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem', color: 'var(--danger)' }}>🗑️ Reset Database (Start from Scratch)</h4>
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                        Wipes all sample transactions, splits, and donors, leaving a clean ledger ready for your mosque. Your admin login account will be preserved.
                      </p>
                      <button 
                        type="button" 
                        className="btn btn-primary" 
                        style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
                        onClick={handleResetDatabase}
                        disabled={submitting}
                      >
                        {submitting ? 'Resetting...' : 'Reset Database to Clean Slate'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      {/* ------------------------------------------------------------- */}
      {/* MODAL DIALOGS & OVERLAYS */}
      {/* ------------------------------------------------------------- */}

      {/* Transaction Modal */}
      {txModalOpen && (
        <div className="glass-modal" style={{ position: 'fixed', top: '5%', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'block', maxWidth: '600px', width: '90%' }}>
          <div className="modal-content">
            <div className="modal-header">
              <h3>Add Financial Transaction</h3>
              <button className="btn-close-modal" onClick={() => setTxModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleAddTransaction}>
              <div className="form-row-2">
                <div className="form-group">
                  <label>Transaction Type</label>
                  <select id="tx-type" value={txForm.type} onChange={handleFormChange}>
                    <option value="income">Income (Donation / Fees / Transfer)</option>
                    <option value="expense">Expense (Bill / Payout / Purchase)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" id="tx-date" value={txForm.date} onChange={handleFormChange} required />
                </div>
              </div>

              <div className="form-group">
                <label>Description</label>
                <input type="text" id="tx-description" placeholder="e.g. British Gas Electric, Annual Donation" value={txForm.description} onChange={handleFormChange} required />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Fund Bucket</label>
                  <select id="tx-fundId" value={txForm.fundId} onChange={handleFormChange} disabled={txForm.category === 'Interest'}>
                    {balances.filter(b => !b.isArchived).map(b => (
                      <option key={b.fundId} value={b.fundId}>{b.fundName} ({b.isRestricted ? 'Restricted' : 'Unrestricted'})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <select id="tx-category" value={txForm.category} onChange={handleFormChange}>
                    {txForm.type === 'income' 
                      ? INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)
                      : EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)
                    }
                  </select>
                </div>
              </div>

              {/* Inline Shariah Compliance Error Banner */}
              {isRestrictedExpenseViolation && (
                <div className="alert alert-warning" style={{ margin: '10px 0', fontSize: '0.8rem', padding: '10px 14px' }}>
                  🚫 <strong>Compliance Error:</strong> Cannot allocate operational expenses ({txForm.category}) to restricted Zakat or Fitrana funds under Islamic accounting rules. Select Lillah or Sadaqah fund.
                </div>
              )}

              <div className="form-row-2">
                <div className="form-group">
                  <label>Amount ({org.currency_symbol || '£'})</label>
                  <input type="number" id="tx-amount" min="0.01" step="0.01" placeholder="0.00" value={txForm.amount} onChange={handleFormChange} required />
                </div>
                <div className="form-group">
                  <label>Payment Method</label>
                  <select id="tx-method" value={txForm.method} onChange={handleFormChange}>
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Card Machine">Card Machine</option>
                    <option value="Direct Debit">Direct Debit</option>
                  </select>
                </div>
              </div>

              {txForm.type === 'income' && (
                <div className="form-row-2">
                  <div className="form-group">
                    <label>Donor Profile</label>
                    <select id="tx-donorId" value={txForm.donorId} onChange={handleFormChange}>
                      <option value="anonymous">Anonymous (Non-Gift-Aid)</option>
                      {donors.filter(d => d.id !== 'anonymous').map(d => (
                        <option key={d.id} value={d.id}>{d.name} {d.gift_aid_eligible ? '(✓ Signed GA)' : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group checkbox-container" style={{ alignSelf: 'flex-end', paddingBottom: '12px' }}>
                    <label>
                      <input type="checkbox" id="tx-giftAid" checked={txForm.giftAid} onChange={handleFormChange} disabled={txForm.donorId === 'anonymous'} /> Claim UK Gift Aid (25%)
                    </label>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Audit &amp; Beneficiary Notes {txForm.category === 'Charitable Payout' ? '(Mandatory for Zakat disbursements)' : ''}</label>
                <textarea id="tx-notes" rows="2" placeholder="Beneficiary Asnaf details or internal committee notes..." value={txForm.notes} onChange={handleFormChange} />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setTxModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting || isRestrictedExpenseViolation}>
                  {submitting ? 'Saving...' : 'Save Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Donor Modal */}
      {donorModalOpen && (
        <div className="glass-modal" style={{ position: 'fixed', top: '8%', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'block', maxWidth: '520px', width: '90%' }}>
          <div className="modal-content">
            <div className="modal-header">
              <h3>Register New Donor</h3>
              <button className="btn-close-modal" onClick={() => setDonorModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleAddDonor}>
              <div className="form-group">
                <label>Donor Full Name</label>
                <input type="text" placeholder="e.g. Dr. Majid Khan" value={donorForm.name} onChange={e => setDonorForm({ ...donorForm, name: e.target.value })} required />
              </div>
              
              <div className="form-group">
                <label>Address Line 1 (House No / Name &amp; Street)</label>
                <input type="text" placeholder="e.g. 15 South Road" value={donorForm.address_line_1} onChange={e => setDonorForm({ ...donorForm, address_line_1: e.target.value })} required={donorForm.giftAidEligible} />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Address Line 2 (Optional)</label>
                  <input type="text" placeholder="e.g. Bedminster" value={donorForm.address_line_2} onChange={e => setDonorForm({ ...donorForm, address_line_2: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>City / Town</label>
                  <input type="text" placeholder="e.g. Bristol" value={donorForm.city} onChange={e => setDonorForm({ ...donorForm, city: e.target.value })} />
                </div>
              </div>

              <div className="form-group">
                <label>UK Postcode (Required for HMRC Gift Aid)</label>
                <input type="text" placeholder="e.g. BS4 2ND" value={donorForm.postcode} onChange={e => setDonorForm({ ...donorForm, postcode: e.target.value })} required={donorForm.giftAidEligible} style={{ textTransform: 'uppercase' }} />
              </div>

              <div className="form-group checkbox-container" style={{ margin: '14px 0' }}>
                <label>
                  <input type="checkbox" checked={donorForm.giftAidEligible} onChange={e => setDonorForm({ ...donorForm, giftAidEligible: e.target.checked })} /> Signed HMRC Gift Aid Declaration on file
                </label>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setDonorModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Register Donor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Jummah Cash Log Modal */}
      {jummahModalOpen && (
        <div className="glass-modal" style={{ position: 'fixed', top: '10%', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'block', maxWidth: '520px', width: '90%' }}>
          <div className="modal-content">
            <div className="modal-header">
              <h3>🕌 Friday Jummah Cash Collection</h3>
              <button className="btn-close-modal" onClick={() => setJummahModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleLogJummah}>
              <div className="form-group">
                <label>Jummah Date</label>
                <input type="date" value={jummahForm.date} onChange={e => setJummahForm({ ...jummahForm, date: e.target.value })} required />
              </div>
              
              <div className="form-row-2">
                <div className="form-group">
                  <label>Total Cash Counted ({org.currency_symbol || '£'})</label>
                  <input type="number" min="0.01" step="0.01" placeholder="0.00" value={jummahForm.amount} onChange={e => setJummahForm({ ...jummahForm, amount: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Fund Bucket</label>
                  <select value={jummahForm.fundId} onChange={e => setJummahForm({ ...jummahForm, fundId: e.target.value })}>
                    {balances.filter(b => !b.isArchived).map(b => (
                      <option key={b.fundId} value={b.fundId}>{b.fundName}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Witness Counter 1 Name</label>
                  <input type="text" placeholder="Committee Member A" value={jummahForm.counter1} onChange={e => setJummahForm({ ...jummahForm, counter1: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Witness Counter 2 Name</label>
                  <input type="text" placeholder="Committee Member B" value={jummahForm.counter2} onChange={e => setJummahForm({ ...jummahForm, counter2: e.target.value })} required />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setJummahModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Logging...' : 'Log Cash on Hand'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Fund Modal */}
      {fundModalOpen && (
        <div className="glass-modal" style={{ position: 'fixed', top: '15%', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'block', maxWidth: '480px', width: '90%' }}>
          <div className="modal-content">
            <div className="modal-header">
              <h3>Create New Fund</h3>
              <button className="btn-close-modal" onClick={() => setFundModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleAddFund}>
              <div className="form-group">
                <label>Fund Name</label>
                <input type="text" placeholder="e.g. Ramadan Iftar Fund" value={fundForm.name} onChange={e => setFundForm({ ...fundForm, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Description / Purpose</label>
                <textarea rows="2" placeholder="Describe what this fund is used for..." value={fundForm.description} onChange={e => setFundForm({ ...fundForm, description: e.target.value })} />
              </div>
              <div className="form-group checkbox-container" style={{ margin: '14px 0' }}>
                <label>
                  <input type="checkbox" checked={fundForm.is_restricted} onChange={e => setFundForm({ ...fundForm, is_restricted: e.target.checked })} /> Restricted Fund (Cannot be drawn for operational overheads)
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setFundModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Fund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New User Account Modal */}
      {userModalOpen && (
        <div className="glass-modal" style={{ position: 'fixed', top: '12%', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'block', maxWidth: '480px', width: '90%' }}>
          <div className="modal-content">
            <div className="modal-header">
              <h3>Create User Account</h3>
              <button className="btn-close-modal" onClick={() => setUserModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleAddUser}>
              <div className="form-group">
                <label>Full Name</label>
                <input type="text" placeholder="e.g. Brother Ahmad" value={userForm.name} onChange={e => setUserForm({ ...userForm, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Email Address</label>
                <input type="email" placeholder="e.g. ahmad@yourmasjid.org.uk" value={userForm.email} onChange={e => setUserForm({ ...userForm, email: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Initial Password (Min 6 chars)</label>
                <input type="password" placeholder="••••••••" value={userForm.password} onChange={e => setUserForm({ ...userForm, password: e.target.value })} required minLength={6} />
              </div>
              <div className="form-group">
                <label>Access Role</label>
                <select value={userForm.role} onChange={e => setUserForm({ ...userForm, role: e.target.value })}>
                  <option value="REVIEWER">Trustee (Read-Only Reviewer)</option>
                  <option value="AUDITOR">Auditor (Read-Only Independent)</option>
                  <option value="ADMIN">Financial Secretary (Full Admin)</option>
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setUserModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Void Transaction Confirmation Modal */}
      {voidModalOpen && targetVoidTx && (
        <div className="glass-modal" style={{ position: 'fixed', top: '15%', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'block', maxWidth: '480px', width: '90%' }}>
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ color: 'var(--danger)' }}>⚠️ Void Financial Transaction</h3>
              <button className="btn-close-modal" onClick={() => setVoidModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleConfirmVoidTx}>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                You are voiding transaction <strong>{targetVoidTx.id}</strong> ({targetVoidTx.reference_note || targetVoidTx.description} &bull; {org.currency_symbol || '£'}{parseFloat(targetVoidTx.total_amount).toFixed(2)}).
              </p>
              <div className="form-group">
                <label>Mandatory Reason for Voiding (Logged to Audit Trail):</label>
                <textarea 
                  rows="3" 
                  placeholder="e.g. Duplicate bank transfer, donor requested refund, entered wrong amount..." 
                  value={voidReasonInput} 
                  onChange={e => setVoidReasonInput(e.target.value)} 
                  required 
                  autoFocus
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setVoidModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} disabled={submitting}>
                  {submitting ? 'Voiding...' : 'Confirm Void'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Backdrop overlay */}
      {(txModalOpen || donorModalOpen || jummahModalOpen || fundModalOpen || userModalOpen || voidModalOpen) && (
        <div 
          onClick={() => {
            setTxModalOpen(false);
            setDonorModalOpen(false);
            setJummahModalOpen(false);
            setFundModalOpen(false);
            setUserModalOpen(false);
            setVoidModalOpen(false);
          }}
          style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 999 }} 
        />
      )}
    </div>
  );
}

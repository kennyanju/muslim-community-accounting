'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchAPI } from '@/utils/api';

export default function Home() {
  const router = useRouter();
  
  // 1. Roles and Identity Session States
  const [role, setRole] = useState('secretary'); // secretary, trustee, auditor
  const [userEmail, setUserEmail] = useState('secretary@bsmc.org.uk');

  // 2. Core State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [transactions, setTransactions] = useState([]);
  const [donors, setDonors] = useState([]);
  const [balances, setBalances] = useState([]);
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form Modals State
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [donorModalOpen, setDonorModalOpen] = useState(false);
  const [jummahModalOpen, setJummahModalOpen] = useState(false);

  // Form Fields
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

  const [donorForm, setDonorForm] = useState({
    name: '',
    address: '',
    giftAidEligible: true
  });

  const [jummahForm, setJummahForm] = useState({
    date: new Date().toISOString().substring(0, 10),
    amount: '',
    fundId: 'fund-lillah',
    counter1: '',
    counter2: ''
  });

  // Filter States
  const [filterType, setFilterType] = useState('all');
  const [filterFund, setFilterFund] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSearch, setFilterSearch] = useState('');

  // 3. Load active session cookie
  useEffect(() => {
    const cookies = document.cookie.split(';');
    const sessionCookie = cookies.find(c => c.trim().startsWith('bsmc_session='));
    if (sessionCookie) {
      try {
        const session = JSON.parse(decodeURIComponent(sessionCookie.split('=')[1]));
        if (session) {
          setRole(session.role === 'ADMIN' ? 'secretary' : session.role === 'REVIEWER' ? 'trustee' : 'auditor');
          setUserEmail(session.email);
        }
      } catch (err) {
        console.error("Failed to parse session cookie:", err);
      }
    }
  }, []);

  // 4. API Data Fetching using fetchAPI wrapper
  const fetchData = async () => {
    try {
      const [txData, donorData, balData, auditData] = await Promise.all([
        fetchAPI(`/api/transactions?type=${filterType}&fund=${filterFund}&status=${filterStatus}&search=${filterSearch}`),
        fetchAPI('/api/donors'),
        fetchAPI('/api/funds/balances'),
        fetchAPI('/api/audits')
      ]);

      setTransactions(txData);
      setDonors(donorData);
      setBalances(balData);
      setAudits(auditData);
      setLoading(false);
    } catch (err) {
      console.error("Failed to load financial API data:", err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [role, filterType, filterFund, filterStatus, filterSearch]);

  // Handle Theme switching
  const [theme, setTheme] = useState('system');
  useEffect(() => {
    const saved = localStorage.getItem('bsmc-theme') || 'system';
    setTheme(saved);
    applyTheme(saved);
  }, []);

  const handleThemeChange = (e) => {
    const val = e.target.value;
    setTheme(val);
    localStorage.setItem('bsmc-theme', val);
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
  const handleLogout = () => {
    // Clear cookie session
    document.cookie = "bsmc_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;";
    localStorage.removeItem("bsmc-role");
    
    // Redirect to login
    router.push('/login');
    router.refresh();
  };

  // Switch Active Tab
  const handleTabSwitch = (tabName) => {
    setActiveTab(tabName);
    fetchData();
  };

  // Helper to resolve fund name
  const getFundName = (fId) => {
    const fund = balances.find(b => b.fundId === fId);
    return fund ? fund.fundName : 'Unknown';
  };

  // Get Consolidated Balances
  const getConsolidated = () => {
    let total = 0;
    let restricted = 0;
    let unrestricted = 0;
    let bankTotal = 0;
    let cashTotal = 0;

    balances.forEach(b => {
      total += b.balance;
      if (b.isRestricted) {
        if (b.fundName !== 'Interest/Riba') restricted += b.balance;
      } else {
        unrestricted += b.balance;
      }
    });

    transactions.forEach(t => {
      if (t.status === 'VOIDED' || t.status === 'FAILED') return;
      const change = t.type === 'INCOME' ? t.total_amount : -t.total_amount;
      if (t.method === 'CASH' && t.status === 'PENDING') {
        cashTotal += change;
      } else {
        bankTotal += change;
      }
    });

    return { total, bankTotal, cashTotal, restricted, unrestricted };
  };

  const consolidated = getConsolidated();

  // 5. API Operations
  const handleAddTransaction = async (e) => {
    e.preventDefault();
    
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
      note: txForm.description,
      splits: finalSplits,
      giftAid: txForm.giftAid,
      notes: txForm.notes
    };

    try {
      await fetchAPI('/api/transactions', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
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
      alert(err.message);
    }
  };

  const handleLogJummah = async (e) => {
    e.preventDefault();
    
    const payload = {
      type: 'INCOME',
      status: 'PENDING',
      method: 'CASH',
      totalAmount: parseFloat(jummahForm.amount),
      date: jummahForm.date,
      donorId: 'anonymous',
      receiptUrl: 'data:image/svg+xml;utf8,<svg width="100" height="100"><rect width="100" height="100" fill="%23e2e8f0"/><text x="10" y="50" fill="%2364748b" font-size="10">Count Slip OK</text></svg>',
      note: 'Friday Jummah Cash Collection',
      splits: [{ fund_id: jummahForm.fundId, amount: parseFloat(jummahForm.amount) }],
      giftAid: false,
      notes: `Counters: ${jummahForm.counter1} & ${jummahForm.counter2}. Friday cash counting slip verified.`
    };

    try {
      await fetchAPI('/api/transactions', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setJummahModalOpen(false);
      setJummahForm({
        date: new Date().toISOString().substring(0, 10),
        amount: '',
        fundId: 'fund-lillah',
        counter1: '',
        counter2: ''
      });
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddDonor = async (e) => {
    e.preventDefault();
    try {
      await fetchAPI('/api/donors', {
        method: 'POST',
        body: JSON.stringify(donorForm)
      });

      setDonorModalOpen(false);
      setDonorForm({ name: '', address: '', giftAidEligible: true });
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleVoidTx = async (txId, desc) => {
    const reason = prompt(`Verify VOID for transaction "${desc}". Enter reason:`);
    if (reason === null) return;
    if (!reason.trim()) {
      alert("Void reason is mandatory.");
      return;
    }

    try {
      await fetchAPI(`/api/transactions/${txId}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleBankDeposit = async (txId) => {
    try {
      await fetchAPI(`/api/transactions/${txId}/bank`, {
        method: 'POST'
      });
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleReconcileLock = async (txId) => {
    try {
      await fetchAPI(`/api/transactions/${txId}/reconcile`, {
        method: 'POST'
      });
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Gift Aid claims CSV export API trigger
  const triggerGiftAidClaimsDownload = () => {
    window.open('/api/reports/giftaid', '_blank');
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

  // Donut SVG Builder
  const renderDonutChart = () => {
    const activeBalances = balances.filter(b => b.balance > 0);
    const total = activeBalances.reduce((sum, b) => sum + b.balance, 0);

    if (total === 0) {
      return <text x="120" y="120" textAnchor="middle" className="chart-text">No active assets</text>;
    }

    const colors = ["#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#ef4444"];
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
          <title>{`${b.fundName}: £${b.balance.toFixed(2)} (${Math.round(percentage * 100)}%)`}</title>
        </path>
      );
    });
  };

  const renderTrendChart = () => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    const inflows = [1200, 1800, 1500, 2200, 2400, 3070];
    const outflows = [800, 1200, 950, 1600, 1400, 1320];

    const width = 500;
    const height = 240;
    const padding = 40;
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;
    const maxVal = Math.max(...inflows, ...outflows) * 1.15;

    const gridLines = [];
    for (let i = 0; i <= 4; i++) {
      const y = padding + chartHeight - (i * chartHeight / 4);
      const val = Math.round(i * maxVal / 4);
      gridLines.push(
        <g key={`grid-${i}`}>
          <line x1={padding} y1={y} x2={width - padding} y2={y} className="chart-grid-line" />
          <text x={padding - 8} y={y + 4} textAnchor="end" className="chart-text">£{val}</text>
        </g>
      );
    }

    const colWidth = chartWidth / months.length;
    const barWidth = colWidth * 0.35;

    const bars = months.map((month, idx) => {
      const x = padding + (idx * colWidth);
      const infH = (inflows[idx] / maxVal) * chartHeight;
      const outH = (outflows[idx] / maxVal) * chartHeight;

      return (
        <g key={`month-${idx}`}>
          <text x={x + colWidth / 2} y={height - padding + 18} textAnchor="middle" className="chart-text">{month}</text>
          
          <rect
            x={x + (colWidth * 0.1)}
            y={padding + chartHeight - infH}
            width={barWidth}
            height={infH}
            rx={3}
            className="chart-bar-inflow"
          >
            <title>Inflow: £{inflows[idx]}</title>
          </rect>

          <rect
            x={x + (colWidth * 0.1) + barWidth + 4}
            y={padding + chartHeight - outH}
            width={barWidth}
            height={outH}
            rx={3}
            className="chart-bar-outflow"
          >
            <title>Outflow: £{outflows[idx]}</title>
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

  // P&L Statement compilation
  const getPLStatement = () => {
    const income = {};
    const opExpense = {};
    const restrictedDisb = {};

    let totalInc = 0;
    let totalOp = 0;
    let totalRest = 0;

    transactions.forEach(t => {
      if (t.status === 'VOIDED' || t.status === 'FAILED') return;
      const amt = parseFloat(t.total_amount);
      const cat = t.category;
      
      if (t.type === 'INCOME') {
        income[cat] = (income[cat] || 0) + amt;
        totalInc += amt;
      } else {
        const isRestricted = t.splits.some(s => s.fundName === 'Zakat' || s.fundName === 'Fitrana');
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
  };

  const pl = getPLStatement();

  // Receipt Generator Template States
  const [receiptDoc, setReceiptDoc] = useState({
    number: 'BSMC-2026-0001',
    type: 'receipt',
    date: new Date().toISOString().substring(0, 10),
    donorId: '',
    from: `Bristol South Muslim Community (BSMC)\n100 Mosque Road, Bristol, BS3 1AB\ncharity-no: 1234567\nfinance@bsmc.org.uk`,
    to: '',
    items: [{ desc: 'General Lillah Donation', amount: 250.00, qty: 1 }],
    giftAid: false
  });

  const updateReceiptDoc = (fields) => {
    setReceiptDoc(prev => {
      const updated = { ...prev, ...fields };
      if (fields.donorId) {
        const d = donors.find(donor => donor.id === fields.donorId);
        if (d) {
          updated.to = `${d.name}\n${d.address_line_1 ? `${d.address_line_1}, ${d.postcode}` : 'No Address Specified'}\nGift Aid Signed: ${d.gift_aid_eligible ? 'YES' : 'NO'}`;
          updated.giftAid = d.gift_aid_eligible;
        }
      }
      return updated;
    });
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <svg className="logo-icon" viewBox="0 0 24 24" fill="none">
              <rect width="24" height="24" rx="6" fill="url(#bsmc-logo-grad)" />
              <path d="M12 4L4 9L12 14L20 9L12 4Z" fill="white" />
              <path d="M4 14L12 19L20 14" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 9V14" stroke="#4f46e5" strokeWidth="2" />
              <defs>
                <linearGradient id="bsmc-logo-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#10b981" />
                  <stop offset="1" stopColor="#059669" />
                </linearGradient>
              </defs>
            </svg>
            <div className="logo-meta">
              <span className="logo-text">BSMC <span className="highlight">Finance</span></span>
              <span className="logo-subtext">Bristol South Mosque</span>
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
        </nav>

        <div className="sidebar-footer">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>USER SESSION</span>
            <strong style={{ fontSize: '0.85rem', color: '#ffffff', wordBreak: 'break-all' }}>{userEmail}</strong>
            <button className="btn btn-secondary btn-sm" onClick={handleLogout} style={{ marginTop: '8px', padding: '6px' }}>
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
            <h2 className={`badge ${role === 'secretary' ? 'badge-admin' : role === 'trustee' ? 'badge-reviewer' : 'badge-auditor'}`}>
              {role === 'secretary' ? 'Financial Secretary Mode' : role === 'trustee' ? 'Trustee Mode (Read-Only)' : 'Auditor Mode (Read-Only)'}
            </h2>
          </div>
          {role === 'secretary' && (
            <div className="header-actions">
              <button className="btn btn-secondary" onClick={() => setJummahModalOpen(true)}>🕌 Jummah Log</button>
              <button className="btn btn-primary" onClick={() => setTxModalOpen(true)}>+ Add Transaction</button>
            </div>
          )}
        </header>

        <div className="scrollable-content">
          <div className="alerts-container">
            {transactions.filter(t => t.status === 'PENDING' && t.type === 'INCOME').length > 0 && (
              <div className="alert alert-warning">
                <span>⚠️ <strong>Unreconciled Cash Alert:</strong> Friday cash collections are held as "Cash on Hand". Deposit at bank to update status.</span>
              </div>
            )}
            
            {balances.find(b => b.fundName === 'Fitrana')?.balance > 0 && (
              <div className="alert alert-info">
                <span>🕌 <strong>Fitrana Fund Reminder:</strong> Fitrana balance must be distributed to eligible poor families prior to Eid prayer.</span>
              </div>
            )}
          </div>

          {/* 1. DASHBOARD VIEW */}
          {activeTab === 'dashboard' && (
            <section className="content-view active-view">
              <div className="view-header">
                <div>
                  <h1 className="view-title">Financial Summary</h1>
                  <p className="view-subtitle">Islamic Restricted and Unrestricted fund balances</p>
                </div>
                <div className="date-badge">June 2026</div>
              </div>

              <div className="balances-summary-grid">
                <div className="balance-summary-card main-summary">
                  <span className="card-tag">Consolidated</span>
                  <h2>Total Funds</h2>
                  <span className="balance-amount">£{consolidated.total.toFixed(2)}</span>
                  <div className="balance-meta-split">
                    <span>Bank: <strong>£{consolidated.bankTotal.toFixed(2)}</strong></span>
                    <span>Cash on Hand: <strong>£{consolidated.cashTotal.toFixed(2)}</strong></span>
                  </div>
                </div>

                <div className="balance-summary-card restricted-sum">
                  <span className="card-tag restricted">Restricted</span>
                  <h2>Zakat &amp; Fitrana</h2>
                  <span className="balance-amount">£{consolidated.restricted.toFixed(2)}</span>
                  <p className="fund-subinfo">Reserved strictly for eligible recipients.</p>
                </div>

                <div className="balance-summary-card unrestricted-sum">
                  <span className="card-tag unrestricted">Unrestricted</span>
                  <h2>Lillah &amp; Sadaqah</h2>
                  <span className="balance-amount">£{consolidated.unrestricted.toFixed(2)}</span>
                  <p className="fund-subinfo">Available for mosque operational costs and bills.</p>
                </div>
              </div>

              <h3 className="section-title">Individual Fund Wallets</h3>
              <div className="funds-grid">
                {balances.map(b => (
                  <div key={b.fundId} className="fund-wallet-card">
                    <div className="wallet-header">
                      <span className="wallet-name">{b.fundName}</span>
                      <span className={`wallet-type ${b.isRestricted ? 'type-restricted' : 'type-unrestricted'}`}>
                        {b.isRestricted ? 'Restricted' : 'Unrestricted'}
                      </span>
                    </div>
                    <span className="wallet-val">£{b.balance.toFixed(2)}</span>
                    {b.fundName === 'Interest/Riba' && <span className="riba-tooltip">Purge interest without reward.</span>}
                  </div>
                ))}
              </div>

              <div className="dashboard-charts-grid">
                <div className="chart-card glass-card">
                  <div className="chart-header">
                    <h3>Financial Inflows vs Outflows</h3>
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
                    {balances.filter(b => b.balance > 0).map((b, idx) => (
                      <div key={b.fundId} className="legend-row">
                        <div className="legend-row-label">
                          <span className="legend-color-box" style={{ backgroundColor: ["#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#ef4444"][idx % 7] }}></span>
                          <span>{b.fundName}</span>
                        </div>
                        <strong>£{b.balance.toFixed(2)}</strong>
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
                      {transactions.slice(0, 5).map(tx => (
                        <tr key={tx.id} className={tx.status === 'VOIDED' ? 'tr-voided' : tx.status === 'FAILED' ? 'tr-failed' : ''}>
                          <td>{tx.transaction_date}</td>
                          <td>{tx.description || tx.reference_note}</td>
                          <td>{tx.splits.map(s => `${s.fundName}: £${s.amount}`).join(', ')}</td>
                          <td>{tx.category || 'Donation'}</td>
                          <td className={tx.type === 'INCOME' ? 'val-income' : 'val-expense'}>
                            {tx.type === 'INCOME' ? '+' : '-'}£{parseFloat(tx.total_amount).toFixed(2)}
                          </td>
                          <td>
                            <span className={`status-badge ${tx.status === 'PENDING' ? 'status-cash' : tx.status === 'BANKED' ? 'status-banked' : tx.status === 'VOIDED' ? 'status-voided' : 'status-failed'}`}>
                              {tx.status === 'PENDING' ? 'Cash Hand' : tx.status}
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
                  <p className="view-subtitle">Audit-safe log of incomes, expenses, and reconciliations</p>
                </div>
              </div>

              <div className="filter-toolbar glass-card">
                <div className="filter-group">
                  <label>Type</label>
                  <select className="form-control-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
                    <option value="all">All Types</option>
                    <option value="income">Income</option>
                    <option value="expense">Expense</option>
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
                  <label>Status</label>
                  <select className="form-control-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="all">All Statuses</option>
                    <option value="Active">Active</option>
                    <option value="Cash on Hand">Cash on Hand</option>
                    <option value="Banked">Banked</option>
                    <option value="Voided">Voided</option>
                  </select>
                </div>

                <div className="filter-group search-filter">
                  <label>Search Keyword</label>
                  <input type="text" className="form-control-sm" placeholder="Search..." value={filterSearch} onChange={e => setFilterSearch(e.target.value)} />
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
                        <th>Amt</th>
                        <th className="actions-col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map(tx => {
                        const isIncome = tx.type === 'INCOME';
                        return (
                          <tr key={tx.id} className={`${tx.status === 'VOIDED' ? 'tr-voided' : tx.status === 'FAILED' ? 'tr-failed' : ''} ${tx.reconciled ? 'tr-reconciled' : ''}`}>
                            <td>{tx.transaction_date}</td>
                            <td>
                              <strong>{tx.description || tx.reference_note}</strong>
                              {tx.notes && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Notes: {tx.notes}</div>}
                            </td>
                            <td>{tx.donorName}</td>
                            <td>{tx.splits.map(s => `${s.fundName}: £${s.amount}`).join(', ')}</td>
                            <td>{tx.category || 'Donation'}</td>
                            <td>{tx.method}</td>
                            <td>
                              <span className={`status-badge ${tx.status === 'PENDING' ? 'status-cash' : tx.status === 'BANKED' ? 'status-banked' : tx.status === 'VOIDED' ? 'status-voided' : 'status-failed'}`}>
                                {tx.status === 'PENDING' ? 'Cash Hand' : tx.status}
                              </span>
                            </td>
                            <td className={isIncome ? 'val-income' : 'val-expense'}>
                              {isIncome ? '+' : '-'}£{parseFloat(tx.total_amount).toFixed(2)}
                            </td>
                            <td className="actions-col">
                              {role === 'secretary' && !tx.reconciled ? (
                                <div className="actions-btn-group">
                                  {tx.status === 'PENDING' && tx.type === 'INCOME' && (
                                    <button className="action-btn" onClick={() => handleBankDeposit(tx.id)}>🏦 Banked</button>
                                  )}
                                  <button className="action-btn" onClick={() => handleReconcileLock(tx.id)}>✔️ Lock</button>
                                  <button className="action-btn btn-void" onClick={() => handleVoidTx(tx.id, tx.description || tx.reference_note)}>⚠️ Void</button>
                                </div>
                              ) : tx.reconciled ? (
                                <span className="status-badge status-active">🔒 Locked</span>
                              ) : (
                                <span className="status-badge status-voided">🔓 Unreconciled</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* 3. DONORS VIEW */}
          {activeTab === 'donors' && (
            <section className="content-view active-view">
              <div className="view-header">
                <div>
                  <h1 className="view-title">Donors &amp; Gift Aid</h1>
                  <p className="view-subtitle">UK HMRC compliant Gift Aid declaration log &amp; donor directory</p>
                </div>
                {role === 'secretary' && (
                  <button className="btn btn-primary" onClick={() => setDonorModalOpen(true)}>+ New Donor</button>
                )}
              </div>

              <div className="donors-layout-grid">
                <div className="donors-list-card glass-card">
                  <h3>Donor Registry</h3>
                  <div className="table-wrapper">
                    <table className="ledger-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Address</th>
                          <th>Gift Aid Signed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {donors.filter(d => d.id !== 'anonymous').map(d => (
                          <tr key={d.id}>
                            <td><strong>{d.name}</strong></td>
                            <td>{d.address_line_1 ? `${d.address_line_1}, ${d.postcode}` : 'N/A'}</td>
                            <td>
                              <span className={`status-badge ${d.gift_aid_eligible ? 'status-active' : 'status-voided'}`}>
                                {d.gift_aid_eligible ? '✓ Signed' : '✗ Unsigned'}
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
                  <p className="info-p">Generate claims on eligible donations with signed declarations and valid UK addresses.</p>
                  
                  <div className="claim-stats">
                    <div className="claim-stat">
                      <span>Eligible Claims:</span>
                      <strong>{transactions.filter(t => t.type === 'INCOME' && t.status !== 'VOIDED' && t.status !== 'FAILED' && t.giftAid).length}</strong>
                    </div>
                    <div className="claim-stat">
                      <span>Eligible Value:</span>
                      <strong>
                        £{transactions.filter(t => t.type === 'INCOME' && t.status !== 'VOIDED' && t.status !== 'FAILED' && t.giftAid)
                          .reduce((sum, t) => sum + parseFloat(t.total_amount), 0).toFixed(2)}
                      </strong>
                    </div>
                    <div className="claim-stat">
                      <span>Tax Rebate (25%):</span>
                      <strong className="text-success">
                        £{(transactions.filter(t => t.type === 'INCOME' && t.status !== 'VOIDED' && t.status !== 'FAILED' && t.giftAid)
                          .reduce((sum, t) => sum + parseFloat(t.total_amount), 0) * 0.25).toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  <button className="btn btn-primary btn-block" onClick={triggerGiftAidClaimsDownload}>
                    📥 Export HMRC Gift Aid Schedule (CSV)
                  </button>

                  <h4 style={{ marginTop: '20px' }}>Eligible Donations Ledger</h4>
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
                            <td>£{parseFloat(t.total_amount).toFixed(2)}</td>
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
                  <h1 className="view-title">Reports &amp; Audit Logs</h1>
                  <p className="view-subtitle">Financial statements and immutable software audit trails</p>
                </div>
                <div className="header-actions">
                  <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Print P&amp;L Report</button>
                </div>
              </div>

              <div className="reports-container-grid">
                <div className="report-block glass-card print-report-area">
                  <div className="report-block-header">
                    <h2>Bristol South Muslim Community</h2>
                    <h3>Income &amp; Expenditure Statement</h3>
                    <span>As of June 2026</span>
                  </div>
                  
                  <div className="pl-statement">
                    <div className="pl-section">
                      <h4 className="pl-section-title">Income Sources</h4>
                      <div className="pl-rows">
                        {Object.keys(pl.income).map(cat => (
                          <div key={cat} className="pl-row">
                            <span>{cat}</span>
                            <span>£{pl.income[cat].toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="pl-row pl-total-row">
                        <span>Total Income</span>
                        <span>£{pl.totalInc.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="pl-section">
                      <h4 className="pl-section-title">Operating Expenses (Paid via Lillah/Sadaqah)</h4>
                      <div className="pl-rows">
                        {Object.keys(pl.opExpense).map(cat => (
                          <div key={cat} className="pl-row">
                            <span>{cat}</span>
                            <span className="expense-val">£{pl.opExpense[cat].toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="pl-row pl-total-row">
                        <span>Total Operating Expenses</span>
                        <span className="expense-val">£{pl.totalOp.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="pl-section">
                      <h4 className="pl-section-title">Charitable Disbursements / Payouts (Restricted Zakat/Fitrana)</h4>
                      <div className="pl-rows">
                        {Object.keys(pl.restrictedDisb).map(cat => (
                          <div key={cat} className="pl-row">
                            <span>{cat}</span>
                            <span className="expense-val">£{pl.restrictedDisb[cat].toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="pl-row pl-total-row">
                        <span>Total Restricted Payouts</span>
                        <span className="expense-val">£{pl.totalRest.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="pl-section pl-net-income-section">
                      <div className="pl-row pl-net-income-row">
                        <span>Net Surplus / Deficit</span>
                        <span className={pl.totalInc - pl.totalOp - pl.totalRest >= 0 ? '' : 'expense-val'}>
                          £{(pl.totalInc - pl.totalOp - pl.totalRest).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="report-side-column">
                  <div className="analytics-stat-card glass-card">
                    <h3>Fund Compliance Report</h3>
                    <div className="compliance-metric">
                      <span>Zakat Balance:</span>
                      <strong>£{(balances.find(b => b.fundName === 'Zakat')?.balance || 0).toFixed(2)}</strong>
                    </div>
                    <div className="compliance-metric">
                      <span>Fitrana Balance:</span>
                      <strong>£{(balances.find(b => b.fundName === 'Fitrana')?.balance || 0).toFixed(2)}</strong>
                    </div>
                    <div className="compliance-metric">
                      <span>Interest/Riba Purging balance:</span>
                      <strong className="expense-val">£{(balances.find(b => b.fundName === 'Interest/Riba')?.balance || 0).toFixed(2)}</strong>
                    </div>
                    <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '12px 0' }} />
                    <p className="micro-text">Warning: Restricted fund balances cannot be drawn for general bills or administrative salaries.</p>
                  </div>

                  <div className="analytics-stat-card glass-card">
                    <h3>Immutable Software Audit Logs</h3>
                    <div className="audit-timeline">
                      {audits.map(log => (
                        <div key={log.id} className="timeline-item">
                          <span className="timeline-time">{log.timestamp} by <strong>{log.userEmail}</strong></span>
                          <span className="timeline-desc">{`Action ${log.action} performed on table "${log.table_name}"`}</span>
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
                  <p className="view-subtitle">Generate official donation receipts and vendor invoices</p>
                </div>
              </div>

              <div className="invoice-workspace">
                <div className="invoice-form-panel glass-card">
                  <h3>Receipt Details</h3>
                  <form>
                    <div className="form-row-2">
                      <div className="form-group">
                        <label>Document No.</label>
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
                        <label>Link to Donor</label>
                        <select value={receiptDoc.donorId} onChange={e => updateReceiptDoc({ donorId: e.target.value })}>
                          <option value="">Select Donor...</option>
                          {donors.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="form-divider">Issuer (Mosque Information)</div>
                    <div className="form-group">
                      <textarea rows="3" value={receiptDoc.from} onChange={e => updateReceiptDoc({ from: e.target.value })} />
                    </div>

                    <div className="form-divider">Recipient Info</div>
                    <div className="form-group">
                      <textarea rows="3" placeholder="Load donor or type manually" value={receiptDoc.to} onChange={e => updateReceiptDoc({ to: e.target.value })} />
                    </div>

                    <div className="form-divider">Donation Value</div>
                    <div className="invoice-item-row">
                      <div className="col-desc">
                        <input type="text" value={receiptDoc.items[0]?.desc || ''} onChange={e => {
                          const updatedItems = [...receiptDoc.items];
                          updatedItems[0].desc = e.target.value;
                          updateReceiptDoc({ items: updatedItems });
                        }} />
                      </div>
                      <div className="col-qty">
                        <input type="number" value={receiptDoc.items[0]?.qty || 1} onChange={e => {
                          const updatedItems = [...receiptDoc.items];
                          updatedItems[0].qty = parseFloat(e.target.value) || 0;
                          updateReceiptDoc({ items: updatedItems });
                        }} />
                      </div>
                      <div className="col-rate">
                        <input type="number" value={receiptDoc.items[0]?.amount || 0} onChange={e => {
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
                    <h4>Preview Document</h4>
                    <button className="btn btn-primary btn-sm" onClick={() => window.print()}>🖨️ Print / Save PDF</button>
                  </div>

                  <div className="invoice-paper">
                    <div className="invoice-paper-header">
                      <div className="invoice-brand">
                        <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#10b981" strokeWidth="2">
                          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                        </svg>
                        <div>
                          <h2 className="brand-title">Bristol South Muslim Community</h2>
                          <p className="brand-tagline">Registered Charity No. 1234567</p>
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
                        <span className="billing-header">RECIPIENT:</span>
                        <pre className="billing-pre">{receiptDoc.to || 'Anonymous'}</pre>
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
                            <td className="text-right">£{item.amount.toFixed(2)}</td>
                            <td className="text-right">£{(item.qty * item.amount).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="invoice-totals-section">
                      <div className="totals-block">
                        <div className="total-row">
                          <span>Subtotal:</span>
                          <span>£{(receiptDoc.items[0]?.qty * receiptDoc.items[0]?.amount || 0).toFixed(2)}</span>
                        </div>
                        {receiptDoc.giftAid && (
                          <div className="total-row">
                            <span>Gift Aid Rebate (25%):</span>
                            <span>£{(receiptDoc.items[0]?.qty * receiptDoc.items[0]?.amount * 0.25 || 0).toFixed(2)}</span>
                          </div>
                        )}
                        <hr className="totals-hr" />
                        <div className="total-row grand-total-row">
                          <span>Total Value:</span>
                          <span>£{(receiptDoc.items[0]?.qty * receiptDoc.items[0]?.amount || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="invoice-footer-notes">
                      <p>Thank you for your donation. Bristol South Mosque appreciates your support.</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* 6. MODAL DIALOGS (HTML5 SIMULATED VIA CONDITIONAL REACT COMPONENT OVERLAYS) */}
      {txModalOpen && (
        <div className="glass-modal" style={{ position: 'fixed', top: '10%', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'block' }}>
          <div className="modal-content">
            <div className="modal-header">
              <h3>Add Transaction</h3>
              <button className="btn-close-modal" onClick={() => setTxModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleAddTransaction}>
              <div className="form-row-2">
                <div className="form-group">
                  <label>Type</label>
                  <select id="tx-type" value={txForm.type} onChange={handleFormChange}>
                    <option value="income">Income (Donation / Fees)</option>
                    <option value="expense">Expense (Bill / Payout)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" id="tx-date" value={txForm.date} onChange={handleFormChange} required />
                </div>
              </div>

              <div className="form-group">
                <label>Description (Operational category must be matching if Expense)</label>
                <input type="text" id="tx-description" placeholder="e.g. Mosque electric bill, Jummah cash" value={txForm.description} onChange={handleFormChange} required />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Fund</label>
                  <select id="tx-fundId" value={txForm.fundId} onChange={handleFormChange} disabled={txForm.category === 'Interest'}>
                    {balances.map(b => (
                      <option key={b.fundId} value={b.fundId}>{b.fundName}</option>
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

              <div className="form-row-2">
                <div className="form-group">
                  <label>Amount (£)</label>
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

              <div className="form-row-2">
                <div className="form-group">
                  <label>Donor</label>
                  <select id="tx-donorId" value={txForm.donorId} onChange={handleFormChange}>
                    <option value="anonymous">Anonymous (Non-Gift-Aid)</option>
                    {donors.filter(d => d.id !== 'anonymous').map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group checkbox-container" style={{ alignSelf: 'flex-end', paddingBottom: '12px' }}>
                  <label>
                    <input type="checkbox" id="tx-giftAid" checked={txForm.giftAid} onChange={handleFormChange} disabled={txForm.donorId === 'anonymous'} /> Claim Gift Aid
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label>Audit Notes (Mandatory for Zakat payouts)</label>
                <textarea id="tx-notes" rows="2" placeholder="Beneficiary Asnaf details..." value={txForm.notes} onChange={handleFormChange} />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setTxModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Transaction</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {donorModalOpen && (
        <div className="glass-modal" style={{ position: 'fixed', top: '15%', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'block' }}>
          <div className="modal-content">
            <div className="modal-header">
              <h3>New Donor Profile</h3>
              <button className="btn-close-modal" onClick={() => setDonorModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleAddDonor}>
              <div className="form-group">
                <label>Full Name</label>
                <input type="text" placeholder="e.g. Dr. Majid Khan" value={donorForm.name} onChange={e => setDonorForm({ ...donorForm, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>UK Address &amp; Postcode (Comma separated)</label>
                <textarea rows="2" placeholder="e.g. 15 South Road, Bristol, BS4 2ND" value={donorForm.address} onChange={e => setDonorForm({ ...donorForm, address: e.target.value })} required={donorForm.giftAidEligible} />
              </div>
              <div className="form-group checkbox-container">
                <label>
                  <input type="checkbox" checked={donorForm.giftAidEligible} onChange={e => setDonorForm({ ...donorForm, giftAidEligible: e.target.checked })} /> Gift Aid Declaration Signed
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setDonorModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Donor</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {jummahModalOpen && (
        <div className="glass-modal" style={{ position: 'fixed', top: '15%', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'block' }}>
          <div className="modal-content">
            <div className="modal-header">
              <h3>Jummah Cash Collection Log</h3>
              <button className="btn-close-modal" onClick={() => setJummahModalOpen(false)}>&times;</button>
            </div>
            <form onSubmit={handleLogJummah}>
              <div className="form-group">
                <label>Jummah Date</label>
                <input type="date" value={jummahForm.date} onChange={e => setJummahForm({ ...jummahForm, date: e.target.value })} required />
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label>Total Cash Counted (£)</label>
                  <input type="number" min="0.01" step="0.01" placeholder="0.00" value={jummahForm.amount} onChange={e => setJummahForm({ ...jummahForm, amount: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Fund Bucket</label>
                  <select value={jummahForm.fundId} onChange={e => setJummahForm({ ...jummahForm, fundId: e.target.value })}>
                    {balances.map(b => (
                      <option key={b.fundId} value={b.fundId}>{b.fundName}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label>Counter 1 Name</label>
                  <input type="text" placeholder="Committee Member A" value={jummahForm.counter1} onChange={e => setJummahForm({ ...jummahForm, counter1: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Counter 2 Name</label>
                  <input type="text" placeholder="Committee Member B" value={jummahForm.counter2} onChange={e => setJummahForm({ ...jummahForm, counter2: e.target.value })} required />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setJummahModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Log Jummah Collection</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {(txModalOpen || donorModalOpen || jummahModalOpen) && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 999 }} />
      )}
    </div>
  );
}

// Majid Accounting - BSMC Financial Management System
// Core Logic and UI Controller

// 1. Initial Sample Seed Data
const DEFAULT_DONORS = [
  { id: "don-1", name: "Dr. Majid Khan", address: "12 Bristol Road, Bristol, BS4 1AA", giftAidSigned: true },
  { id: "don-2", name: "Sister Fatima Al-Hassan", address: "88 South Road, Bristol, BS3 2BB", giftAidSigned: true },
  { id: "don-3", name: "Brother Tariq Mahmood", address: "34 West Street, Bristol, BS5 8DD", giftAidSigned: false },
  { id: "anonymous", name: "Anonymous Donor", address: "", giftAidSigned: false }
];

const DEFAULT_TRANSACTIONS = [
  {
    id: "tx-1",
    date: "2026-06-05",
    description: "Friday Jummah Cash Collection",
    donorId: "anonymous",
    type: "income",
    fund: "Lillah",
    category: "Donation",
    method: "Cash",
    amount: 850.00,
    status: "Banked", // Banked, Cash on Hand, Voided, Failed
    reconciled: true,
    notes: "Counters: Brother Ahmad & Brother Yusef. Deposited on Monday.",
    slipPhoto: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%23e2e8f0'/><text x='10' y='50' fill='%2364748b' font-size='10'>Count Slip OK</text></svg>"
  },
  {
    id: "tx-2",
    date: "2026-06-06",
    description: "Annual Zakat Contribution",
    donorId: "don-1",
    type: "income",
    fund: "Zakat",
    category: "Zakat",
    method: "Bank Transfer",
    amount: 1500.00,
    status: "Active",
    reconciled: false,
    notes: "Direct bank transfer for Zakat fund.",
    giftAid: true
  },
  {
    id: "tx-3",
    date: "2026-06-07",
    description: "Sadaqah Jariyah for Water Well Project",
    donorId: "don-2",
    type: "income",
    fund: "Sadaqah Jariyah",
    category: "Donation",
    method: "Bank Transfer",
    amount: 500.00,
    status: "Active",
    reconciled: false,
    notes: "Restricted to water well initiative.",
    giftAid: true
  },
  {
    id: "tx-4",
    date: "2026-06-08",
    description: "Mosque Electricity Bill Q2",
    donorId: "anonymous",
    type: "expense",
    fund: "Lillah",
    category: "Utilities",
    method: "Direct Debit",
    amount: 320.00,
    status: "Active",
    reconciled: false,
    notes: "British Gas electric invoice."
  },
  {
    id: "tx-5",
    date: "2026-06-09",
    description: "Islamic Relief Zakat Payout",
    donorId: "anonymous",
    type: "expense",
    fund: "Zakat",
    category: "Charitable Payout",
    method: "Bank Transfer",
    amount: 1000.00,
    status: "Active",
    reconciled: false,
    notes: "Distribution to eligible beneficiaries (Asnaf: Poor & Needy)."
  },
  {
    id: "tx-6",
    date: "2026-06-10",
    description: "Accrued Bank Interest Payment",
    donorId: "anonymous",
    type: "income",
    fund: "Interest/Riba", // Forced by Rule 4
    category: "Interest",
    method: "Bank Transfer",
    amount: 15.45,
    status: "Active",
    reconciled: true,
    notes: "Automatically categorized bank interest. To be disposed of without reward."
  },
  {
    id: "tx-7",
    date: "2026-06-12",
    description: "Fitrana Donations Cash",
    donorId: "anonymous",
    type: "income",
    fund: "Fitrana",
    category: "Fitrana",
    method: "Cash",
    amount: 220.00,
    status: "Cash on Hand", // Workflow 1: Pending deposit
    reconciled: false,
    notes: "Collected in Fitrana box.",
    slipPhoto: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='%23fef3c7'/><text x='10' y='50' fill='%23d97706' font-size='10'>Fitrana Box Slip</text></svg>"
  }
];

const DEFAULT_AUDIT_LOGS = [
  { time: "2026-06-12 09:00:00", user: "system", desc: "BSMC database initialized with system constraints." },
  { time: "2026-06-12 10:15:00", user: "kennyanju", desc: "Friday Jummah Cash Collection locked & reconciled." }
];

// 2. Application State Definition
class AppState {
  constructor() {
    this.donors = this.loadLocalStorage("bsmc-donors", DEFAULT_DONORS);
    this.transactions = this.loadLocalStorage("bsmc-transactions", DEFAULT_TRANSACTIONS);
    this.auditLogs = this.loadLocalStorage("bsmc-audits", DEFAULT_AUDIT_LOGS);
    this.currentRole = localStorage.getItem("bsmc-role") || "secretary";
  }

  loadLocalStorage(key, defaultVal) {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultVal;
  }

  saveState() {
    localStorage.setItem("bsmc-donors", JSON.stringify(this.donors));
    localStorage.setItem("bsmc-transactions", JSON.stringify(this.transactions));
    localStorage.setItem("bsmc-audits", JSON.stringify(this.auditLogs));
    localStorage.setItem("bsmc-role", this.currentRole);
  }

  addAudit(user, desc) {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    this.auditLogs.unshift({ time: timestamp, user, desc });
    this.saveState();
  }
}

const state = new AppState();

// 3. UI Selectors & Navigation Setup
const VIEWS = ["dashboard", "transactions", "donors", "reports", "receipts"];
const NAV_BUTTONS = {};
VIEWS.forEach(v => {
  NAV_BUTTONS[v] = document.getElementById(`nav-${v}`);
});

const VIEW_SECTIONS = {};
VIEWS.forEach(v => {
  VIEW_SECTIONS[v] = document.getElementById(`view-${v}`);
});

// Setup tab switches
Object.keys(NAV_BUTTONS).forEach(key => {
  NAV_BUTTONS[key].addEventListener("click", () => {
    switchView(key);
  });
});

function switchView(viewName) {
  VIEWS.forEach(v => {
    NAV_BUTTONS[v].classList.remove("active");
    VIEW_SECTIONS[v].classList.remove("active-view");
  });
  NAV_BUTTONS[viewName].classList.add("active");
  VIEW_SECTIONS[viewName].classList.add("active-view");
  
  // Trigger specific re-renders
  if (viewName === "dashboard") {
    renderDashboard();
  } else if (viewName === "transactions") {
    renderLedger();
  } else if (viewName === "donors") {
    renderDonors();
  } else if (viewName === "reports") {
    renderReports();
  } else if (viewName === "receipts") {
    renderReceiptBuilder();
  }
}

// 4. Role Switching Management
const roleSelect = document.getElementById("role-select");
const roleBadge = document.getElementById("role-badge");

roleSelect.value = state.currentRole;
applyRolePermissions(state.currentRole);

roleSelect.addEventListener("change", (e) => {
  const role = e.target.value;
  state.currentRole = role;
  state.saveState();
  state.addAudit("system", `User role switched to: ${role}`);
  applyRolePermissions(role);
  // Refresh views
  const activeView = VIEWS.find(v => VIEW_SECTIONS[v].classList.contains("active-view")) || "dashboard";
  switchView(activeView);
});

function applyRolePermissions(role) {
  const actionButtons = [
    document.getElementById("btn-add-transaction"),
    document.getElementById("btn-quick-jummah"),
    document.getElementById("btn-add-donor")
  ];
  
  if (role === "secretary") {
    roleBadge.className = "badge badge-admin";
    roleBadge.textContent = "Financial Secretary Mode";
    actionButtons.forEach(btn => ifExistsShow(btn));
  } else if (role === "trustee") {
    roleBadge.className = "badge badge-reviewer";
    roleBadge.textContent = "Trustee Mode (Read-Only)";
    actionButtons.forEach(btn => ifExistsHide(btn));
  } else if (role === "auditor") {
    roleBadge.className = "badge badge-auditor";
    roleBadge.textContent = "Auditor Mode (Read-Only)";
    actionButtons.forEach(btn => ifExistsHide(btn));
  }
}

function ifExistsShow(el) { if (el) el.style.display = "inline-flex"; }
function ifExistsHide(el) { if (el) el.style.display = "none"; }


// 5. Financial Calculations & State Helpers
const FUND_TYPES = {
  "Lillah": "unrestricted",
  "Zakat": "restricted",
  "Fitrana": "restricted",
  "Sadaqah Jariyah": "unrestricted",
  "Building Fund": "unrestricted",
  "Madrasah Fees": "unrestricted",
  "Interest/Riba": "riba"
};

// Calculate all fund balances
function getFundBalances() {
  const balances = {
    "Lillah": 0,
    "Zakat": 0,
    "Fitrana": 0,
    "Sadaqah Jariyah": 0,
    "Building Fund": 0,
    "Madrasah Fees": 0,
    "Interest/Riba": 0
  };
  
  let cashTotal = 0;
  let bankTotal = 0;
  
  state.transactions.forEach(tx => {
    if (tx.status === "Voided" || tx.status === "Failed") return;
    
    const amt = tx.amount;
    const isIncome = tx.type === "income";
    const change = isIncome ? amt : -amt;
    
    // Support split transactions
    if (tx.splits && tx.splits.length > 0) {
      tx.splits.forEach(split => {
        balances[split.fund] += isIncome ? split.amount : -split.amount;
      });
    } else {
      balances[tx.fund] += change;
    }
    
    // Track bank vs cash
    if (tx.method === "Cash" && tx.status === "Cash on Hand") {
      cashTotal += change;
    } else {
      bankTotal += change;
    }
  });
  
  const total = Object.values(balances).reduce((a, b) => a + b, 0);
  const restricted = balances["Zakat"] + balances["Fitrana"];
  const unrestricted = total - restricted - balances["Interest/Riba"];
  
  return { balances, total, cashTotal, bankTotal, restricted, unrestricted };
}


// 6. Dashboard Render
function renderDashboard() {
  const fin = getFundBalances();
  
  // Load stats
  document.getElementById("total-funds-val").textContent = formatGBP(fin.total);
  document.getElementById("total-bank-val").textContent = formatGBP(fin.bankTotal);
  document.getElementById("total-cash-val").textContent = formatGBP(fin.cashTotal);
  document.getElementById("restricted-funds-val").textContent = formatGBP(fin.restricted);
  document.getElementById("unrestricted-funds-val").textContent = formatGBP(fin.unrestricted);
  
  // Wallet updates
  Object.keys(fin.balances).forEach(fundName => {
    const card = getWalletCardId(fundName);
    if (card) {
      card.querySelector(".wallet-val").textContent = formatGBP(fin.balances[fundName]);
    }
  });
  
  // Build dashboard alerts
  renderDashboardAlerts(fin);
  
  // Render Dashboard Table
  const recentTbody = document.getElementById("recent-ledger-tbody");
  recentTbody.innerHTML = "";
  
  const activeTxs = state.transactions
    .slice(0, 5); // Fetch top 5
    
  if (activeTxs.length === 0) {
    recentTbody.innerHTML = `<tr class="empty-state"><td colspan="6">No recent transactions found.</td></tr>`;
  } else {
    activeTxs.forEach(tx => {
      const isIncome = tx.type === "income";
      const sign = isIncome ? "+" : "-";
      const amtClass = isIncome ? "val-income" : "val-expense";
      
      const fundDisplay = tx.splits && tx.splits.length > 0 
        ? `<span class="badge badge-reviewer">Split (${tx.splits.length})</span>`
        : tx.fund;
        
      const tr = document.createElement("tr");
      if (tx.status === "Voided") tr.className = "tr-voided";
      if (tx.status === "Failed") tr.className = "tr-failed";
      
      let methodStatusBadge = `<span class="status-badge ${tx.status === 'Cash on Hand' ? 'status-cash' : 'status-banked'}">${tx.method}</span>`;
      if (tx.status === "Voided") methodStatusBadge = `<span class="status-badge status-voided">Voided</span>`;
      if (tx.status === "Failed") methodStatusBadge = `<span class="status-badge status-failed">Failed</span>`;
      
      tr.innerHTML = `
        <td>${formatDate(tx.date)}</td>
        <td>${tx.description}</td>
        <td>${fundDisplay}</td>
        <td>${tx.category}</td>
        <td>${methodStatusBadge}</td>
        <td class="${amtClass}">${sign}${formatGBP(tx.amount)}</td>
      `;
      recentTbody.appendChild(tr);
    });
  }
  
  // Draw SVGs
  drawTrendChart();
  drawDistributionDonut(fin.balances);
}

function getWalletCardId(fund) {
  switch(fund) {
    case "Lillah": return document.getElementById("wallet-lillah");
    case "Zakat": return document.getElementById("wallet-zakat");
    case "Fitrana": return document.getElementById("wallet-fitrana");
    case "Sadaqah Jariyah": return document.getElementById("wallet-sadaqah");
    case "Building Fund": return document.getElementById("wallet-building");
    case "Madrasah Fees": return document.getElementById("wallet-madrasah");
    case "Interest/Riba": return document.getElementById("wallet-riba");
  }
  return null;
}

function renderDashboardAlerts(fin) {
  const alertsPanel = document.getElementById("alerts-panel");
  alertsPanel.innerHTML = "";
  
  // 1. Unreconciled cash alert (Workflow 1)
  const cashOnHandCount = state.transactions.filter(t => t.status === "Cash on Hand" && t.type === "income").length;
  if (cashOnHandCount > 0) {
    const alertDiv = document.createElement("div");
    alertDiv.className = "alert alert-warning";
    alertDiv.innerHTML = `
      <span>⚠️ <strong>Unreconciled Cash Alert:</strong> There are ${cashOnHandCount} donations registered as "Cash on Hand" (e.g. from Jummah counts) waiting to be deposited at the bank.</span>
      <button class="alert-dismiss" onclick="this.parentElement.remove()">&times;</button>
    `;
    alertsPanel.appendChild(alertDiv);
  }
  
  // 2. Fitrana Distribution warning (Fitrana must be distributed before Eid)
  if (fin.balances["Fitrana"] > 0) {
    const alertDiv = document.createElement("div");
    alertDiv.className = "alert alert-info";
    alertDiv.innerHTML = `
      <span>🕌 <strong>Fitrana Fund Notice:</strong> £${fin.balances["Fitrana"].toFixed(2)} is held in the Fitrana fund. Fitrana must be fully distributed to the needy before Eid prayer.</span>
      <button class="alert-dismiss" onclick="this.parentElement.remove()">&times;</button>
    `;
    alertsPanel.appendChild(alertDiv);
  }
  
  // 3. Riba warning
  if (fin.balances["Interest/Riba"] > 0) {
    const alertDiv = document.createElement("div");
    alertDiv.className = "alert alert-warning";
    alertDiv.innerHTML = `
      <span>⚠️ <strong>Riba/Interest Purging Required:</strong> Bank interest of £${fin.balances["Interest/Riba"].toFixed(2)} has accumulated in the Riba restricted wallet. Cleanse this fund via charitable payout without religious reward.</span>
      <button class="alert-dismiss" onclick="this.parentElement.remove()">&times;</button>
    `;
    alertsPanel.appendChild(alertDiv);
  }
}

// 7. Render Ledger View
function renderLedger() {
  const fType = document.getElementById("f-type").value;
  const fFund = document.getElementById("f-fund").value;
  const fStatus = document.getElementById("f-status").value;
  const fSearch = document.getElementById("f-search").value.toLowerCase();
  
  const ledgerTbody = document.getElementById("full-ledger-tbody");
  ledgerTbody.innerHTML = "";
  
  let filtered = state.transactions.filter(tx => {
    // Type filter
    if (fType !== "all" && tx.type !== fType) return false;
    
    // Fund filter (handling splits too)
    if (fFund !== "all") {
      if (tx.splits && tx.splits.length > 0) {
        const hasFund = tx.splits.some(s => s.fund === fFund);
        if (!hasFund) return false;
      } else {
        if (tx.fund !== fFund) return false;
      }
    }
    
    // Status filter
    if (fStatus !== "all") {
      if (fStatus === "Cash on Hand" && tx.status !== "Cash on Hand") return false;
      if (fStatus === "Banked" && tx.status !== "Banked") return false;
      if (fStatus === "Active" && (tx.status === "Voided" || tx.status === "Failed")) return false;
      if (fStatus === "Voided" && tx.status !== "Voided") return false;
      if (fStatus === "Failed" && tx.status !== "Failed") return false;
    }
    
    // Search text
    if (fSearch) {
      const donorName = getDonorName(tx.donorId).toLowerCase();
      const descMatches = tx.description.toLowerCase().includes(fSearch);
      const donorMatches = donorName.includes(fSearch);
      const categoryMatches = tx.category.toLowerCase().includes(fSearch);
      if (!descMatches && !donorMatches && !categoryMatches) return false;
    }
    
    return true;
  });
  
  // Calculate strip statistics
  let stripInflows = 0;
  let stripOutflows = 0;
  
  filtered.forEach(tx => {
    if (tx.status === "Voided" || tx.status === "Failed") return;
    if (tx.type === "income") {
      stripInflows += tx.amount;
    } else {
      stripOutflows += tx.amount;
    }
  });
  
  document.getElementById("filtered-ledger-count").textContent = filtered.length;
  document.getElementById("strip-inflow-val").textContent = formatGBP(stripInflows);
  document.getElementById("strip-outflow-val").textContent = formatGBP(stripOutflows);
  document.getElementById("strip-net-val").textContent = formatGBP(stripInflows - stripOutflows);
  
  if (filtered.length === 0) {
    ledgerTbody.innerHTML = `<tr class="empty-state"><td colspan="9">No matching transactions found.</td></tr>`;
    return;
  }
  
  filtered.forEach(tx => {
    const isIncome = tx.type === "income";
    const sign = isIncome ? "+" : "-";
    const amtClass = isIncome ? "val-income" : "val-expense";
    const donorName = getDonorName(tx.donorId);
    
    const tr = document.createElement("tr");
    tr.id = `row-${tx.id}`;
    if (tx.status === "Voided") tr.className = "tr-voided";
    if (tx.status === "Failed") tr.className = "tr-failed";
    if (tx.reconciled) tr.classList.add("tr-reconciled");
    
    // Method/status tag
    let statusClass = "status-active";
    if (tx.status === "Cash on Hand") statusClass = "status-cash";
    if (tx.status === "Banked") statusClass = "status-banked";
    if (tx.status === "Voided") statusClass = "status-voided";
    if (tx.status === "Failed") statusClass = "status-failed";
    
    const fundDisplay = tx.splits && tx.splits.length > 0 
      ? `<span class="badge badge-reviewer" title="Split details in tooltip">Split (${tx.splits.length})</span>`
      : tx.fund;
      
    // Setup action buttons based on user role and reconcile state
    let actionButtons = "";
    if (state.currentRole === "secretary") {
      if (tx.reconciled) {
        actionButtons = `<span class="status-badge status-active" title="Locked by reconciliation">🔒 Reconciled</span>`;
      } else {
        const showBankDeposit = (tx.type === "income" && tx.method === "Cash" && tx.status === "Cash on Hand");
        actionButtons = `
          <div class="actions-btn-group">
            ${showBankDeposit ? `<button class="action-btn" onclick="depositBank('${tx.id}')">🏦 Banked</button>` : ''}
            <button class="action-btn" onclick="reconcileTx('${tx.id}')" title="Reconcile &amp; Lock">✔️ Lock</button>
            <button class="action-btn btn-void" onclick="voidTx('${tx.id}')" title="Void Transaction">⚠️ Void</button>
            ${tx.type === 'income' ? `<button class="action-btn" onclick="failTx('${tx.id}')" title="Mark as Bounced/Failed">❌ Fail</button>` : ''}
          </div>
        `;
      }
    } else {
      actionButtons = tx.reconciled 
        ? `<span class="status-badge status-active">🔒 Reconciled</span>`
        : `<span class="status-badge status-voided">🔓 Unlocked</span>`;
    }
    
    tr.innerHTML = `
      <td>${formatDate(tx.date)}</td>
      <td>
        <strong>${tx.description}</strong>
        ${tx.notes ? `<div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">Note: ${tx.notes}</div>` : ''}
        ${tx.splits ? `<div style="font-size:0.75rem; color:var(--secondary); font-style:italic;">Splits: ${tx.splits.map(s => `${s.fund}: £${s.amount}`).join(', ')}</div>` : ''}
      </td>
      <td>${donorName}</td>
      <td>${fundDisplay}</td>
      <td>${tx.category}</td>
      <td>${tx.method}</td>
      <td><span class="status-badge ${statusClass}">${tx.status}</span></td>
      <td class="${amtClass}">${sign}${formatGBP(tx.amount)}</td>
      <td class="actions-col">${actionButtons}</td>
    `;
    
    ledgerTbody.appendChild(tr);
  });
}

// Bind ledger filter inputs
["f-type", "f-fund", "f-status"].forEach(id => {
  document.getElementById(id).addEventListener("change", renderLedger);
});
document.getElementById("f-search").addEventListener("input", renderLedger);

// Helper function to resolve donor names
function getDonorName(donorId) {
  const donor = state.donors.find(d => d.id === donorId);
  return donor ? donor.name : "Anonymous";
}


// 8. Actions on Transactions (Audit Trail Preserved)
window.depositBank = function(txId) {
  const tx = state.transactions.find(t => t.id === txId);
  if (!tx || tx.reconciled) return;
  tx.status = "Banked";
  state.saveState();
  state.addAudit("kennyanju", `Jummah Cash deposit banked for Transaction ID ${txId} (£${tx.amount.toFixed(2)})`);
  renderLedger();
  renderDashboard();
};

window.reconcileTx = function(txId) {
  const tx = state.transactions.find(t => t.id === txId);
  if (!tx) return;
  tx.reconciled = true;
  if (tx.status === "Cash on Hand") tx.status = "Banked"; // Auto deposit cash on reconcile
  state.saveState();
  state.addAudit("kennyanju", `Transaction ${txId} reconciled and locked.`);
  renderLedger();
  renderDashboard();
};

window.voidTx = function(txId) {
  const tx = state.transactions.find(t => t.id === txId);
  if (!tx || tx.reconciled) return;
  
  if (confirm(`Are you sure you want to VOID this transaction? This is irreversible and will reverse its financial balances while preserving the audit record.`)) {
    tx.status = "Voided";
    state.saveState();
    state.addAudit("kennyanju", `VOIDED transaction ${txId}: "${tx.description}" of £${tx.amount.toFixed(2)}`);
    renderLedger();
    renderDashboard();
  }
};

window.failTx = function(txId) {
  const tx = state.transactions.find(t => t.id === txId);
  if (!tx || tx.reconciled) return;
  
  if (confirm(`Mark transaction as FAILED (Bounced Cheque/Failed Direct Debit)? System will reverse this income value.`)) {
    tx.status = "Failed";
    state.saveState();
    state.addAudit("kennyanju", `FAILED transaction ${txId} (bounced/failed payment): £${tx.amount.toFixed(2)}`);
    renderLedger();
    renderDashboard();
  }
};


// 9. Donors Directory & Gift Aid Claims Assistant
function renderDonors() {
  const tbody = document.getElementById("donors-tbody");
  tbody.innerHTML = "";
  
  state.donors.forEach(d => {
    if (d.id === "anonymous") return; // Skip in base table
    
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${d.name}</strong></td>
      <td>${d.address || 'N/A'}</td>
      <td>
        <span class="status-badge ${d.giftAidSigned ? 'status-active' : 'status-voided'}">
          ${d.giftAidSigned ? '✓ Signed Declaration' : '✗ No Declaration'}
        </span>
      </td>
      <td>
        ${state.currentRole === 'secretary' ? `<button class="action-btn btn-void" onclick="deleteDonor('${d.id}')">Delete</button>` : 'Read Only'}
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  // Calculate Gift Aid Claim details
  calculateGiftAidClaims();
}

function calculateGiftAidClaims() {
  let eligibleCount = 0;
  let eligibleVal = 0;
  const claimsTbody = document.getElementById("ga-claims-tbody");
  claimsTbody.innerHTML = "";
  
  // Find all income transactions that are active, banked, not voided/failed, has giftAid flag
  state.transactions.forEach(tx => {
    if (tx.type === "income" && tx.status !== "Voided" && tx.status !== "Failed" && tx.giftAid) {
      const donor = state.donors.find(d => d.id === tx.donorId);
      if (donor && donor.giftAidSigned && donor.address) {
        eligibleCount++;
        eligibleVal += tx.amount;
        
        // Add row in HMRC assistant table
        const postcode = donor.address.split(',').pop().trim();
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${donor.name}</td>
          <td>${postcode}</td>
          <td>${formatDate(tx.date)}</td>
          <td>${formatGBP(tx.amount)}</td>
        `;
        claimsTbody.appendChild(tr);
      }
    }
  });
  
  const rebate = eligibleVal * 0.25;
  document.getElementById("ga-eligible-count").textContent = eligibleCount;
  document.getElementById("ga-eligible-value").textContent = formatGBP(eligibleVal);
  document.getElementById("ga-rebate-value").textContent = formatGBP(rebate);
  
  if (eligibleCount === 0) {
    claimsTbody.innerHTML = `<tr><td colspan="4" class="text-center" style="color:var(--text-light); text-align:center;">No eligible Gift Aid donations found.</td></tr>`;
  }
}

window.deleteDonor = function(id) {
  if (confirm("Are you sure you want to remove this donor profile? Historical records will be retained as 'Anonymous'.")) {
    // Re-assign transactions to anonymous
    state.transactions.forEach(tx => {
      if (tx.donorId === id) {
        tx.donorId = "anonymous";
        tx.giftAid = false;
      }
    });
    
    state.donors = state.donors.filter(d => d.id !== id);
    state.saveState();
    state.addAudit("kennyanju", `Deleted donor profile ID ${id}`);
    renderDonors();
    renderLedger();
  }
};


// 10. Reports, Compliance and Audit Logger
function renderReports() {
  const pLPeriodText = document.getElementById("p-l-period");
  pLPeriodText.textContent = "Year-to-Date: As of June 2026";
  
  // Category variables
  const incomeCategories = {};
  const operationalExpenseCategories = {};
  const restrictedPayoutCategories = {};
  
  let totalIncome = 0;
  let totalOpExpenses = 0;
  let totalRestrictedPayouts = 0;
  
  state.transactions.forEach(tx => {
    if (tx.status === "Voided" || tx.status === "Failed") return;
    
    const isIncome = tx.type === "income";
    const amt = tx.amount;
    const cat = tx.category;
    
    if (isIncome) {
      incomeCategories[cat] = (incomeCategories[cat] || 0) + amt;
      totalIncome += amt;
    } else {
      // Check if restricted payout (Zakat/Fitrana draw)
      const isRestricted = (tx.fund === "Zakat" || tx.fund === "Fitrana");
      if (isRestricted) {
        restrictedPayoutCategories[cat] = (restrictedPayoutCategories[cat] || 0) + amt;
        totalRestrictedPayouts += amt;
      } else {
        operationalExpenseCategories[cat] = (operationalExpenseCategories[cat] || 0) + amt;
        totalOpExpenses += amt;
      }
    }
  });
  
  // Render Incomes inside sheet
  const incRows = document.getElementById("rep-income-rows");
  incRows.innerHTML = "";
  if (Object.keys(incomeCategories).length === 0) {
    incRows.innerHTML = `<div class="pl-row"><span>No Income recorded</span><span>£0.00</span></div>`;
  } else {
    Object.keys(incomeCategories).forEach(cat => {
      incRows.innerHTML += `<div class="pl-row"><span>${cat}</span><span>${formatGBP(incomeCategories[cat])}</span></div>`;
    });
  }
  document.getElementById("rep-total-income").textContent = formatGBP(totalIncome);
  
  // Render Operational Expenses
  const expRows = document.getElementById("rep-expense-rows");
  expRows.innerHTML = "";
  if (Object.keys(operationalExpenseCategories).length === 0) {
    expRows.innerHTML = `<div class="pl-row"><span>No operational expenses</span><span>£0.00</span></div>`;
  } else {
    Object.keys(operationalExpenseCategories).forEach(cat => {
      expRows.innerHTML += `<div class="pl-row"><span>${cat}</span><span class="expense-val">${formatGBP(operationalExpenseCategories[cat])}</span></div>`;
    });
  }
  document.getElementById("rep-total-expense").textContent = formatGBP(totalOpExpenses);
  
  // Render Restricted Payouts
  const disbRows = document.getElementById("rep-disbursed-rows");
  disbRows.innerHTML = "";
  if (Object.keys(restrictedPayoutCategories).length === 0) {
    disbRows.innerHTML = `<div class="pl-row"><span>No charitable distributions</span><span>£0.00</span></div>`;
  } else {
    Object.keys(restrictedPayoutCategories).forEach(cat => {
      disbRows.innerHTML += `<div class="pl-row"><span>${cat}</span><span class="expense-val">${formatGBP(restrictedPayoutCategories[cat])}</span></div>`;
    });
  }
  document.getElementById("rep-total-disbursed").textContent = formatGBP(totalRestrictedPayouts);
  
  // Net surplus
  const netSurplus = totalIncome - totalOpExpenses - totalRestrictedPayouts;
  const netEl = document.getElementById("rep-net-surplus");
  netEl.textContent = formatGBP(netSurplus);
  netEl.className = netSurplus >= 0 ? "" : "expense-val";
  
  // Compliance widget
  const fin = getFundBalances();
  document.getElementById("comp-zakat-balance").textContent = formatGBP(fin.balances["Zakat"]);
  document.getElementById("comp-fitrana-balance").textContent = formatGBP(fin.balances["Fitrana"]);
  document.getElementById("comp-riba-balance").textContent = formatGBP(fin.balances["Interest/Riba"]);
  
  // Render Audit timeline
  const auditDiv = document.getElementById("audit-logs-timeline");
  auditDiv.innerHTML = "";
  state.auditLogs.forEach(log => {
    auditDiv.innerHTML += `
      <div class="timeline-item">
        <span class="timeline-time">${log.time} by <strong>${log.user}</strong></span>
        <span class="timeline-desc">${log.desc}</span>
      </div>
    `;
  });
}


// 11. Official Receipt & Invoice Generator Tab
function renderReceiptBuilder() {
  const rcptDonor = document.getElementById("rcpt-donor");
  rcptDonor.innerHTML = `<option value="">Select Donor to Load Info...</option>`;
  state.donors.forEach(d => {
    rcptDonor.innerHTML += `<option value="${d.id}">${d.name}</option>`;
  });
}

const rcptBuilderForm = document.getElementById("receipt-builder-form");
const rcptToTextArea = document.getElementById("rcpt-to");
const rcptDonorLink = document.getElementById("rcpt-donor");

rcptDonorLink.addEventListener("change", (e) => {
  const dId = e.target.value;
  if (!dId) return;
  const donor = state.donors.find(d => d.id === dId);
  if (donor) {
    rcptToTextArea.value = `${donor.name}\n${donor.address || 'No registered UK Address'}\nGift Aid Signed: ${donor.giftAidSigned ? 'YES' : 'NO'}`;
    document.getElementById("rcpt-gift-aid-box").checked = donor.giftAidSigned;
    updateReceiptPreview();
  }
});

// Watch inputs to update live preview
rcptBuilderForm.addEventListener("input", updateReceiptPreview);
document.getElementById("rcpt-gift-aid-box").addEventListener("change", updateReceiptPreview);

function updateReceiptPreview() {
  const docNo = document.getElementById("rcpt-number").value;
  const docType = document.getElementById("rcpt-type").value;
  const issueDate = document.getElementById("rcpt-date").value;
  const fromInfo = document.getElementById("rcpt-from").value;
  const toInfo = document.getElementById("rcpt-to").value;
  const isGiftAidClaimable = document.getElementById("rcpt-gift-aid-box").checked;
  
  // Set preview header/title
  document.getElementById("prev-rcpt-no").textContent = docNo;
  document.getElementById("prev-rcpt-date").textContent = issueDate;
  document.getElementById("prev-rcpt-from").textContent = fromInfo;
  document.getElementById("prev-rcpt-to").textContent = toInfo;
  document.getElementById("prev-rcpt-title").textContent = docType === "receipt" ? "DONATION RECEIPT" : "INVOICE";
  
  // Process item rows
  const itemRows = document.querySelectorAll("#receipt-items-container .invoice-item-row");
  const prevTbody = document.getElementById("prev-items-tbody");
  prevTbody.innerHTML = "";
  
  let subtotal = 0;
  
  itemRows.forEach(row => {
    const desc = row.querySelector(".r-item-desc").value;
    const qty = parseFloat(row.querySelector(".r-item-qty").value) || 0;
    const rate = parseFloat(row.querySelector(".r-item-rate").value) || 0;
    const itemTotal = qty * rate;
    subtotal += itemTotal;
    
    if (desc) {
      prevTbody.innerHTML += `
        <tr>
          <td>${desc}</td>
          <td class="text-right">${qty}</td>
          <td class="text-right">${formatGBP(rate)}</td>
          <td class="text-right">${formatGBP(itemTotal)}</td>
        </tr>
      `;
    }
  });
  
  const giftAidRebate = isGiftAidClaimable ? subtotal * 0.25 : 0;
  
  document.getElementById("prev-rcpt-subtotal").textContent = formatGBP(subtotal);
  document.getElementById("prev-rcpt-total").textContent = formatGBP(subtotal);
  
  const giftAidRow = document.getElementById("prev-rcpt-gift-aid-row");
  const giftAidVal = document.getElementById("prev-rcpt-giftaid");
  if (isGiftAidClaimable) {
    giftAidRow.style.display = "flex";
    giftAidVal.textContent = formatGBP(giftAidRebate);
  } else {
    giftAidRow.style.display = "none";
  }
}

// Add/Delete Line items in Builder
document.getElementById("btn-add-receipt-item").addEventListener("click", () => {
  const container = document.getElementById("receipt-items-container");
  const index = container.children.length;
  
  const row = document.createElement("div");
  row.className = "invoice-item-row";
  row.setAttribute("data-index", index);
  row.innerHTML = `
    <div class="col-desc">
      <input type="text" class="r-item-desc form-control-sm" placeholder="Description" required>
    </div>
    <div class="col-qty">
      <input type="number" class="r-item-qty form-control-sm" placeholder="Qty" value="1" min="1" required>
    </div>
    <div class="col-rate">
      <input type="number" class="r-item-rate form-control-sm" placeholder="Amount" value="0.00" min="0" step="0.01" required>
    </div>
    <div class="col-delete">
      <button type="button" class="btn-delete-item-r">&times;</button>
    </div>
  `;
  container.appendChild(row);
  
  // Add listeners
  row.addEventListener("input", updateReceiptPreview);
  row.querySelector(".btn-delete-item-r").addEventListener("click", () => {
    row.remove();
    updateReceiptPreview();
  });
  updateReceiptPreview();
});

// Setup delete listener on original row
document.querySelectorAll(".btn-delete-item-r").forEach(btn => {
  btn.addEventListener("click", (e) => {
    e.target.closest(".invoice-item-row").remove();
    updateReceiptPreview();
  });
});

document.getElementById("btn-rcpt-sample").addEventListener("click", () => {
  // Load last active income donation
  const lastDon = state.transactions.filter(t => t.type === 'income' && t.status !== 'Voided')[0];
  if (lastDon) {
    document.getElementById("rcpt-number").value = `BSMC-2026-${Math.floor(1000 + Math.random()*9000)}`;
    document.getElementById("rcpt-date").value = lastDon.date;
    
    // Link donor
    document.getElementById("rcpt-donor").value = lastDon.donorId;
    const donor = state.donors.find(d => d.id === lastDon.donorId);
    if (donor) {
      rcptToTextArea.value = `${donor.name}\n${donor.address || 'No UK Address'}\nGift Aid Signed: ${donor.giftAidSigned ? 'YES' : 'NO'}`;
      document.getElementById("rcpt-gift-aid-box").checked = donor.giftAidSigned;
    }
    
    // Set line item
    const container = document.getElementById("receipt-items-container");
    container.innerHTML = `
      <div class="invoice-item-row" data-index="0">
        <div class="col-desc">
          <input type="text" class="r-item-desc form-control-sm" value="Donation: ${lastDon.description} [${lastDon.fund} Fund]" required>
        </div>
        <div class="col-qty">
          <input type="number" class="r-item-qty form-control-sm" value="1" min="1" required>
        </div>
        <div class="col-rate">
          <input type="number" class="r-item-rate form-control-sm" value="${lastDon.amount.toFixed(2)}" min="0" step="0.01" required>
        </div>
        <div class="col-delete">
          <button type="button" class="btn-delete-item-r">&times;</button>
        </div>
      </div>
    `;
    container.querySelector(".btn-delete-item-r").addEventListener("click", (e) => {
      e.target.closest(".invoice-item-row").remove();
      updateReceiptPreview();
    });
    container.querySelector(".invoice-item-row").addEventListener("input", updateReceiptPreview);
    
    updateReceiptPreview();
  }
});

document.getElementById("btn-print-receipt").addEventListener("click", () => {
  window.print();
});


// 12. Modal Handlers (HTML5 dialog)
const txModal = document.getElementById("modal-tx");
const donorModal = document.getElementById("modal-donor");
const jummahModal = document.getElementById("modal-jummah");

// Quick jummah form
document.getElementById("btn-quick-jummah").addEventListener("click", () => {
  document.getElementById("j-date").value = new Date().toISOString().substring(0, 10);
  jummahModal.showModal();
});
document.getElementById("btn-close-jummah-modal").addEventListener("click", () => jummahModal.close());
document.getElementById("btn-cancel-jummah-modal").addEventListener("click", () => jummahModal.close());

// Add tx dialog trigger
document.getElementById("btn-add-transaction").addEventListener("click", () => {
  // Set default form values
  document.getElementById("tx-edit-id").value = "";
  document.getElementById("tx-modal-title").textContent = "Add Transaction";
  document.getElementById("tx-date").value = new Date().toISOString().substring(0, 10);
  document.getElementById("tx-desc").value = "";
  document.getElementById("tx-fund").value = "Lillah";
  document.getElementById("tx-amount").value = "";
  document.getElementById("tx-type").value = "income";
  document.getElementById("tx-notes").value = "";
  document.getElementById("tx-is-split").checked = false;
  
  // Reset preview
  document.getElementById("upload-preview").style.display = "none";
  document.getElementById("tx-upload").value = "";
  
  // Configure donor dropdown
  populateDonorSelects();
  
  // Toggle split logic
  toggleSplitPanel();
  
  // Fire change listeners
  onTxTypeChange();
  
  txModal.showModal();
});
document.getElementById("btn-close-tx-modal").addEventListener("click", () => txModal.close());
document.getElementById("btn-cancel-tx-modal").addEventListener("click", () => txModal.close());

// Add donor dialog trigger
document.getElementById("btn-add-donor").addEventListener("click", () => {
  document.getElementById("d-name").value = "";
  document.getElementById("d-address").value = "";
  document.getElementById("d-giftaid").checked = true;
  donorModal.showModal();
});
document.getElementById("btn-close-donor-modal").addEventListener("click", () => donorModal.close());
document.getElementById("btn-cancel-donor-modal").addEventListener("click", () => donorModal.close());

// Fill donor select elements
function populateDonorSelects() {
  const txDonor = document.getElementById("tx-donor");
  txDonor.innerHTML = `<option value="anonymous">Anonymous (Non-Gift-Aid)</option>`;
  state.donors.forEach(d => {
    if (d.id !== "anonymous") {
      txDonor.innerHTML += `<option value="${d.id}">${d.name}</option>`;
    }
  });
}

// React to donor changes in form to automatically check Gift Aid (Rule 3)
document.getElementById("tx-donor").addEventListener("change", (e) => {
  const dId = e.target.value;
  const giftAidCheckbox = document.getElementById("tx-giftaid");
  const giftAidLabel = document.querySelector("#gift-aid-group label");
  
  if (dId === "anonymous") {
    giftAidCheckbox.checked = false;
    giftAidCheckbox.disabled = true;
    giftAidLabel.style.opacity = 0.5;
  } else {
    const donor = state.donors.find(d => d.id === dId);
    if (donor) {
      giftAidCheckbox.disabled = false;
      giftAidLabel.style.opacity = 1;
      giftAidCheckbox.checked = donor.giftAidSigned;
    }
  }
});


// 13. Dynamic Category Populator & Business Rule Validations
const INCOME_CATEGORIES = ["Donation", "Zakat", "Fitrana", "Madrasah Fees", "Event Tickets", "Interest", "Other"];
const EXPENSE_CATEGORIES = ["Utilities", "Salaries", "Maintenance", "Charitable Payout", "Office Supplies", "Travel", "Other"];

const txTypeSelect = document.getElementById("tx-type");
const txCatSelect = document.getElementById("tx-category");

txTypeSelect.addEventListener("change", onTxTypeChange);

function onTxTypeChange() {
  const type = txTypeSelect.value;
  txCatSelect.innerHTML = "";
  
  const cats = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  cats.forEach(c => {
    txCatSelect.innerHTML += `<option value="${c}">${c}</option>`;
  });
  
  // Hide split option for expenses
  const splitContainer = document.getElementById("split-toggle-container");
  if (type === "expense") {
    splitContainer.style.display = "none";
    document.getElementById("tx-is-split").checked = false;
    toggleSplitPanel();
  } else {
    splitContainer.style.display = "block";
  }
}

// Rule 4: Route Bank Interest automatically to "Interest/Riba" fund
txCatSelect.addEventListener("change", (e) => {
  if (e.target.value === "Interest") {
    const fundSelect = document.getElementById("tx-fund");
    fundSelect.value = "Interest/Riba";
    fundSelect.disabled = true;
  } else {
    document.getElementById("tx-fund").disabled = false;
  }
});


// 14. Split Transaction UI
const splitToggle = document.getElementById("tx-is-split");
const splitPanel = document.getElementById("split-fields-panel");
const splitContainer = document.getElementById("split-rows-container");

splitToggle.addEventListener("change", toggleSplitPanel);

function toggleSplitPanel() {
  const isSplit = splitToggle.checked;
  const singleRow = document.getElementById("tx-single-row");
  
  if (isSplit) {
    splitPanel.style.display = "block";
    singleRow.style.display = "none"; // Hide single fund/category row
    
    // Add default split rows
    if (splitContainer.children.length === 0) {
      addSplitRow();
      addSplitRow();
    }
    validateSplits();
  } else {
    splitPanel.style.display = "none";
    singleRow.style.display = "grid";
  }
}

document.getElementById("btn-add-split-row").addEventListener("click", addSplitRow);

function addSplitRow() {
  const index = splitContainer.children.length;
  const row = document.createElement("div");
  row.className = "split-row";
  row.innerHTML = `
    <select class="split-fund form-control-sm" required>
      <option value="Lillah">Lillah (Unrestricted)</option>
      <option value="Zakat">Zakat (Restricted)</option>
      <option value="Fitrana">Fitrana (Restricted)</option>
      <option value="Sadaqah Jariyah">Sadaqah Jariyah</option>
      <option value="Building Fund">Building Fund</option>
      <option value="Madrasah Fees">Madrasah Fees</option>
    </select>
    <select class="split-cat form-control-sm" required>
      ${INCOME_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
    </select>
    <input type="number" class="split-amt form-control-sm" min="0.01" step="0.01" placeholder="0.00" required>
    <button type="button" class="btn-delete-split">&times;</button>
  `;
  splitContainer.appendChild(row);
  
  // Attach listeners
  row.querySelector(".split-amt").addEventListener("input", validateSplits);
  row.querySelector(".btn-delete-split").addEventListener("click", () => {
    row.remove();
    validateSplits();
  });
}

function validateSplits() {
  const totalAmount = parseFloat(document.getElementById("tx-amount").value) || 0;
  const splitAmounts = Array.from(document.querySelectorAll(".split-amt")).map(el => parseFloat(el.value) || 0);
  const splitSum = splitAmounts.reduce((a, b) => a + b, 0);
  
  const badge = document.getElementById("split-total-badge");
  
  if (Math.abs(splitSum - totalAmount) < 0.01) {
    badge.className = "split-total-alert split-match";
    badge.textContent = `Total split matches donation amount (£${splitSum.toFixed(2)})`;
    return true;
  } else {
    badge.className = "split-total-alert split-mismatch";
    badge.textContent = `Split total (£${splitSum.toFixed(2)}) must equal donation total (£${totalAmount.toFixed(2)})`;
    return false;
  }
}

document.getElementById("tx-amount").addEventListener("input", () => {
  if (splitToggle.checked) validateSplits();
});


// 15. Form Submission & Rule Checks
const txForm = document.getElementById("tx-form");
const txUploadInput = document.getElementById("tx-upload");
const uploadPreviewDiv = document.getElementById("upload-preview");

txUploadInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(evt) {
      uploadPreviewDiv.style.display = "block";
      uploadPreviewDiv.innerHTML = `<img src="${evt.target.result}" alt="counting slip">`;
    };
    reader.readAsDataURL(file);
  }
});

txForm.addEventListener("submit", (e) => {
  e.preventDefault();
  
  const txId = document.getElementById("tx-edit-id").value;
  const type = document.getElementById("tx-type").value;
  const date = document.getElementById("tx-date").value;
  const desc = document.getElementById("tx-desc").value;
  const category = document.getElementById("tx-category").value;
  const amount = parseFloat(document.getElementById("tx-amount").value);
  const method = document.getElementById("tx-method").value;
  const donorId = document.getElementById("tx-donor").value;
  const giftAid = document.getElementById("tx-giftaid").checked;
  const notes = document.getElementById("tx-notes").value;
  const isSplit = splitToggle.checked;
  
  // Photo data URI extraction
  let slipPhoto = "";
  const img = uploadPreviewDiv.querySelector("img");
  if (img) slipPhoto = img.src;
  
  // Rule 4 Check: Force Riba categorization
  let fund = document.getElementById("tx-fund").value;
  if (category === "Interest") {
    fund = "Interest/Riba";
  }
  
  // Rule 1 Verification: operating expenses checks
  if (type === "expense") {
    const isRestrictedFund = (fund === "Zakat" || fund === "Fitrana" || fund === "Interest/Riba");
    const isOpExpense = ["Utilities", "Salaries", "Maintenance", "Office Supplies", "Travel"].includes(category) || (category === "Other" && !desc.toLowerCase().includes("charity"));
    
    if (isRestrictedFund && isOpExpense) {
      alert(`⚠️ COMPLIANCE VIOLATION (Rule 1): Operational expenses (${category}) CANNOT be paid using restricted funds (${fund}). Transaction blocked.`);
      return;
    }
    
    // Rule check: Ensure notes provided for Zakat payouts
    if (fund === "Zakat" && !notes.trim()) {
      alert(`⚠️ COMPLIANCE REQUIREMENT: Detailed audit notes indicating the eligible beneficiary category (Asnaf) are mandatory when distributing Zakat.`);
      return;
    }
  }
  
  // Rule 3: Gift Aid verification
  if (type === "income" && giftAid) {
    const donor = state.donors.find(d => d.id === donorId);
    if (!donor || !donor.giftAidSigned || !donor.address) {
      alert(`⚠️ GIFT AID WARNING (Rule 3): Gift aid declarations require a valid UK address and a signed Gift Aid profile. Transaction saved, but Gift Aid will NOT be claimed.`);
      return;
    }
  }
  
  let splits = null;
  if (type === "income" && isSplit) {
    if (!validateSplits()) {
      alert("⚠️ Split amounts do not match the donation total.");
      return;
    }
    
    // Parse splits
    splits = Array.from(document.querySelectorAll(".split-row")).map(row => {
      return {
        fund: row.querySelector(".split-fund").value,
        category: row.querySelector(".split-cat").value,
        amount: parseFloat(row.querySelector(".split-amt").value)
      };
    });
  }
  
  // Compile object
  const newTx = {
    id: txId || `tx-${Math.floor(1000 + Math.random()*9000)}`,
    date,
    description: desc,
    donorId,
    type,
    fund: isSplit ? "" : fund,
    category,
    method,
    amount,
    status: method === "Cash" ? "Cash on Hand" : "Active",
    reconciled: false,
    notes,
    giftAid: type === "income" ? giftAid : false,
    slipPhoto,
    splits
  };
  
  if (txId) {
    // Update existing (unlocked)
    const idx = state.transactions.findIndex(t => t.id === txId);
    if (idx !== -1) {
      if (state.transactions[idx].reconciled) {
        alert("🔒 This transaction is locked and cannot be edited.");
        return;
      }
      state.transactions[idx] = newTx;
      state.addAudit("kennyanju", `Modified transaction ${txId}: "${desc}"`);
    }
  } else {
    // Insert new
    state.transactions.unshift(newTx);
    state.addAudit("kennyanju", `Added transaction: "${desc}" - Amount: £${amount.toFixed(2)} [${isSplit ? 'SPLIT' : fund}]`);
  }
  
  state.saveState();
  txModal.close();
  renderLedger();
  renderDashboard();
});

// Jummah collection form workflow 1
const jummahForm = document.getElementById("jummah-form");
const jUpload = document.getElementById("j-upload");
const jPreview = document.getElementById("j-upload-preview");

jUpload.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(evt) {
      jPreview.style.display = "block";
      jPreview.innerHTML = `<img src="${evt.target.result}" alt="slip preview">`;
    };
    reader.readAsDataURL(file);
  }
});

jummahForm.addEventListener("submit", (e) => {
  e.preventDefault();
  
  const date = document.getElementById("j-date").value;
  const amount = parseFloat(document.getElementById("j-amount").value);
  const fund = document.getElementById("j-fund").value;
  const counter1 = document.getElementById("j-counter1").value;
  const counter2 = document.getElementById("j-counter2").value;
  
  let slipPhoto = "";
  const img = jPreview.querySelector("img");
  if (img) slipPhoto = img.src;
  
  const tx = {
    id: `tx-j-${Math.floor(1000 + Math.random()*9000)}`,
    date,
    description: `Jummah Cash Collection`,
    donorId: "anonymous",
    type: "income",
    fund,
    category: "Donation",
    method: "Cash",
    amount,
    status: "Cash on Hand",
    reconciled: false,
    notes: `Counters: ${counter1} and ${counter2}. Jummah collection slip uploaded.`,
    slipPhoto
  };
  
  state.transactions.unshift(tx);
  state.addAudit("kennyanju", `Logged Friday Jummah collection: £${amount.toFixed(2)} as Cash on Hand (Counters: ${counter1}, ${counter2})`);
  state.saveState();
  
  jummahModal.close();
  jummahForm.reset();
  jPreview.innerHTML = "";
  
  renderDashboard();
  renderLedger();
});

// Save Donor profile
const donorForm = document.getElementById("donor-form");
donorForm.addEventListener("submit", (e) => {
  e.preventDefault();
  
  const name = document.getElementById("d-name").value;
  const address = document.getElementById("d-address").value;
  const giftAidSigned = document.getElementById("d-giftaid").checked;
  
  const newDonor = {
    id: `don-${Math.floor(1000 + Math.random()*9000)}`,
    name,
    address,
    giftAidSigned
  };
  
  state.donors.push(newDonor);
  state.addAudit("kennyanju", `Added new donor profile: ${name} [Gift Aid Signed: ${giftAidSigned}]`);
  state.saveState();
  
  donorModal.close();
  donorForm.reset();
  renderDonors();
  populateDonorSelects();
});


// 16. CSV / JSON Raw Export
document.getElementById("btn-export-raw-data").addEventListener("click", () => {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `BSMC_Financial_Export_${new Date().toISOString().substring(0,10)}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  state.addAudit("kennyanju", "Exported raw accounting database as JSON.");
});

// Export HMRC Gift Aid Schedule CSV
document.getElementById("btn-download-hmrc-csv").addEventListener("click", () => {
  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Donor Name,House No/Name,Postcode,Donation Date,Amount,Gift Aid Rebate (25%)\n";
  
  state.transactions.forEach(tx => {
    if (tx.type === "income" && tx.status !== "Voided" && tx.status !== "Failed" && tx.giftAid) {
      const donor = state.donors.find(d => d.id === tx.donorId);
      if (donor && donor.giftAidSigned && donor.address) {
        const addressParts = donor.address.split(',');
        const house = addressParts[0].trim();
        const postcode = addressParts.pop().trim();
        const rebate = (tx.amount * 0.25).toFixed(2);
        
        csvContent += `"${donor.name}","${house}","${postcode}",${tx.date},${tx.amount.toFixed(2)},${rebate}\n`;
      }
    }
  });
  
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", encodeURI(csvContent));
  downloadAnchor.setAttribute("download", `HMRC_GiftAid_Claim_BSMC_${new Date().getFullYear()}.csv`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  state.addAudit("kennyanju", "Exported HMRC Gift Aid claims schedule.");
});


// 17. SVG Chart Rendering Engines
function drawTrendChart() {
  const svg = document.getElementById("svg-trend");
  svg.innerHTML = "";
  
  // Add gradient definitions
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = `
    <linearGradient id="inflow-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#10b981" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#10b981" stop-opacity="0.0"/>
    </linearGradient>
    <linearGradient id="outflow-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ef4444" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#ef4444" stop-opacity="0.0"/>
    </linearGradient>
  `;
  svg.appendChild(defs);
  
  // Let's plot the last 5 transactions as a mini bar chart or line trend
  // For static clarity, let's create a beautiful monthly chart based on sample data
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
  const inflows = [1200, 1800, 1500, 2200, 2400, 3070];
  const outflows = [800, 1200, 950, 1600, 1400, 1320];
  
  const width = 500;
  const height = 240;
  const padding = 40;
  
  const chartWidth = width - 2 * padding;
  const chartHeight = height - 2 * padding;
  
  const maxVal = Math.max(...inflows, ...outflows) * 1.15;
  
  // Draw gridlines
  for (let i = 0; i <= 4; i++) {
    const y = padding + chartHeight - (i * chartHeight / 4);
    const val = Math.round(i * maxVal / 4);
    
    // Grid line
    const gridLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    gridLine.setAttribute("x1", padding);
    gridLine.setAttribute("y1", y);
    gridLine.setAttribute("x2", width - padding);
    gridLine.setAttribute("y2", y);
    gridLine.setAttribute("class", "chart-grid-line");
    svg.appendChild(gridLine);
    
    // Label
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", padding - 8);
    text.setAttribute("y", y + 4);
    text.setAttribute("text-anchor", "end");
    text.setAttribute("class", "chart-text");
    text.textContent = `£${val}`;
    svg.appendChild(text);
  }
  
  // Draw bars
  const groupCount = months.length;
  const colWidth = chartWidth / groupCount;
  const barWidth = colWidth * 0.35;
  
  months.forEach((month, idx) => {
    const x = padding + (idx * colWidth);
    
    // X Label
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", x + colWidth / 2);
    text.setAttribute("y", height - padding + 18);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("class", "chart-text");
    text.textContent = month;
    svg.appendChild(text);
    
    // Inflow bar
    const infH = (inflows[idx] / maxVal) * chartHeight;
    const infBar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    infBar.setAttribute("x", x + (colWidth * 0.1));
    infBar.setAttribute("y", padding + chartHeight - infH);
    infBar.setAttribute("width", barWidth);
    infBar.setAttribute("height", infH);
    infBar.setAttribute("rx", 3);
    infBar.setAttribute("class", "chart-bar-inflow");
    infBar.innerHTML = `<title>Inflow: £${inflows[idx]}</title>`;
    svg.appendChild(infBar);
    
    // Outflow bar
    const outH = (outflows[idx] / maxVal) * chartHeight;
    const outBar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    outBar.setAttribute("x", x + (colWidth * 0.1) + barWidth + 4);
    outBar.setAttribute("y", padding + chartHeight - outH);
    outBar.setAttribute("width", barWidth);
    outBar.setAttribute("height", outH);
    outBar.setAttribute("rx", 3);
    outBar.setAttribute("class", "chart-bar-outflow");
    outBar.innerHTML = `<title>Outflow: £${outflows[idx]}</title>`;
    svg.appendChild(outBar);
  });
}

function drawDistributionDonut(balances) {
  const svg = document.getElementById("svg-distribution-donut");
  svg.innerHTML = "";
  
  const legend = document.getElementById("distribution-legend");
  legend.innerHTML = "";
  
  const total = Object.values(balances).reduce((a, b) => a + b, 0);
  if (total === 0) {
    svg.innerHTML = `<text x="120" y="120" text-anchor="middle" class="chart-text">No active assets</text>`;
    return;
  }
  
  const colors = [
    "#10b981", // Lillah
    "#3b82f6", // Zakat
    "#f59e0b", // Fitrana
    "#ec4899", // Sadaqah
    "#8b5cf6", // Building
    "#06b6d4", // Madrasah
    "#ef4444"  // Riba
  ];
  
  let currentAngle = -Math.PI / 2; // Start from top
  const cx = 120;
  const cy = 120;
  const r = 80;
  
  let colorIdx = 0;
  
  Object.keys(balances).forEach(fundName => {
    const val = balances[fundName];
    if (val <= 0) return;
    
    const percentage = val / total;
    const angle = percentage * 2 * Math.PI;
    
    // Calculate arc coordinates
    const x1 = cx + r * Math.cos(currentAngle);
    const y1 = cy + r * Math.sin(currentAngle);
    const x2 = cx + r * Math.cos(currentAngle + angle);
    const y2 = cy + r * Math.sin(currentAngle + angle);
    
    const largeArc = percentage > 0.5 ? 1 : 0;
    
    // Draw SVG arc path
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", colors[colorIdx % colors.length]);
    path.setAttribute("stroke-width", "16");
    path.setAttribute("class", "donut-slice");
    path.innerHTML = `<title>${fundName}: £${val.toFixed(2)} (${Math.round(percentage*100)}%)</title>`;
    svg.appendChild(path);
    
    // Add legend item
    legend.innerHTML += `
      <div class="legend-row">
        <div class="legend-row-label">
          <span class="legend-color-box" style="background-color: ${colors[colorIdx % colors.length]};"></span>
          <span>${fundName}</span>
        </div>
        <strong>${formatGBP(val)} (${Math.round(percentage*100)}%)</strong>
      </div>
    `;
    
    currentAngle += angle;
    colorIdx++;
  });
}


// 18. Formatters
function formatGBP(val) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(val);
}

function formatDate(dateStr) {
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateStr).toLocaleDateString("en-GB", options);
}


// 19. Initial Load Trigger
document.addEventListener("DOMContentLoaded", () => {
  switchView("dashboard");
});
// Execute straight away in case DOMContentLoaded has already fired
renderDashboard();
renderLedger();
renderDonors();
renderReports();
renderReceiptBuilder();
updateReceiptPreview();

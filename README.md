# Majid Accounting: BSMC Financial Management System (Next.js & Supabase Rebuild)

This is the Next.js and Supabase-aligned financial management system for the **Bristol South Muslim Community (BSMC)**, following the Architecture Design Document (ADD) and Backend Implementation Guide.

The system features a **Backend-for-Frontend (BFF)** layer via Next.js App Router API routes, simulated PostgreSQL database triggers, ACID transactional compliance, Row-Level Security (RLS) policies, and UK Charity Commission & HMRC Gift Aid claims integration.

---

## 🕌 Architecture & Module Boundaries

The project is structured into five core boundaries:
1. **Identity & Access Management (IAM)**: Governs role-based logins (Admin/Secretary, Reviewer/Trustee, Auditor) and checks write permissions before executing mutations.
2. **Ledger & Transaction Module**: Logs cash, bank transfers, and direct debit transactions, and links them to specific donor profiles. Enforces atomic splits.
3. **Fund Management Module**: Dynamic tracking of balances across Restricted (Zakat, Fitrana) and Unrestricted (Lillah, Sadaqah Jariyah, Building Fund, Madrasah Fees) accounts.
4. **Donor & Gift Aid Module**: Validates UK address profiles and Gift Aid signed declarations, flagging claims automatically.
5. **Reporting & Export Module**: Renders Profit & Loss summaries and generates HMRC-compatible Gift Aid Claim CSV schedules.

---

## ⚙️ Backend triggers & compliance rules (Supabase Mock)

To run the application locally without requiring a live Supabase project setup, a server-side PostgreSQL simulator is implemented in `src/lib/db.js` reading/writing to `src/data/db.json`. This simulates actual database triggers:

*   **Fund Segregation (Rule 1)**: Any `EXPENSE` transaction where splits map operational expenses (e.g. `Mosque Utilities`, `Maintenance`, `Imam Salary`) to Zakat or Fitrana is rejected with a compliance trigger exception.
*   **Audit Trail (Rule 2)**: Physical deletions are disabled. The controller intercepts deletes and soft-voids transactions to preserve financial audit trails.
*   **Gift Aid Validator (Rule 3)**: Income transactions only claim Gift Aid if linked to a donor with a signed declaration and UK address.
*   **Riba Routing (Rule 4)**: Interest category incomes are automatically routed to the restricted `Interest/Riba` fund.

---

## 🚀 Running the App Locally

### 1. Install Dependencies
```sh
npm install
```

### 2. Launch Development Server
```sh
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Run Automated Compliance Tests
A test suite is available to verify database constraints:
```sh
node src/lib/test_compliance.js
```

---

## 🌐 API Routes Contracts

*   `GET/POST /api/transactions` - Fetch transactions with filters or create atomic transactions with splits.
*   `POST /api/transactions/[id]/void` - Voids transactions and updates the audit log.
*   `GET /api/funds/balances` - Calculates balances for all funds dynamically.
*   `GET /api/reports/giftaid` - Exports HMRC formatted Gift Aid claims schedule (CSV format).
*   `GET/POST /api/donors` - Fetch and register donors.
*   `GET /api/audits` - Reads immutable administrative logs.

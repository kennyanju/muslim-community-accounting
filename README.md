# Majid Accounting: BSMC Financial Management System

A customized, low-cost, and secure financial management platform tailored for the **Bristol South Muslim Community (BSMC)**. The application is designed to run efficiently inside any modern web browser with **£0/month in hosting costs**, providing robust tools for compliance, Islamic fund segregation, and UK Charity Commission / HMRC reporting.

---

## 🕌 Core Features & Islamic Compliance

The system implements four strict business rules directly inside the core application architecture:

1. **Strict Fund Segregation (Rule 1)**: Operational expenses (utilities, teacher/Imam salaries, mosque maintenance) are blocked from drawing on restricted funds (**Zakat** or **Fitrana**). If a user attempts to log an operational expense using these funds, the system triggers a compliance validation warning and blocks the transaction.
2. **Immutable Software Audit Trails (Rule 2)**: Permanent deletions of transactions are disabled. Erroneous records are instead "Voided" (or marked as "Failed" in the case of bounced cheques/direct debits). The system reverses their financial impact while retaining the record in the transaction log with a visual strikethrough, logging all actions to the immutable timeline.
3. **Gift Aid Eligibility Checker (Rule 3)**: Automatic checks ensure that a donation is only marked for Gift Aid if the attached donor profile possesses a valid UK address and a signed Gift Aid declaration.
4. **Interest (Riba) Purging Control (Rule 4)**: Incoming bank interest payments are automatically categorized into a separate restricted "Interest/Riba" fund. These funds are locked from being spent on mosque operations and are highlighted on the dashboard to be purged through specific charitable distributions without religious reward.

---

## ⚙️ Role-Based Access Controls (Simulated)

The application simulates the three core roles outlined in the BRD:
* **🕌 Financial Secretary (Admin)**: Full CRUD access. Able to log transactions, record Jummah cash collections, create donor profiles, and perform monthly bank reconciliations.
* **👥 Trustee / Chairman (Reviewer)**: Read-only access to dashboards, reports, and transaction logs. Action buttons and CRUD forms are hidden/disabled to preserve read-only compliance.
* **🔍 Auditor / Accountant**: Read-only access with active controls to export the entire ledger (JSON/CSV) for Charity Commission filings and view the system audit trail logs.

---

## 📋 Key Workflows Implemented

### Workflow 1: Jummah (Friday) Cash Collection
1. Click **Jummah Log** in the header.
2. Log the date, total cash counted, primary fund bucket, and names of the two counters.
3. Upload a photo of the signed cash-counting slip (mock file upload).
4. The system registers the transaction under the status **Cash on Hand**.
5. Once the deposit is taken to the bank, click the **🏦 Banked** button on that ledger item to update its status to **Banked**.

### Workflow 2: Zakat Payout / Distribution
1. Check the Zakat balance on the dashboard.
2. Click **Add Transaction** and set the Type to **Expense**.
3. Select **Zakat** as the fund and **Charitable Payout** as the category.
4. The system enforces that you must specify the **Asnaf beneficiary category** inside the Audit Notes before saving.

### Workflow 3: Reconciling Bank Statements
1. Compare logged transactions with the bank statement.
2. Click **✔️ Lock** next to the transaction in the ledger.
3. The transaction is marked as **🔒 Reconciled** and is locked from further edits or voiding.

---

## 🛠️ Technology Stack & Local Running

* **Core**: Semantic HTML5 and Vanilla Javascript.
* **Styling**: Vanilla CSS utilizing CSS Variables, Glassmorphism backdrop-filters, custom scrollbar styling, responsive media queries, and dark mode hooks.
* **Graphics**: Pure SVG-based responsive charting engine (Inflow vs Outflow bar charts, Fund Allocation donut charts).
* **Storage**: Browser-based LocalStorage synchronization.

### Running Locally
To launch the application locally, you can open `index.html` directly in any modern browser:

```sh
open index.html
```

Or run a local development server using `http-server` or Node:

```sh
npx -y http-server -p 8080
```
Then navigate to `http://localhost:8080`.

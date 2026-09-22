# 🕌 UK Mosque Treasurer & Governance Operational Manual
**Standard Operating Procedures for Mosque Financial Secretaries, Trustees, and Independent Examiners**  
*Applicable to: UK Registered Charities under Charities Act 2011, HMRC Gift Aid Regulations, and Islamic Shariah Fund Governance*

---

## 1. Regulatory Framework & Governance Principles

This accounting system is purpose-built for UK mosques and Muslim community centres. It enforces three non-negotiable governance principles:

1. **Charity Commission Compliance (CC16 / Receipts & Payments)**:
   - Designed for UK charities with gross annual income under £250,000 using Receipts and Payments accounting (SORP FRS 102 CC16).
   - Implements strict cash-flow segregation across unrestricted and restricted funds.
2. **Shariah Fund Segregation**:
   - **Restricted Funds** (*Zakat, Fitrana, Sadaqah Jariyah, Building Fund*): May never be used for general operational bills, staff salaries, or utility costs. Zakat must be disbursed strictly to verified beneficiaries across the Quranic *Asnaf* categories (Surah At-Tawbah 9:60).
   - **Unrestricted Funds** (*General Lillah Fund, Madrasah Fees*): Used for general mosque operations, maintenance, heating, electricity, and payment processing fees.
   - **Purged Funds** (*Interest / Riba*): Bank interest credited by commercial banks must be segregated into the *Interest/Riba* fund and purged to public sanitary infrastructure or community welfare without claiming religious reward (*thawab*).
3. **Mathematical Precision & Anti-Tamper Auditability**:
   - All internal values are stored in **integer pence** (e.g., £150.50 is stored as `15050`) to eliminate IEEE-754 floating-point rounding errors.
   - Transactions once bank-reconciled or locked into closed accounting periods cannot be edited or backdated. Every administrative mutation produces an immutable cryptographic audit record.

---

## 2. User Roles & Separation of Duties

To safeguard trustees from fraud, internal conflicts, and Charity Commission regulatory scrutiny, the system enforces strict Role-Based Access Control (RBAC):

| Role | Permitted Actions | Prohibited Actions | Key Operational Responsibilities |
| :--- | :--- | :--- | :--- |
| **ADMIN**<br>*(Financial Secretary / Treasurer)* | • Record income & expenses<br>• Manage donors & Gift Aid declarations<br>• Count Jummah cash with witnesses<br>• Upload bank CSV statements & reconcile<br>• Create HMRC Gift Aid claim batches<br>• Close and lock fiscal accounting periods | • Cannot self-approve own expenses above the dual-approval threshold (£1,000) | Day-to-day bookkeeping, banking collections, vendor disbursements, and HMRC schedule generation. |
| **REVIEWER**<br>*(Trustee Second Signatory)* | • Review high-value expenses (>£1,000)<br>• Review restricted fund expenditure<br>• Counter-approve or reject with justification<br>• View all reports, budgets, and audit trails | • Cannot create or void transactions directly<br>• Cannot modify donor profiles or funds | Independent trustee oversight, two-signature financial governance, and budget enforcement. |
| **AUDITOR**<br>*(Independent Examiner / FCCA)* | • Read-only access to all financial statements<br>• Inspect CC16 receipts & payments<br>• Verify denomination sheets & witness logs<br>• Export HMRC Gift Aid claim histories<br>• Inspect immutable system audit trails | • Cannot create, edit, approve, or delete any record | Annual independent examination, preparing trustees' annual reports, and regulatory reporting. |

---

## 3. Daily Bookkeeping Workflows

### 3.1 Recording Income & Split Allocations
1. Navigate to the **Transactions Tab** and click **+ Record Transaction** (or press <kbd>Ctrl</kbd>+<kbd>N</kbd>).
2. Select **Transaction Type**: `INCOME`.
3. Choose the **Payment Method**: `CASH`, `BANK_TRANSFER`, `CHEQUE`, or `ONLINE`.
4. Enter the **Total Amount** in GBP.
5. Search or select the **Donor** using the server-side typeahead search. If the donor is anonymous or cash bucket collection, select *Anonymous / Congregation*.
6. **Allocate Multi-Fund Splits**:
   - If a donor contributes £100 with £60 for Building and £40 for Lillah, add two split lines.
   - The system strictly validates that the sum of splits matches the total transaction amount to the exact penny before saving.

### 3.2 Managing Donors & HMRC Gift Aid Declarations
1. Under the **Donors Tab**, click **+ Add Donor**.
2. Capture the donor's title, first name, last name, phone number, and email.
3. **Gift Aid Eligibility Checklist**:
   - The donor must have confirmed they are a UK taxpayer paying Income Tax / Capital Gains Tax.
   - A valid **House Name or Number** (Address Line 1) and **UK Postcode** are legally required by HMRC.
   - Select **Gift Aid Eligible** and input the **Declaration Date**.
4. The system validates the declaration window and automatically flags matching income as claimable for a 25% tax uplift.

---

## 4. Friday Jummah Cash Counting & Dual Witnessing Protocol

Mosques handle significant cash during Friday congregation prayers. The Charity Commission requires robust internal controls for uncounted cash collections:

1. **Physical Cash Handling**:
   - Immediately following the Jummah prayer, the collection buckets must be transferred to the secure committee counting room by two appointed keyholders.
2. **Recording Denominations in the System**:
   - Open the **Transactions Tab** and click **🕌 Jummah Cash Collection**.
   - Ensure the date selected is a **Friday**. The system rejects non-Friday Jummah entries.
   - Count and input the quantity of notes:
     - Number of £50 notes
     - Number of £20 notes
     - Number of £10 notes
     - Number of £5 notes
     - Total coin value in GBP (£2, £1, 50p, 20p, etc.)
   - The system automatically calculates the total collection in integer pence.
3. **Dual Counter Signatures**:
   - Enter the full names of **Counter 1** and **Counter 2** (e.g., Financial Secretary and Imam/Trustee).
   - Enter optional notes (e.g., *Safe bag tamper seal #48192*).
4. **Banking Deposit**:
   - The collection transaction is initially recorded with status `PENDING` (cash in hand).
   - Once the cash is deposited at the bank, click **Deposit Cash** to transition the transaction to `BANKED` and record the bank branch deposit slip reference.

---

## 5. Dual-Approval Expense Governance (>£1,000 Threshold)

To prevent unauthorized expenditure:

1. **Automatic Routing**:
   - Any expense exceeding **£1,000.00** (or any expenditure charged against restricted funds such as Zakat or Building Fund) automatically enters `PENDING_APPROVAL` status.
   - It will not deduct funds from the active balance until counter-approved.
2. **Trustee Review**:
   - A trustee logged in with the **REVIEWER** role inspects the pending expense.
   - The original creator (Admin) is **strictly blocked from self-approving** their own transaction.
3. **Approval / Rejection**:
   - Clicking **Approve** transitions the status to `BANKED`, decrements the fund balance, and logs `approved_by` and `approved_at`.
   - Clicking **Reject** requires a detailed justification (minimum 5 characters) and transitions the status to `FAILED`.

---

## 6. Bank Statement CSV Reconciliation & Audit Lock

To ensure the system's ledger matches cleared bank balances:

1. Download your monthly statement in `.csv` format from your commercial bank (Lloyds, Barclays, NatWest, HSBC, etc.).
2. Navigate to the **Transactions Tab** and click **🏦 Bank Reconciliation**.
3. Enter the **Bank Statement Reference** (e.g., `LLOYDS-SEP-2026`).
4. Upload the CSV file or paste the CSV text directly.
5. **Intelligent Matcher**:
   - The engine automatically matches each bank statement row against unreconciled `BANKED` system transactions.
   - Matches are scored based on **exact integer pence** and **date proximity (±7 days)**.
   - High matches (🟢 90-100%) and Probable matches (🟡 70-89%) are pre-selected for review.
6. Click **🔒 Reconcile & Lock**.
   - All confirmed transactions are stamped with `reconciled = 1`, `reconciled_at`, and the `bank_statement_ref`.
   - **Irreversible Governance Rule**: Reconciled transactions are permanently locked against editing, voiding, or status changes.

---

## 7. HMRC Gift Aid Claims Schedule & Submission Batches

Mosques can reclaim 25p for every £1 donated by UK taxpayers.

1. Navigate to the **Reports Tab** and select **📑 HMRC Gift Aid Schedules**.
2. **Unclaimed Donations Queue**:
   - Inspect all eligible donations covered by valid Gift Aid declarations with verified UK residential addresses.
   - View gross donations and calculated 25% tax relief figures.
   - To export a preview, click **Export Current Queue (CSV)**.
3. **Creating an Immutable Claim Batch**:
   - Click **🔒 Create & Lock Claim Batch**.
   - Specify the **Period Start Date** and **Period End Date** (e.g., current quarter or fiscal year).
   - Enter optional batch notes (e.g., *Q2 FY2026 Online & Standing Orders*).
   - Click **Create & Lock Batch**.
   - The system assigns an official HMRC reference (e.g., `HMRC-GA-2026-0001`) and records all claim items into `gift_aid_claim_items`.
   - **Anti-Double Claim Guarantee**: All transactions in the batch are locked permanently, preventing duplicate claims in future quarters.
4. **Submitting to HMRC Charities Online**:
   - Under the **Submitted Batches History** tab, click **📥 Download CSV** next to the batch.
   - The exported CSV strictly follows the official HMRC Schedule format (*Title, First Name, Last Name, House name/number, Postcode, Donation Date, Amount, Gift Aid Claimed*).
   - Upload this schedule directly to the HMRC Government Gateway portal.

---

## 8. Year-End Financial Statements & Period Close

### 8.1 Generating CC16 Receipts & Payments Account
1. Under the **Reports Tab**, select **🏛️ Charity Commission CC16**.
2. The report dynamically constructs the complete Charity Commission statutory statement:
   - **Section A**: Receipts (Incoming resources broken down by unrestricted and restricted funds).
   - **Section B**: Payments (Charitable activities, operations, repairs, governance).
   - **Section C**: Net Receipts / (Payments) [A - B].
   - **Section D**: Transfers between funds (strictly netting to £0.00).
   - **Section E**: Cash and bank balances brought forward and carried forward.
   - **Section F**: Statement of Assets and Liabilities (Cash in hand + Cash at bank matching closing funds carried forward).
3. Click **Export CC16 (CSV)** for independent examiner review, or **Print CC16** for the trustees' annual report.

### 8.2 Period Close & Tamper-Proof Lock
1. Once the independent examiner completes the annual review, navigate to **Settings Tab** > **Accounting Period Lock**.
2. Select the fiscal year end date (e.g., `2025-04-05`).
3. Click **🔒 Close & Lock Accounting Period**.
4. **Security Enforcement**:
   - The system strictly blocks `createTransaction`, `voidTransaction`, and `transferFund` on or before the lock date.
   - Any historical adjustment requires a formal trustee board resolution and execution of the **Reopen Accounting Period** workflow, which records an immutable `PERIOD_REOPEN` audit entry with the trustee rationale.

---

## 9. Disaster Recovery & Safety Backups

1. **Exporting Backups**:
   - In **Settings Tab** > **Database Backups**, click **Export Encrypted Backup (JSON)**.
   - Saves a point-in-time snapshot with SHA-256 integrity checksums.
2. **Restoring from Disaster**:
   - Use the **Restore Database** modal.
   - The system automatically executes a **dry-run preflight check** before modifying any live table, validating foreign key constraints and reporting differences.
   - Once verified, the database is restored with 100% mathematical fidelity.

---

*Manual maintained by the Board of Trustees and Financial Secretary.*  
*Version: 2.0 (D1 SQLite Master Edition) — September 2026*

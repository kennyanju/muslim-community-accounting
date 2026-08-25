# 🕌 Masjid Accounting — Islamic Financial Management System

An open-source, Shariah-compliant financial accounting system and ledger built specifically for **UK Mosques, Islamic Centres, and Charities**.

Designed for self-hosting with zero external cloud dependencies, built-in ACID database simulation with PostgreSQL parity, Role-Based Access Control (RBAC), and UK Charity Commission & HMRC Gift Aid claims integration.

---

## ✨ Key Features

- **🏛️ Multi-Organisation Self-Hosting:** Any UK Mosque or Islamic Centre can self-host and customize their name, address, Charity Commission registration number, currency, and branding directly via the settings UI.
- **⚖️ Islamic Fund Segregation:** Built-in segregated wallets for **Restricted** (Zakat, Fitrana, Riba) and **Unrestricted** (Lillah, Sadaqah Jariyah, Building Fund, Madrasah Fees) funds.
- **🛡️ Shariah Compliance Triggers:**
  - Blocks operational expenses (utilities, maintenance, salaries) from drawing on Zakat or Fitrana funds.
  - Automatically routes unlawful bank interest into a dedicated **Interest/Riba** wallet for disposal without reward.
  - Requires mandatory beneficiary (*Asnaf*) audit notes on Zakat disbursements.
- **🇬🇧 HMRC Gift Aid Schedule Exporter:** Generates ready-to-submit HMRC Gift Aid Claim CSV schedules (calculating the 25% tax rebate) for donors with verified UK postcodes and declarations.
- **🕌 Jummah Cash Management:** Log Friday cash collections with dual witness counter signatures, tracking Cash on Hand and Banked status.
- **🧾 Branded Receipt & Invoice Generator:** Create, customize, and print official donation receipts linked directly to ledger transactions.
- **🔐 Cryptographic Security & RBAC:** Scrypt password hashing, tamper-proof HMAC session tokens, and strict Role-Based Access Control (Financial Secretary / Trustee / Auditor).
- **💾 1-Click Backup & Restore:** Instant JSON database snapshot exports and restore tools for complete disaster recovery.

---

## 🚀 Quickstart (Docker & Local)

### 1. Using Docker Compose (Recommended for Production)
```sh
git clone https://github.com/kennyanju/majid-accounting.git
cd majid-accounting
docker compose up -d --build
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Running with Node.js
```sh
npm install
npm run build
npm start
```
For development:
```sh
npm run dev
```

### 3. Run Automated Compliance & Security Tests
Verify all Shariah triggers, RBAC rules, and crypto modules:
```sh
node src/lib/test_compliance.js
```

---

## 🔑 Initial Default Login

- **Email:** `secretary@bsmc.org.uk`
- **Password:** `password123`

*Change this password immediately in **Settings & Admin &rarr; User Accounts** after first login.*

---

## 📖 Complete Self-Hosting Guide

For in-depth deployment instructions (Docker, PM2, Ubuntu server, cron backups, and charity compliance), see **[SELF_HOSTING.md](./SELF_HOSTING.md)**.

---

## 📜 License

MIT License. Free to use, adapt, and deploy for all Mosques and charitable organisations.

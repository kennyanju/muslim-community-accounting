# 🕌 Masjid Accounting — Islamic Financial Management & Ledger System

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](https://opensource.org/licenses/MIT)
[![Next.js 16](https://img.shields.io/badge/Next.js-16%20(App%20Router)-black.svg)](https://nextjs.org/)
[![Turbopack](https://img.shields.io/badge/Bundler-Turbopack-blueviolet.svg)](https://turbo.build/)
[![WCAG AA](https://img.shields.io/badge/Accessibility-WCAG%20AA%20Compliant-success.svg)](https://www.w3.org/WAI/WCAG2AA-Conformance)
[![Tests: 49 Passing](https://img.shields.io/badge/Tests-49%20Passing-brightgreen.svg)](./src/lib/test_compliance.js)

An open-source, Shariah-compliant financial accounting system and multi-fund ledger engineered specifically for **Mosques, Islamic Centres, and Charitable Organisations worldwide**.

Designed for zero-vendor-lockin self-hosting, lightweight Cloudflare Workers or Docker deployments, built-in ACID database simulation with PostgreSQL parity, Role-Based Access Control (RBAC), and UK Charity Commission & HMRC Gift Aid claims integration.

---

## ✨ Key Features & Capabilities

- **🏛️ Multi-Organisation Self-Hosting:** Any Mosque or Islamic Centre can self-host and customize their name, address, Charity Commission registration number, currency, and branding directly via the settings UI.
- **🎨 Modular Modern UI / Design System:** Pure Vanilla CSS design tokens with sleek glassmorphism, responsive mobile drawer, accessible ARIA modal dialogs, and native zero-flash dark/light/system mode switching.
- **⚖️ Islamic Fund Segregation:** Built-in segregated wallets for **Restricted** (Zakat, Fitrana, Riba) and **Unrestricted** (Lillah, Sadaqah Jariyah, Building Fund, Madrasah Fees) funds.
- **🛡️ Shariah Compliance Triggers:**
  - Blocks operational expenses (utilities, maintenance, salaries) from drawing on Zakat or Fitrana funds.
  - Automatically routes unlawful bank interest into a dedicated **Interest/Riba** wallet for disposal without reward.
  - Requires mandatory beneficiary (*Asnaf*) audit notes on Zakat disbursements.
- **🇬🇧 HMRC Gift Aid Schedule Exporter:** Generates ready-to-submit HMRC Gift Aid Claim CSV schedules (calculating the 25% tax rebate) for donors with verified UK postcodes and declarations.
- **🕌 Jummah Cash Management:** Log Friday cash collections with dual witness counter signatures, tracking Cash on Hand and Banked status.
- **🧾 Branded Receipt & Invoice Generator:** Create, customize, and print official donation receipts linked directly to ledger transactions with unique sequential numbering (`BSMC-2026-0001`).
- **🔐 Cryptographic Security & RBAC:** PBKDF2/scrypt password hashing, tamper-proof HMAC session tokens, sliding-window rate limiting, and strict Role-Based Access Control (Financial Secretary / Trustee / Auditor).
- **♿ WCAG AA Accessibility & Focus Trapping:** Complete keyboard navigation (Tab/Shift+Tab focus cycling in modals, Escape dismissal, visible `:focus-visible` rings, skip-to-content links, and ≥ 44×44px touch targets).
- **🌍 International Locale & Multi-Currency:** Dynamic `Intl.NumberFormat` and `Intl.DateTimeFormat` with automatic user locale/timezone detection supporting GBP (£), USD ($), EUR (€), NGN (₦), SAR (ر.س), AED (د.إ), PKR (₨), INR (₹), TRY (₺), CAD, AUD, and custom ISO currencies.
- **⚡ Offline Resilience & Optimistic Rollback:** Built-in write queueing, network failure recovery, pause-on-hover toast manager, and instant optimistic updates with surgical rollback.
- **📋 Interactive OpenAPI 3.0 Documentation:** Machine-readable API specifications accessible at `/api/docs`.
- **🔍 SEO & Discovery:** Dynamic `/robots.txt`, XML `/sitemap.xml`, and canonical URL metadata for public pages while shielding private financial ledger routes.
- **💾 1-Click Backup & Restore:** Instant JSON database snapshot exports and restore tools for complete disaster recovery.

---

## 🏗️ Architecture & Component Hierarchy

```
src/
├── app/
│   ├── api/                      # Standardized REST API routes
│   │   ├── audits/               # Immutable audit log entries
│   │   ├── auth/                 # Login, Logout, Session Me
│   │   ├── backup/               # Database export, restore, clean reset
│   │   ├── docs/                 # OpenAPI 3.0 specification
│   │   ├── donors/               # Donor directory and Gift Aid declarations
│   │   ├── funds/                # Segregated funds and live balances
│   │   ├── organisation/         # Mosque profile configuration
│   │   ├── reports/              # HMRC Gift Aid CSV schedules
│   │   ├── transactions/         # Ledger entries, Void, Bank, Reconcile
│   │   └── users/                # Committee user accounts
│   ├── globals.css               # Core styling & responsive layouts
│   ├── layout.js                 # App root layout with zero-flash theme script
│   ├── global-error.js           # Root layout crash boundary
│   ├── error.js                  # App exception boundary
│   ├── not-found.js              # Custom 404 page with navigation links
│   ├── robots.js                 # Dynamic robots.txt crawler rules
│   ├── sitemap.js                # Dynamic XML sitemap generator
│   ├── login/                    # Accessible login portal with layout metadata
│   └── page.js                   # Assembled tab viewport
├── components/
│   ├── common/                   # Toast alerts, Pagination controls
│   ├── layout/                   # Sidebar navigation, Header
│   ├── modals/                   # TransactionModal, JummahModal, DonorModal,
│   │                             # VoidModal, FundModal, UserModal
│   └── tabs/                     # DashboardTab, TransactionsTab, DonorsTab,
│                                 # ReportsTab, ReceiptsTab, SettingsTab
├── context/                      # AppContext global state provider
├── hooks/                        # useModalFocusTrap (focus cycling & Escape)
├── lib/                          # Backend utilities (auth, db, validation,
│                                 # sanitization, rateLimit, logger, config)
├── locales/                      # Translation dictionaries (en.js)
├── utils/                        # formatters.js (Intl currencies & dates)
└── styles/theme.css              # Centralized CSS design token system
```

---

## 🚀 Download, Installation & Getting Started

### Prerequisites
- **Node.js:** v18.17.0+ or v20.x LTS (Check with `node -v`)
- **npm:** v9.x or higher (Check with `npm -v`)
- *(Optional)* **Docker & Docker Compose** for containerized deployments.

---

### Step 1: Clone the Repository

Choose either of the official GitHub repository remotes:

```bash
git clone https://github.com/kennyanju/muslim-community-accounting.git
cd muslim-community-accounting
```

*Or via the mirror repository:*
```bash
git clone https://github.com/kennyanju/majid-accounting.git
cd majid-accounting
```

---

### Step 2: Configure Environment Variables

Create your local environment file from the provided template:

```bash
cp .env.example .env.local
```

Edit `.env.local` to configure your cryptographic secrets:

```env
# Cryptographic secret for signing HMAC session cookies (Min 32 characters)
SESSION_SECRET=replace_with_a_secure_random_32_character_string_here

# Application Environment
NODE_ENV=development

# Optional Public URL for SEO sitemap & canonical links
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

### Step 3: Install Dependencies

```bash
npm install
```

---

### Step 4: Run Automated Verification Tests

Verify all 49+ Shariah triggers, security algorithms, rate limits, and compliance checks:

```bash
node src/lib/test_compliance.js
```

---

### Step 5: Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your web browser.

---

## 🚢 Production Deployment

### Option A: Production Node.js Server / PM2
```bash
# 1. Build optimized production bundle
npm run build

# 2. Start the production server
npm start
```

For persistent process management on Linux servers using PM2:
```bash
npm install -g pm2
pm2 start npm --name "masjid-accounting" -- start
pm2 save
pm2 startup
```

---

### Option B: Docker Compose
```bash
docker compose up -d --build
```

---

### Option C: Cloudflare Workers (OpenNext)
The project includes automated deployment workflows in `.github/workflows/deploy.yml` using OpenNext for ultra-fast global edge delivery with zero cold starts.

---

## 🔑 Initial Default Login Credentials

Upon fresh installation, sign in using the default administrative account:

- **Email:** `secretary@bsmc.org.uk`
- **Password:** `password123`

> ⚠️ **IMPORTANT SECURITY NOTICE:** Immediately after logging in, navigate to **Settings & Admin &rarr; User Accounts** to change the Financial Secretary password and register committee trustees.

---

## 📖 Available NPM Scripts

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Starts Next.js development server with Turbopack |
| `npm run build` | Builds optimized production bundle |
| `npm start` | Runs the production Next.js server |
| `npm run lint` | Runs ESLint static analysis |
| `npm test` | Runs the full 49-point automated compliance test suite |
| `npm run reset-db` | Safely resets database to clean seed state (preserves admin accounts) |
| `npm run check-budget` | Validates JavaScript, CSS, and asset performance budgets |

---

## 💾 Backups & Disaster Recovery

- **Manual Snapshot:** In the app, navigate to **Settings & Admin &rarr; Backup & Recovery** and click **Download Database Backup** to download an encrypted/validated JSON ledger snapshot.
- **Automated Cron Backup:** On your host server, add a nightly cron task:
  ```bash
  0 2 * * * cp /path/to/masjid-accounting/src/data/db.json /backups/masjid_db_$(date +\%F).json
  ```
- **Instant Restore:** Upload any previous snapshot JSON file directly in the **Backup & Recovery** interface.

---

## 📖 Complete Self-Hosting Documentation

For detailed guides on charity compliance, multi-user role management, and reverse proxy setup (Nginx / Caddy with HTTPS), consult **[SELF_HOSTING.md](./SELF_HOSTING.md)**.

---

## 📜 License

Distributed under the **MIT License**. Free to use, modify, distribute, and self-host for all Mosques, Islamic Centres, and Charitable Organisations worldwide.

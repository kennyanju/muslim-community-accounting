# 🕌 Self-Hosting Guide for UK Mosques & Islamic Centres

This guide explains how to install, configure, deploy, and maintain **Masjid Accounting** for your own Mosque, Islamic Centre, or UK registered charity.

---

## 📋 System Requirements

- **Operating System:** Linux (Ubuntu 20.04+, Debian 11+), macOS, or Windows (WSL2)
- **Node.js:** v18.17.0+ or v20.x LTS
- **Memory:** 512MB RAM minimum (1GB recommended)
- **Disk Space:** 500MB free disk space

---

## 🚀 Quickstart Installation (3 Methods)

### Method A: Docker Compose (Recommended)

1. Clone the repository:
   ```bash
   git clone https://github.com/kennyanju/majid-accounting.git
   cd majid-accounting
   ```

2. Edit `docker-compose.yml` to set a custom secure `SESSION_SECRET`:
   ```yaml
   environment:
     - SESSION_SECRET=your-secure-random-secret-key-32-chars-long
   ```

3. Launch the container:
   ```bash
   docker compose up -d --build
   ```

4. Access the system at `http://localhost:3000` (or `http://your-server-ip:3000`).

---

### Method B: Native Node.js & PM2 (Production)

1. Clone and install dependencies:
   ```bash
   git clone https://github.com/kennyanju/majid-accounting.git
   cd majid-accounting
   npm install
   ```

2. Build the production application:
   ```bash
   npm run build
   ```

3. Start using PM2 process manager (ensures auto-restart on server reboot):
   ```bash
   npm install -g pm2
   pm2 start npm --name "masjid-accounting" -- start
   pm2 save
   pm2 startup
   ```

---

### Method C: Local Development / Testing

```bash
git clone https://github.com/kennyanju/majid-accounting.git
cd majid-accounting
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 🔑 Initial Login Credentials

When launching the software for the first time, log in using the default administrative account:

- **Email:** `secretary@bsmc.org.uk`
- **Initial Password:** `password123`

> ⚠️ **IMPORTANT FIRST STEP:** Once logged in, navigate to **Settings & Admin &rarr; User Accounts** and change the admin password, or create your committee members' own accounts.

---

## ⚙️ Initial Mosque Setup Checklist

1. **Customise Organisation Profile:**
   - Go to **Settings & Admin &rarr; Mosque Profile**.
   - Enter your **Mosque Full Name**, **Acronym/Short Name**, **Tagline**, **UK Charity Commission Number**, **Address**, **Finance Contact Email**, and **Phone Number**.
   - Click **Save Organisation Profile**. All receipts, reports, invoices, and login screens will immediately update.

2. **Configure Fund Wallets:**
   - Go to **Settings & Admin &rarr; Fund Management**.
   - Review default Islamic fund buckets (**Lillah**, **Zakat**, **Fitrana**, **Sadaqah Jariyah**, **Building Fund**, **Madrasah Fees**, **Interest/Riba**).
   - Add any custom funds your mosque operates (e.g. *Ramadan Iftar Fund*, *Solar Panel Appeal*).

3. **Invite Trustees & Committee Members:**
   - Go to **Settings & Admin &rarr; User Accounts**.
   - Create accounts for:
     - **Financial Secretary (ADMIN):** Full write permissions (add/void transactions, log cash, reconcile).
     - **Trustee (REVIEWER):** Read-only visibility to fund balances, statements, and receipts.
     - **Auditor (AUDITOR):** Read-only visibility for external accountants and independent examiners.

4. **Register Donors with UK Gift Aid:**
   - Go to **Donors & Gift Aid &rarr; New Donor**.
   - Enter their Name, UK Address, and Postcode.
   - Check the **Signed HMRC Gift Aid Declaration** box if you hold a signed declaration.

---

## 🛡️ Shariah Compliance Features & Rules

1. **Rule 1 (Fund Segregation):** Operational overheads (e.g., electricity bills, repairs, maintenance, salaries) are rejected if allocated to **Zakat** or **Fitrana** restricted funds.
2. **Rule 2 (Audit Trails & Soft-Voiding):** Hard deletions are disabled. Inadvertent entries are soft-voided with mandatory documented reasons preserving the ledger trail.
3. **Rule 3 (HMRC Gift Aid Eligibility):** Gift Aid (25% tax rebate) can only be claimed on donations linked to donors with valid UK postcodes and active declarations.
4. **Rule 4 (Riba / Bank Interest Routing):** Any interest transactions are segregated into the **Interest/Riba** wallet for disposal without reward.

---

## 💾 Backups & Disaster Recovery

- **Manual Backup:** Go to **Settings & Admin &rarr; Backup & Recovery** and click **Download Database Backup** to save a timestamped JSON file.
- **Automated Backup (Cron):**
  Create a nightly cron job on your Linux server:
  ```bash
  0 2 * * * cp /path/to/majid-accounting/src/data/db.json /backups/masjid_db_$(date +\%F).json
  ```
- **Restoring from Backup:** Use the **Upload & Restore Backup JSON** button under the Backup tab.

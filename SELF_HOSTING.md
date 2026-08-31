# 🕌 Self-Hosting & Operations Guide for Mosques & Islamic Charities

This operational guide provides comprehensive instructions for deploying, configuring, securing, and maintaining **Masjid Accounting** for your Mosque, Islamic Centre, or registered charity.

---

## 📋 System Requirements

- **Operating System:** Linux (Ubuntu 20.04+, Debian 11+, RHEL/Rocky), macOS, or Windows (WSL2)
- **Node.js:** v18.17.0+ or v20.x LTS
- **Memory:** 512MB RAM minimum (1GB recommended)
- **Disk Space:** 500MB free disk space for application files and database snapshots

---

## 🚀 Installation & Deployment Methods

### Method 1: Docker Compose (Recommended for Containerized Infrastructure)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/kennyanju/muslim-community-accounting.git
   cd muslim-community-accounting
   ```

2. **Configure environment secrets:**
   ```bash
   cp .env.example .env.local
   ```
   Set a random 32-character `SESSION_SECRET` in `.env.local` or `docker-compose.yml`:
   ```yaml
   environment:
     - SESSION_SECRET=your-secure-random-secret-key-32-chars-long
     - NODE_ENV=production
   ```

3. **Launch container service:**
   ```bash
   docker compose up -d --build
   ```

4. **Verify container health:**
   ```bash
   docker compose ps
   ```
   Open `http://localhost:3000` (or `http://your-server-ip:3000`) in your browser.

---

### Method 2: Native Node.js & PM2 (Ubuntu / Debian Server)

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/kennyanju/muslim-community-accounting.git
   cd muslim-community-accounting
   npm install
   ```

2. **Configure `.env.local`:**
   ```bash
   cp .env.example .env.local
   # Generate and paste a random 32+ character SESSION_SECRET
   ```

3. **Build the production application:**
   ```bash
   npm run build
   ```

4. **Run compliance test suite:**
   ```bash
   npm test
   ```

5. **Start service with PM2 (Auto-restarts on reboot / crash):**
   ```bash
   npm install -g pm2
   pm2 start npm --name "masjid-accounting" -- start
   pm2 save
   pm2 startup
   ```

---

### Method 3: Cloudflare Workers (OpenNext Edge Serverless)

The repository includes a ready-to-deploy OpenNext configuration for Cloudflare Workers. To deploy to your Cloudflare account:

```bash
npx @opennextjs/cloudflare build
npx wrangler deploy
```

---

## 🔒 Nginx Reverse Proxy with Free SSL (Let's Encrypt)

To serve the application securely over `https://accounts.yourmosque.org.uk`:

1. **Install Nginx & Certbot:**
   ```bash
   sudo apt update
   sudo apt install -y nginx certbot python3-certbot-nginx
   ```

2. **Create Nginx site configuration:**
   ```nginx
   # /etc/nginx/sites-available/masjid-accounting
   server {
       server_name accounts.yourmosque.org.uk;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

3. **Enable configuration and obtain SSL certificate:**
   ```bash
   sudo ln -s /etc/nginx/sites-available/masjid-accounting /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   sudo certbot --nginx -d accounts.yourmosque.org.uk
   ```

---

## 🔑 Initial Default Login Credentials

- **Email:** `secretary@bsmc.org.uk`
- **Initial Password:** `password123`

> ⚠️ **CRITICAL FIRST STEP:** Immediately navigate to **Settings & Admin &rarr; User Accounts** after first login to update the administrator password and create individual trustee accounts.

---

## ⚙️ Mosque Setup Checklist

1. **Customise Organisation Profile:**
   - Go to **Settings & Admin &rarr; Mosque Profile**.
   - Enter your **Mosque Full Name**, **Acronym/Short Name**, **Tagline**, **UK Charity Commission Number**, **Address**, **Finance Contact Email**, and **Phone Number**.
   - Select your currency symbol (e.g. `£`, `$`, `€`, `₦`, `SAR`, etc.).
   - Click **Save Organisation Profile**. All receipts, reports, invoices, and login screens update dynamically.

2. **Configure Fund Wallets:**
   - Go to **Settings & Admin &rarr; Fund Management**.
   - Review default Islamic fund buckets (**Lillah**, **Zakat**, **Fitrana**, **Sadaqah Jariyah**, **Building Fund**, **Madrasah Fees**, **Interest/Riba**).
   - Add any custom funds your mosque operates (e.g. *Ramadan Iftar Fund*, *Solar Panel Appeal*).

3. **Invite Committee Members & Auditors:**
   - Go to **Settings & Admin &rarr; User Accounts**.
   - Create accounts matching exact roles:
     - **Financial Secretary (ADMIN):** Full write permissions (add/void transactions, log cash, reconcile, manage funds and users).
     - **Trustee / Committee (REVIEWER):** Read-only visibility to fund balances, statements, receipts, and reports.
     - **Independent Examiner / Auditor (AUDITOR):** Read-only visibility for external accountants and immutable audit trails.

4. **Register Donors & UK HMRC Gift Aid:**
   - Go to **Donors & Gift Aid &rarr; New Donor**.
   - Enter their Name, UK Address, and Postcode.
   - Check the **Signed HMRC Gift Aid Declaration** box if a valid declaration is on file.

---

## 🛡️ Shariah Compliance Rules Enforced

1. **Rule 1 (Restricted Fund Protection):** Operational overheads (e.g. electricity bills, repairs, maintenance, salaries) are rejected if allocated to **Zakat** or **Fitrana** restricted funds.
2. **Rule 2 (Audit Trails & Soft-Voiding):** Hard deletions are disabled. Inadvertent entries are soft-voided with mandatory documented reasons, preserving the ledger trail.
3. **Rule 3 (HMRC Gift Aid Eligibility):** Gift Aid (25% tax rebate) can only be claimed on donations linked to donors with valid UK postcodes and active declarations.
4. **Rule 4 (Riba / Bank Interest Routing):** Any interest transactions are segregated into the **Interest/Riba** wallet for disposal without reward.

---

## 💾 Backups & Disaster Recovery

- **Manual Backup:** Go to **Settings & Admin &rarr; Backup & Recovery** and click **Download Database Backup** to save a timestamped JSON file.
- **Automated Linux Cron Backup:**
  ```bash
  0 2 * * * cp /path/to/muslim-community-accounting/src/data/db.json /backups/masjid_db_$(date +\%F).json
  ```
- **Instant Restore:** Upload any previous snapshot JSON file directly in the **Backup & Recovery** interface.

---

## 📜 License

MIT License. Free to use, adapt, and deploy for all Mosques and charitable organisations worldwide.

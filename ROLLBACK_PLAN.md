# Masjid Accounting — Rollback Plan & Disaster Recovery Runbook

This document defines the emergency rollback procedures, migration down-paths, and point-in-time recovery verification steps for the Masjid Accounting system.

---

## 1. Application Deployment Rollback

### A. Cloudflare Workers (Instant Edge Rollback)
Cloudflare Workers maintains immutable versioned deployments. To revert to the previous working deployment in under 5 seconds:

```bash
# 1. List recent deployments to identify the stable target ID
npx wrangler deployments list

# 2. Rollback to the previous deployment version
npx wrangler rollback [DEPLOYMENT_ID] --message "Emergency rollback due to incident"
```

### B. Docker Self-Hosted Rollback
If deploying via Docker Compose:

```bash
# 1. Revert git commit to previous stable release tag
git checkout v1.0.0-stable

# 2. Rebuild and restart containers
docker compose down
docker compose up -d --build

# 3. Verify health status
curl -i http://localhost:3000/api/organisation
```

---

## 2. Database Migration Down-Path (PostgreSQL / Supabase)

If a schema migration fails or needs to be safely undone without data corruption:

```bash
# Execute reverse down-migration script
psql "$DATABASE_URL" -f scripts/schema_down.sql
```

The [`scripts/schema_down.sql`](file:///Users/sadiqadeyanju/Library/CloudStorage/GoogleDrive-kennyanju@gmail.com/My%20Drive/Masjid%20Software/scripts/schema_down.sql) script safely removes:
1. All Row-Level Security policies (`users`, `funds`, `donors`, `transactions`, `splits`, `audit_logs`).
2. All B-tree performance indexes.
3. Tables in reverse foreign-key order (`CASCADE`).
4. Custom enum types and helper functions.

---

## 3. Backups & Point-in-Time Recovery (PITR)

### Restore Verification Test
Always verify that backup restores succeed with 100% mathematical precision before and after deployment:

```bash
npm run verify-restore
```

This automated script:
1. Generates a complex test ledger with multi-fund splits and Gift Aid records.
2. Exports a point-in-time JSON snapshot.
3. Simulates a destructive event.
4. Restores the snapshot and performs a bitwise checksum verification on all fund balances and transaction records.

### Manual Disaster Recovery
To restore a production backup snapshot through the API:

```bash
curl -X POST https://your-masjid-domain.org.uk/api/backup \
  -H "Cookie: masjid_session=[ADMIN_SESSION_TOKEN]" \
  -H "Content-Type: application/json" \
  -d @financial_backup_snapshot.json
```

---

## 4. Structured Logging & Correlation ID Triage

Every incoming HTTP request is tagged with a unique `X-Correlation-ID` header (e.g. `cid_m3k29_8ab12`).

### Searching Logs in Datadog / Cloudflare Logpush / CloudWatch
Filter by `correlationId` to trace the complete lifecycle of a failed transaction:

```json
{
  "service": "masjid-accounting",
  "correlationId": "cid_m3k29_8ab12",
  "level": "ERROR"
}
```

---

## 5. Emergency Incident Checklist

1. [ ] **Triage & Containment**: Check error rate and identify failing `correlationId` entries in server logs.
2. [ ] **Rollback**: Trigger `wrangler rollback` or Docker image reversion.
3. [ ] **Data Verification**: Execute `npm run verify-restore` to confirm data integrity.
4. [ ] **Notification**: Notify the Masjid Financial Committee and active administrators.
5. [ ] **Post-Mortem**: Document root cause, timeline, and mitigation steps.

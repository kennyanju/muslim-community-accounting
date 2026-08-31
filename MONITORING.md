# Masjid Accounting — Monitoring & Alerting Guide

This document defines the health check endpoints, Prometheus/JSON telemetry metrics, error tracking integrations, and alerting rules for the Masjid Accounting platform.

---

## 1. Health Check Probes

### Liveness Probe (`GET /healthz`)
- **Purpose**: Verifies that the application process / Cloudflare Worker is alive and responding.
- **Success Status**: `200 OK`
- **Response**:
  ```json
  {
    "status": "ok",
    "service": "masjid-accounting",
    "uptime": 14280,
    "timestamp": "2026-08-31T10:12:00.000Z",
    "version": "1.0.0"
  }
  ```

### Readiness Probe (`GET /readyz`)
- **Purpose**: Performs a deep dependency verification on database readability, multi-fund ledger presence, and organisation configuration.
- **Success Status**: `200 OK` (or `503 Service Unavailable` if database/funds are unavailable)
- **Response**:
  ```json
  {
    "status": "ready",
    "checks": {
      "database": "ok",
      "funds": "ok",
      "organisation": "ok"
    },
    "timestamp": "2026-08-31T10:12:00.000Z"
  }
  ```

---

## 2. Telemetry & Metrics Endpoint (`GET /api/metrics`)

### Prometheus Exporter (`GET /api/metrics?format=prometheus` or `Accept: text/plain`)
Scrapable by Prometheus, Datadog Agent, or Grafana Alloy:

```text
# HELP masjid_http_requests_total Total number of HTTP requests processed
# TYPE masjid_http_requests_total counter
masjid_http_requests_total 4820

# HELP masjid_http_requests_by_status_total HTTP requests partitioned by status code class
# TYPE masjid_http_requests_by_status_total counter
masjid_http_requests_by_status_total{code="2xx"} 4710
masjid_http_requests_by_status_total{code="4xx"} 98
masjid_http_requests_by_status_total{code="5xx"} 12

# HELP masjid_security_events_total Total security enforcement events
# TYPE masjid_security_events_total counter
masjid_security_events_total{type="failed_login"} 2
masjid_security_events_total{type="rate_limit"} 5
masjid_security_events_total{type="csrf_block"} 0
```

### JSON Metrics Snapshot (`GET /api/metrics`)
Requires `ADMIN` or `AUDITOR` session cookie or `Authorization: Bearer <METRICS_SCRAPER_TOKEN>`.

---

## 3. Recommended Alerting Rules

| Alert Rule | Condition | Severity | Action |
|---|---|---|---|
| **AppUnhealthy** | `/readyz` returns `503` for > 1 minute | `CRITICAL` | Page On-Call Administrator; check database connection |
| **High5xxErrorRate** | 5xx error rate > 5.0% over 5-minute window | `CRITICAL` | Inspect server error logs via Correlation ID; review recent deployment |
| **ElevatedFailedLogins** | > 10 failed login attempts in 5 minutes | `WARNING` | Potential brute-force attack; verify IP rate limiting is active |
| **HighRateLimiting** | > 25 rate limit blocks in 5 minutes | `WARNING` | Check for traffic spike or rogue client scraping |

---

## 4. Client Error Monitoring (Sentry / Highlight)

To connect Sentry or Highlight:
1. Set `NEXT_PUBLIC_SENTRY_DSN` in your environment variables.
2. The client error handler in [`src/lib/errorReporting.js`](file:///Users/sadiqadeyanju/Library/CloudStorage/GoogleDrive-kennyanju@gmail.com/My%20Drive/Masjid%20Software/src/lib/errorReporting.js) will automatically capture unhandled exceptions, attaching user role, active mosque currency, breadcrumb trails, and dispatching to Sentry.

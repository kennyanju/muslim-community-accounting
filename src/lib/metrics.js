import { readDB } from './db.js';

/**
 * In-Memory Metrics Aggregator & Alert Threshold Engine
 * Supports Prometheus format export and active alert detection
 */

const metricsStore = {
  requests: {
    total: 0,
    byStatus: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
    byMethod: { GET: 0, POST: 0, PUT: 0, DELETE: 0, OPTIONS: 0 }
  },
  security: {
    failedLogins: 0,
    rateLimitHits: 0,
    csrfBlocks: 0,
    unauthorizedHits: 0
  },
  latencies: [] // Sliding window of recent 500 request durations
};

const MAX_LATENCIES = 500;

export function recordRequest(method, status, durationMs = 0) {
  metricsStore.requests.total++;

  const normMethod = (method || 'GET').toUpperCase();
  if (metricsStore.requests.byMethod[normMethod] !== undefined) {
    metricsStore.requests.byMethod[normMethod]++;
  }

  const category = `${Math.floor((status || 200) / 100)}xx`;
  if (metricsStore.requests.byStatus[category] !== undefined) {
    metricsStore.requests.byStatus[category]++;
  }

  if (typeof durationMs === 'number' && durationMs >= 0) {
    metricsStore.latencies.push(durationMs);
    if (metricsStore.latencies.length > MAX_LATENCIES) {
      metricsStore.latencies.shift();
    }
  }
}

export function recordSecurityEvent(type) {
  if (type === 'failed_login') metricsStore.security.failedLogins++;
  if (type === 'rate_limit') metricsStore.security.rateLimitHits++;
  if (type === 'csrf_block') metricsStore.security.csrfBlocks++;
  if (type === 'unauthorized') metricsStore.security.unauthorizedHits++;
}

export function getMetricsSnapshot() {
  let dbStats = { fundsCount: 0, transactionsCount: 0, donorsCount: 0 };
  try {
    const db = readDB();
    dbStats = {
      fundsCount: (db.funds || []).length,
      transactionsCount: (db.transactions || []).length,
      donorsCount: (db.donors || []).length
    };
  } catch (e) {
    // In-memory fallback
  }

  const sortedLatencies = [...metricsStore.latencies].sort((a, b) => a - b);
  const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] || 0;
  const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
  const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;

  const totalReqs = metricsStore.requests.total || 1;
  const errorRate5xx = ((metricsStore.requests.byStatus['5xx'] / totalReqs) * 100).toFixed(2);

  return {
    timestamp: new Date().toISOString(),
    uptimeSeconds: process.uptime ? Math.floor(process.uptime()) : 0,
    requests: {
      total: metricsStore.requests.total,
      byStatus: metricsStore.requests.byStatus,
      byMethod: metricsStore.requests.byMethod,
      errorRate5xxPercent: parseFloat(errorRate5xx)
    },
    latencyMs: {
      p50,
      p95,
      p99,
      samples: sortedLatencies.length
    },
    security: metricsStore.security,
    database: dbStats,
    alerts: checkAlertConditions(errorRate5xx)
  };
}

export function checkAlertConditions(errorRate5xx = 0, totalRequests = metricsStore.requests.total) {
  const activeAlerts = [];

  if (parseFloat(errorRate5xx) > 5.0 && totalRequests >= 1) {
    activeAlerts.push({
      severity: 'CRITICAL',
      name: 'High5xxErrorRate',
      message: `5xx server error rate is currently ${errorRate5xx}% (exceeds 5% threshold)`
    });
  }

  if (metricsStore.security.failedLogins >= 10) {
    activeAlerts.push({
      severity: 'WARNING',
      name: 'ElevatedFailedLogins',
      message: `Elevated failed login attempts recorded (${metricsStore.security.failedLogins} total)`
    });
  }

  if (metricsStore.security.rateLimitHits >= 25) {
    activeAlerts.push({
      severity: 'WARNING',
      name: 'HighRateLimitingTriggered',
      message: `High volume of requests exceeding rate limit quota (${metricsStore.security.rateLimitHits} hits)`
    });
  }

  return activeAlerts;
}

export function getPrometheusFormat() {
  const snapshot = getMetricsSnapshot();

  return `
# HELP masjid_http_requests_total Total number of HTTP requests processed
# TYPE masjid_http_requests_total counter
masjid_http_requests_total ${snapshot.requests.total}

# HELP masjid_http_requests_by_status_total HTTP requests partitioned by status code class
# TYPE masjid_http_requests_by_status_total counter
masjid_http_requests_by_status_total{code="2xx"} ${snapshot.requests.byStatus['2xx']}
masjid_http_requests_by_status_total{code="3xx"} ${snapshot.requests.byStatus['3xx']}
masjid_http_requests_by_status_total{code="4xx"} ${snapshot.requests.byStatus['4xx']}
masjid_http_requests_by_status_total{code="5xx"} ${snapshot.requests.byStatus['5xx']}

# HELP masjid_security_events_total Total security enforcement events
# TYPE masjid_security_events_total counter
masjid_security_events_total{type="failed_login"} ${snapshot.security.failedLogins}
masjid_security_events_total{type="rate_limit"} ${snapshot.security.rateLimitHits}
masjid_security_events_total{type="csrf_block"} ${snapshot.security.csrfBlocks}

# HELP masjid_database_records_total Total live database records
# TYPE masjid_database_records_total gauge
masjid_database_records_total{table="funds"} ${snapshot.database.fundsCount}
masjid_database_records_total{table="transactions"} ${snapshot.database.transactionsCount}
masjid_database_records_total{table="donors"} ${snapshot.database.donorsCount}

# HELP masjid_http_latency_ms HTTP request latency percentiles
# TYPE masjid_http_latency_ms gauge
masjid_http_latency_ms{quantile="0.5"} ${snapshot.latencyMs.p50}
masjid_http_latency_ms{quantile="0.95"} ${snapshot.latencyMs.p95}
masjid_http_latency_ms{quantile="0.99"} ${snapshot.latencyMs.p99}
`.trim();
}

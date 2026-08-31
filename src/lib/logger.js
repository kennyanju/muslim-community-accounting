/**
 * Standardized JSON Structured Application Logger with Correlation ID Tracing
 */

let globalCorrelationId = null;

export function setGlobalCorrelationId(id) {
  globalCorrelationId = id;
}

export function formatLog(level, message, context = {}, correlationId = null) {
  const cid = correlationId || context.correlationId || globalCorrelationId || 'system';
  
  // Clean context to avoid duplicate correlationId
  const { correlationId: _cid, ...cleanContext } = context;

  const entry = {
    timestamp: new Date().toISOString(),
    service: 'masjid-accounting',
    environment: process.env.NODE_ENV || 'development',
    level: level.toUpperCase(),
    correlationId: cid,
    message,
    ...(Object.keys(cleanContext).length > 0 ? { context: cleanContext } : {})
  };

  return JSON.stringify(entry);
}

export const logger = {
  info(message, context = {}, correlationId = null) {
    console.log(formatLog('INFO', message, context, correlationId));
  },
  warn(message, context = {}, correlationId = null) {
    console.warn(formatLog('WARN', message, context, correlationId));
  },
  error(message, context = {}, correlationId = null) {
    console.error(formatLog('ERROR', message, context, correlationId));
  },
  audit(action, context = {}, correlationId = null) {
    console.log(formatLog('AUDIT', `AUDIT ACTION: ${action}`, context, correlationId));
  },
  withCorrelationId(correlationId) {
    return {
      info: (msg, ctx = {}) => logger.info(msg, ctx, correlationId),
      warn: (msg, ctx = {}) => logger.warn(msg, ctx, correlationId),
      error: (msg, ctx = {}) => logger.error(msg, ctx, correlationId),
      audit: (action, ctx = {}) => logger.audit(action, ctx, correlationId),
    };
  }
};

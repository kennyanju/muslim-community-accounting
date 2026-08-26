/**
 * Structured Application Logger
 */

function formatLog(level, message, context = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context
  };
  return JSON.stringify(entry);
}

export const logger = {
  info(message, context) {
    console.log(formatLog('INFO', message, context));
  },
  warn(message, context) {
    console.warn(formatLog('WARN', message, context));
  },
  error(message, context) {
    console.error(formatLog('ERROR', message, context));
  },
  audit(action, context) {
    console.log(formatLog('AUDIT', `AUDIT ACTION: ${action}`, context));
  }
};

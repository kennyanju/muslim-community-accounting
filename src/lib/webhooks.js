import crypto from 'crypto';

/**
 * Webhook Cryptographic HMAC Signature Verification
 * Validates Stripe, GitHub, Clerk, and generic webhooks with timestamp tolerance checks
 */

/**
 * Verify Stripe webhook signature (stripe-signature header format: t=timestamp,v1=signature)
 * @param {string|Buffer} rawPayload - Raw text body from request
 * @param {string} signatureHeader - Value of 'stripe-signature'
 * @param {string} webhookSecret - Stripe signing secret (whsec_...)
 * @param {number} [toleranceSeconds=300] - Timestamp tolerance in seconds (default 5 mins)
 * @returns {{ isValid: boolean, timestamp: number, error: string|null }}
 */
export function verifyStripeSignature(rawPayload, signatureHeader, webhookSecret, toleranceSeconds = 300) {
  if (!signatureHeader || !webhookSecret) {
    return { isValid: false, timestamp: 0, error: 'Missing webhook signature header or secret.' };
  }

  const items = signatureHeader.split(',').map(item => item.trim());
  let timestamp = 0;
  const signatures = [];

  for (const item of items) {
    const [key, val] = item.split('=');
    if (key === 't') {
      timestamp = parseInt(val, 10);
    } else if (key === 'v1') {
      signatures.push(val);
    }
  }

  if (!timestamp || isNaN(timestamp) || signatures.length === 0) {
    return { isValid: false, timestamp: 0, error: 'Malformed stripe-signature header structure.' };
  }

  // Prevent replay attacks with timestamp tolerance check
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return { isValid: false, timestamp, error: 'Webhook timestamp outside permitted tolerance window (potential replay attack).' };
  }

  const signedPayload = `${timestamp}.${rawPayload}`;
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(signedPayload, 'utf8')
    .digest('hex');

  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  // Verify against all v1 signatures in header using constant-time comparison
  let matched = false;
  for (const sig of signatures) {
    const sigBuffer = Buffer.from(sig, 'utf8');
    if (sigBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      matched = true;
      break;
    }
  }

  if (!matched) {
    return { isValid: false, timestamp, error: 'Invalid HMAC signature. Payload was tampered with or signed by unknown key.' };
  }

  return { isValid: true, timestamp, error: null };
}

/**
 * Verify GitHub / Generic Provider HMAC-SHA256 signature (x-hub-signature-256 header)
 * @param {string|Buffer} rawPayload
 * @param {string} signatureHeader - e.g. "sha256=abcdef..."
 * @param {string} secretKey
 * @returns {boolean}
 */
export function verifyHubSignature(rawPayload, signatureHeader, secretKey) {
  if (!signatureHeader || !secretKey) return false;

  const parts = signatureHeader.split('=');
  const signature = parts.length === 2 ? parts[1] : parts[0];

  const expected = crypto
    .createHmac('sha256', secretKey)
    .update(rawPayload, 'utf8')
    .digest('hex');

  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');

  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

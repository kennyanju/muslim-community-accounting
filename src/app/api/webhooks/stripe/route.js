import { apiSuccess, apiError } from '@/lib/response';
import { verifyStripeSignature } from '@/lib/webhooks';
import { D1Controller } from '@/lib/d1-controller';
import { logger } from '@/lib/logger';

export async function POST(request) {
  const signature = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_masjid_secret_2026';

  if (!signature) {
    logger.warn('Stripe webhook rejected: Missing stripe-signature header');
    return apiError('Missing signature header', 400, { code: 'MISSING_SIGNATURE' });
  }

  let rawBody = '';
  try {
    rawBody = await request.text();
  } catch (err) {
    return apiError('Failed to read request body', 400, { code: 'INVALID_BODY' });
  }

  const { isValid, error } = verifyStripeSignature(rawBody, signature, webhookSecret);
  if (!isValid) {
    logger.warn('Stripe webhook signature validation failed', { error });
    return apiError(`Signature verification failed: ${error}`, 400, { code: 'INVALID_SIGNATURE' });
  }

  try {
    const event = JSON.parse(rawBody);
    logger.info('Stripe webhook event verified and received', { type: event.type, id: event.id });

    const controller = new D1Controller('ADMIN', 'system-stripe-webhook');
    const db = await controller.getDb();

    // Idempotency: Prevent duplicate donation entries on webhook retries
    const existingEvent = await db.prepare(`SELECT id FROM processed_webhook_events WHERE id = ?`).bind(event.id).first();
    if (existingEvent) {
      logger.info('Duplicate Stripe webhook event ignored', { id: event.id });
      return apiSuccess({ received: true, deduplicated: true }, { message: 'Event already processed' });
    }

    // Handle payment_intent.succeeded or checkout.session.completed
    if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
      const paymentData = event.data?.object || {};
      const amount = (paymentData.amount_received || paymentData.amount_total || 0) / 100;
      const metadata = paymentData.metadata || {};

      if (amount > 0) {
        const fundId = metadata.fund_id || 'fund-lillah';
        const eventDate = event.created
          ? new Date(event.created * 1000).toISOString().substring(0, 10)
          : new Date().toISOString().substring(0, 10);
        
        await controller.createTransaction({
          type: 'INCOME',
          status: 'BANKED',
          method: 'CARD',
          totalAmount: amount,
          date: eventDate,
          reference_note: metadata.description || `Online Donation (Stripe: ${event.id})`,
          category: metadata.category || 'Donation',
          giftAid: metadata.gift_aid === 'true' || metadata.gift_aid === true,
          donorId: metadata.donor_id || null,
          splits: [{ fund_id: fundId, amount }]
        });

        logger.info('Online donation recorded via Stripe webhook', { eventId: event.id, amount });
      }
    }

    // Record processed event to guarantee idempotency
    await db.prepare(`
      INSERT INTO processed_webhook_events (id, provider, event_type, created_at)
      VALUES (?, 'stripe', ?, datetime('now'))
    `).bind(event.id, event.type).run();

    return apiSuccess({ received: true }, { message: 'Webhook event processed successfully' });
  } catch (err) {
    logger.error('Error processing webhook event', { error: err.message });
    return apiError(err.message, 400, { code: 'WEBHOOK_PROCESSING_ERROR' });
  }
}



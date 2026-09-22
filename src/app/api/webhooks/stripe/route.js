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
      const grossAmount = (paymentData.amount_received || paymentData.amount_total || paymentData.amount || 0) / 100;
      const metadata = paymentData.metadata || {};
      const feePence = paymentData.fee ||
        paymentData.application_fee_amount ||
        (paymentData.balance_transaction && paymentData.balance_transaction.fee) ||
        Math.round(parseFloat(metadata.stripe_fee || metadata.fee || 0) * 100);
      const feeAmount = feePence > 0 ? (feePence / 100) : 0;

      if (grossAmount > 0) {
        const fundId = metadata.fund_id || 'fund-lillah';
        const eventDate = event.created
          ? new Date(event.created * 1000).toISOString().substring(0, 10)
          : new Date().toISOString().substring(0, 10);
        
        // 1. Post Gross Donation as Income to target fund
        await controller.createTransaction({
          type: 'INCOME',
          status: 'BANKED',
          method: 'CARD',
          totalAmount: grossAmount,
          date: eventDate,
          reference_note: metadata.description || `Online Donation (Stripe: ${event.id})`,
          category: metadata.category || 'Donation',
          giftAid: metadata.gift_aid === 'true' || metadata.gift_aid === true,
          donorId: metadata.donor_id || null,
          splits: [{ fund_id: fundId, amount: grossAmount }]
        });

        // 2. Segregate Payment Processing Fee as Expense against General/Lillah unrestricted fund
        if (feeAmount > 0) {
          await controller.createTransaction({
            type: 'EXPENSE',
            status: 'BANKED',
            method: 'CARD',
            totalAmount: feeAmount,
            date: eventDate,
            reference_note: `Stripe Processing Fee (${event.id})`,
            category: 'Payment Processing',
            splits: [{ fund_id: 'fund-lillah', amount: feeAmount }],
            notes: `Payment processing fee deducted by provider for event ${event.id}`
          });
          logger.info('Segregated Stripe payment processing fee recorded', { eventId: event.id, feeAmount });
        }

        logger.info('Online donation recorded via Stripe webhook', { eventId: event.id, grossAmount, feeAmount });
      }
    } else if (event.type === 'charge.refunded') {
      // 3. Handle Stripe refund lifecycle with compensating reversal
      const chargeObj = event.data?.object || {};
      const refundAmount = (chargeObj.amount_refunded || chargeObj.amount || 0) / 100;
      const paymentIntentId = chargeObj.payment_intent || chargeObj.id;
      const eventDate = event.created
        ? new Date(event.created * 1000).toISOString().substring(0, 10)
        : new Date().toISOString().substring(0, 10);

      if (refundAmount > 0 && paymentIntentId) {
        const origTx = await db.prepare(
          `SELECT * FROM transactions WHERE reference_note LIKE ? OR notes LIKE ? LIMIT 1`
        ).bind(`%${paymentIntentId}%`, `%${paymentIntentId}%`).first();

        let splits = [{ fund_id: 'fund-lillah', amount: refundAmount }];
        if (origTx) {
          const splitRows = await db.prepare(
            `SELECT fund_id, amount FROM transaction_splits WHERE transaction_id = ?`
          ).bind(origTx.id).all();
          if (splitRows.results && splitRows.results.length > 0) {
            splits = splitRows.results.map(s => ({
              fund_id: s.fund_id,
              amount: s.amount / 100
            }));
          }
        }

        await controller.createTransaction({
          type: 'EXPENSE',
          status: 'BANKED',
          method: 'CARD',
          totalAmount: refundAmount,
          date: eventDate,
          reference_note: `Stripe Refund Reversal (${paymentIntentId})`,
          category: 'Refund',
          splits,
          notes: `Automatic accounting reversal for refunded Stripe charge ${paymentIntentId}`
        });

        logger.info('Stripe refund compensating reversal recorded', { paymentIntentId, refundAmount });
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



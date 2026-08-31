import { apiSuccess, apiError } from '@/lib/response';
import { verifyStripeSignature } from '@/lib/webhooks';
import { DatabaseController } from '@/lib/db';
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

    // Handle payment_intent.succeeded or checkout.session.completed
    if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
      const paymentData = event.data?.object || {};
      const amount = (paymentData.amount_received || paymentData.amount_total || 0) / 100;
      const metadata = paymentData.metadata || {};

      if (amount > 0) {
        const controller = new DatabaseController('ADMIN', 'system-stripe-webhook');
        const fundId = metadata.fund_id || 'fund-lillah';
        
        controller.createTransaction({
          type: 'INCOME',
          status: 'PENDING',
          method: 'CARD',
          totalAmount: amount,
          date: new Date().toISOString().substring(0, 10),
          reference_note: metadata.description || `Online Donation (Stripe: ${event.id})`,
          category: metadata.category || 'Donation',
          giftAid: metadata.gift_aid === 'true' || metadata.gift_aid === true,
          donorId: metadata.donor_id || null,
          splits: [{ fund_id: fundId, amount }]
        });

        logger.info('Online donation recorded via Stripe webhook', { eventId: event.id, amount });
      }
    }

    return apiSuccess({ received: true }, { message: 'Webhook event processed successfully' });
  } catch (err) {
    logger.error('Error processing webhook event', { error: err.message });
    return apiError(err.message, 400, { code: 'WEBHOOK_PROCESSING_ERROR' });
  }
}

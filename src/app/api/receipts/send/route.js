import { getAuthenticatedUser } from '@/lib/auth';
import { D1Controller } from '@/lib/d1-controller';
import { apiError, apiSuccess } from '@/lib/response';
import { sendDonationReceiptEmail } from '@/lib/email-service';

export async function POST(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized: Authentication required', 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { to, donorName, receiptDoc } = body;

    if (!to || typeof to !== 'string' || !to.includes('@')) {
      return apiError('A valid recipient email address is required', 400);
    }

    if (!receiptDoc || !receiptDoc.number || !receiptDoc.items) {
      return apiError('Receipt document structure is invalid or incomplete', 400);
    }

    const controller = new D1Controller(user.role, user.id, user.name, user.email);
    const org = await controller.getOrganisation();

    const result = await sendDonationReceiptEmail({
      to: to.trim(),
      donorName: donorName || receiptDoc.to?.split('\n')[0] || 'Donor',
      receiptDoc,
      org
    });

    // Record audit event
    const db = await controller.getDb();
    const auditId = 'aud-' + Math.random().toString(36).substring(2, 10);
    await db.prepare(`
      INSERT INTO audit_logs (id, table_name, record_id, action, user_id, user_email, user_name, metadata, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      auditId,
      'transactions',
      receiptDoc.number,
      'RECEIPT_DISPATCHED',
      user.id,
      user.email,
      user.name,
      JSON.stringify({ recipient: to.trim(), mode: result.mode, messageId: result.messageId })
    ).run();

    return apiSuccess({
      success: true,
      message: `Receipt ${receiptDoc.number} successfully dispatched to ${to}`,
      ...result
    });

  } catch (err) {
    return apiError(err.message, 500);
  }
}

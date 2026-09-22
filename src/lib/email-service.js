import { logger } from './logger.js';

/**
 * Generates and dispatches official branded donation receipts to donors.
 * Supports Resend API if RESEND_API_KEY is configured, falling back to structured console/mock logging.
 *
 * @param {Object} options
 * @param {string} options.to - Donor recipient email address
 * @param {string} options.donorName - Donor name
 * @param {Object} options.receiptDoc - Receipt document containing number, date, items, total, giftAid
 * @param {Object} options.org - Mosque organisation details
 * @returns {Promise<{success: boolean, messageId: string, mode: string}>}
 */
export async function sendDonationReceiptEmail({ to, donorName, receiptDoc, org }) {
  if (!to || !to.includes('@')) {
    throw new Error('Valid donor email address is required for dispatch');
  }

  const currency = org?.currency_symbol || '£';
  const orgName = org?.name || 'Mosque & Islamic Centre';
  const charityNum = org?.charity_number || '1189420';
  const orgEmail = org?.email || 'finance@mosque.org.uk';
  const items = receiptDoc?.items || [];
  const totalAmount = items.reduce((acc, item) => acc + ((item.qty || 1) * (item.amount || 0)), 0);

  const subject = `Official Donation Receipt [${receiptDoc.number}] - ${orgName}`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7fafc; color: #2d3748; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; padding: 24px; text-align: center; }
    .header h1 { margin: 0 0 6px 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
    .header p { margin: 0; font-size: 13px; opacity: 0.9; }
    .content { padding: 24px; }
    .meta-box { background: #f8fafc; border: 1px solid #edf2f7; border-radius: 6px; padding: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; font-size: 13px; }
    .table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .table th { background: #edf2f7; text-align: left; padding: 10px; font-size: 12px; text-transform: uppercase; color: #4a5568; }
    .table td { padding: 12px 10px; border-bottom: 1px solid #edf2f7; font-size: 14px; }
    .text-right { text-align: right; }
    .totals { margin-top: 14px; border-top: 2px solid #cbd5e0; padding-top: 12px; }
    .total-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 14px; }
    .grand-total { font-size: 18px; font-weight: bold; color: #10b981; }
    .footer { background: #f8fafc; border-top: 1px solid #edf2f7; padding: 18px; text-align: center; font-size: 12px; color: #718096; }
    .dua { font-style: italic; color: #2d3748; font-size: 14px; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${orgName}</h1>
      <p>Registered Charity No: ${charityNum}</p>
    </div>
    <div class="content">
      <p>Assalamu Alaikum wa Rahmatullahi wa Barakatuh,</p>
      <p>Dear <strong>${donorName || 'Respected Brother/Sister'}</strong>,</p>
      <p>Thank you for your generous contribution. Please find the details of your official donation receipt below:</p>

      <div class="meta-box">
        <div><strong>Receipt Ref:</strong> ${receiptDoc.number}</div>
        <div><strong>Date:</strong> ${receiptDoc.date}</div>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>Description</th>
            <th class="text-right">Qty</th>
            <th class="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td>${item.desc}</td>
              <td class="text-right">${item.qty || 1}</td>
              <td class="text-right">${currency}${(item.amount || 0).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="totals">
        <div class="total-row grand-total">
          <span>Total Received:</span>
          <span>${currency}${totalAmount.toFixed(2)}</span>
        </div>
        ${receiptDoc.giftAid ? `
          <div class="total-row" style="color: #059669; font-size: 13px;">
            <span>Gift Aid Declaration Active:</span>
            <span>+25% tax reclaimable from HMRC</span>
          </div>
        ` : ''}
      </div>

      <p class="dua">
        "Jazakum Allahu Khairan. May Allah bless you, your family, and your wealth, and multiply your good deeds abundantly."
      </p>
    </div>
    <div class="footer">
      <p>This is an official automated receipt issued by ${orgName}.</p>
      <p>For inquiries, please contact <a href="mailto:${orgEmail}">${orgEmail}</a>.</p>
    </div>
  </div>
</body>
</html>
  `;

  // Check if Resend or SMTP provider is configured
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: `${orgName} <${process.env.RESEND_FROM_EMAIL || 'receipts@mosque.org.uk'}>`,
          to: [to],
          subject,
          html: htmlBody
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Resend API dispatch failed (${res.status}): ${errText}`);
      }

      const data = await res.json();
      logger.info('Donation receipt emailed via Resend', { recipient: to, receiptNumber: receiptDoc.number, messageId: data.id });
      return { success: true, messageId: data.id, mode: 'resend' };
    } catch (err) {
      logger.error('Failed to dispatch receipt via Resend', { error: err.message, recipient: to });
      throw err;
    }
  }

  // Fallback to local / simulation mode
  const mockId = `mock-receipt-${Date.now()}`;
  logger.info('[MOCK EMAIL DISPATCH] Donation receipt generated and logged', {
    recipient: to,
    receiptNumber: receiptDoc.number,
    subject,
    total: `${currency}${totalAmount.toFixed(2)}`,
    mockMessageId: mockId
  });

  return { success: true, messageId: mockId, mode: 'mock' };
}

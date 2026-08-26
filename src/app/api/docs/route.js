import { NextResponse } from 'next/server';

export async function GET() {
  const openApiSpec = {
    openapi: '3.0.3',
    info: {
      title: 'Masjid Accounting API',
      version: '1.0.0',
      description: 'Islamic Financial Management System & Multi-Fund Accounting Ledger API with UK Charity Commission & HMRC Gift Aid integration.',
      contact: {
        name: 'Masjid Finance Engineering Team',
        email: 'finance@bsmc.org.uk'
      }
    },
    servers: [
      {
        url: '/',
        description: 'Current Environment'
      }
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'masjid_session',
          description: 'HMAC-signed session token cookie'
        }
      },
      schemas: {
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            meta: { type: 'object' },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: { type: 'object' }
              }
            }
          }
        },
        Transaction: {
          type: 'object',
          required: ['type', 'totalAmount', 'splits', 'date'],
          properties: {
            id: { type: 'string', example: 'tx-a1b2c3d4' },
            type: { type: 'string', enum: ['INCOME', 'EXPENSE'] },
            status: { type: 'string', enum: ['PENDING', 'BANKED', 'VOIDED'] },
            method: { type: 'string', example: 'CASH' },
            totalAmount: { type: 'number', example: 150.00 },
            receipt_number: { type: 'string', example: 'BSMC-2026-0001' },
            date: { type: 'string', format: 'date' },
            splits: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  fund_id: { type: 'string', example: 'fund-lillah' },
                  amount: { type: 'number', example: 150.00 }
                }
              }
            }
          }
        },
        Fund: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            is_restricted: { type: 'boolean' },
            description: { type: 'string' },
            is_archived: { type: 'boolean' }
          }
        },
        Donor: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
            giftAidEligible: { type: 'boolean' },
            address_line_1: { type: 'string' },
            postcode: { type: 'string' }
          }
        }
      }
    },
    paths: {
      '/api/auth/login': {
        post: {
          summary: 'User Login',
          description: 'Authenticate user with email and password, establishing a signed session cookie.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', format: 'password' }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: 'Authentication successful' },
            401: { description: 'Invalid credentials or inactive account' },
            429: { description: 'Rate limit exceeded' }
          }
        }
      },
      '/api/transactions': {
        get: {
          summary: 'List transactions',
          description: 'Fetch paginated and filtered transactions list.',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 15 } },
            { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'type', in: 'query', schema: { type: 'string', enum: ['INCOME', 'EXPENSE'] } },
            { name: 'fund', in: 'query', schema: { type: 'string' } }
          ],
          responses: {
            200: { description: 'Paginated transactions list' }
          }
        },
        post: {
          summary: 'Record transaction',
          description: 'Create a new financial transaction with fund splits and Shariah compliance verification.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Transaction' }
              }
            }
          },
          responses: {
            201: { description: 'Transaction recorded successfully' },
            400: { description: 'Validation error or Shariah restriction violation' }
          }
        }
      },
      '/api/funds/balances': {
        get: {
          summary: 'Get segregated fund balances',
          description: 'Retrieve real-time balances for all active restricted and unrestricted funds.',
          responses: {
            200: { description: 'Fund balances summary' }
          }
        }
      },
      '/api/reports/giftaid': {
        get: {
          summary: 'Generate HMRC Gift Aid Schedule',
          description: 'Generate UK HMRC compliant Gift Aid schedule or CSV export.',
          responses: {
            200: { description: 'Gift Aid report data or CSV attachment' }
          }
        }
      }
    }
  };

  return NextResponse.json(openApiSpec, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
    }
  });
}

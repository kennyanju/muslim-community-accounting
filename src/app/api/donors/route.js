import { readDB, DatabaseController } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { validateDonorPayload, sanitizePagination } from '@/lib/validation';
import { guardRateLimit } from '@/lib/rateLimit';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

export async function GET(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized: Authentication required to view donor records.', 401, { code: 'UNAUTHORIZED' });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.toLowerCase().trim() || '';
  const giftAidOnly = searchParams.get('giftAidOnly') === 'true';

  const db = readDB();
  let result = [...(db.donors || [])];

  if (search) {
    result = result.filter(d => 
      d.name?.toLowerCase().includes(search) ||
      d.email?.toLowerCase().includes(search) ||
      d.postcode?.toLowerCase().includes(search)
    );
  }

  if (giftAidOnly) {
    result = result.filter(d => d.gift_aid_eligible);
  }

  const { page, pageSize, offset } = sanitizePagination(searchParams, 50, 200);
  const paginated = result.slice(offset, offset + pageSize);

  return apiSuccess(paginated, {
    meta: {
      total: result.length,
      page,
      pageSize,
      totalPages: Math.ceil(result.length / pageSize)
    }
  });
}

export async function POST(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Financial Secretary (Admin) only', 403, { code: 'FORBIDDEN' });
  }

  // Rate limit donor creation
  const rateGuard = guardRateLimit(request, 'create_donor', config.rateLimit.writeMaxAttempts, config.rateLimit.writeWindowMs, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }
  
  try {
    const body = await request.json();
    validateDonorPayload(body);

    const { name, email, address, address_line_1, address_line_2, city, postcode, giftAidEligible } = body;
    const controller = new DatabaseController(user.role, user.id);
    const donorId = controller.createDonor({
      name,
      email,
      address,
      address_line_1,
      address_line_2,
      city,
      postcode,
      giftAidEligible
    });

    logger.info('Donor registered', { donorId, name, userId: user.id });
    return apiSuccess({ id: donorId }, { status: 201, message: 'Donor registered successfully', headers: rateGuard.headers });
  } catch (err) {
    logger.warn('Failed to register donor', { error: err.message, userId: user.id });
    return apiError(err.message, 400, { code: 'VALIDATION_ERROR' });
  }
}

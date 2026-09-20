import { D1Controller } from '@/lib/d1-controller';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { validateDonorPayload, sanitizePagination } from '@/lib/validation';
import { guardRateLimit } from '@/lib/rateLimit';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

export async function GET(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized: Authentication required to view donor records.', 401, { code: 'UNAUTHORIZED' });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.toLowerCase().trim() || '';
  const giftAidOnly = searchParams.get('giftAidOnly') === 'true';

  const controller = new D1Controller(user.role, user.id, user.name, user.email);
  let result = await controller.getDonors();

  if (search) {
    result = result.filter(d =>
      d.name?.toLowerCase().includes(search) ||
      d.first_name?.toLowerCase().includes(search) ||
      d.last_name?.toLowerCase().includes(search) ||
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
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Financial Secretary (Admin) only', 403, { code: 'FORBIDDEN' });
  }

  // Rate limit donor creation
  const rateGuard = await guardRateLimit(request, 'create_donor', config.rateLimit.writeMaxAttempts, config.rateLimit.writeWindowMs, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }

  try {
    const body = await request.json();
    validateDonorPayload(body);

    const {
      name,
      title,
      first_name,
      last_name,
      email,
      phone,
      address_line_1,
      address_line_2,
      city,
      postcode,
      giftAidEligible,
      gift_aid_eligible,
      is_anonymous,
      notes
    } = body;

    const controller = new D1Controller(user.role, user.id, user.name, user.email);
    const donorId = await controller.createDonor({
      name,
      title,
      first_name,
      last_name,
      email,
      phone,
      address_line_1,
      address_line_2,
      city,
      postcode,
      giftAidEligible: giftAidEligible ?? gift_aid_eligible,
      is_anonymous,
      notes
    });

    logger.info('Donor registered in D1', { donorId, name, userId: user.id });
    return apiSuccess({ id: donorId }, { status: 201, message: 'Donor registered successfully', headers: rateGuard.headers });
  } catch (err) {
    logger.warn('Failed to register donor', { error: err.message, userId: user.id });
    return apiError(err.message, 400, { code: 'VALIDATION_ERROR' });
  }
}

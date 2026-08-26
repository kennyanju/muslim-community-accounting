import { DatabaseController } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { validateUserPayload } from '@/lib/validation';
import { logger } from '@/lib/logger';

export async function GET(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Admins only', 403, { code: 'FORBIDDEN' });
  }

  const controller = new DatabaseController(user.role, user.id);
  const users = controller.getUsers();
  return apiSuccess(users);
}

export async function POST(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Admins only', 403, { code: 'FORBIDDEN' });
  }

  try {
    const body = await request.json();
    validateUserPayload(body, false);

    const { email, password, role, name } = body;
    const controller = new DatabaseController(user.role, user.id);
    const newUser = controller.createUser({ email, password, role, name });

    logger.info('New user account created', { newUserId: newUser.id, role: newUser.role, createdBy: user.id });
    return apiSuccess(newUser, { status: 201, message: 'User created successfully' });
  } catch (err) {
    logger.warn('Failed to create user', { error: err.message, userId: user.id });
    return apiError(err.message, 400, { code: 'VALIDATION_ERROR' });
  }
}

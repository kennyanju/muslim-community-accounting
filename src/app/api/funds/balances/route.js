import { DatabaseController } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';

export async function GET(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  const controller = new DatabaseController(user.role, user.id);
  const balances = controller.getBalances();
  return apiSuccess(balances, {
    headers: { 'Cache-Control': 'private, no-cache' }
  });
}

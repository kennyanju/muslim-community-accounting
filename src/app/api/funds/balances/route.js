import { D1Controller } from '@/lib/d1-controller';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';

export async function GET(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  const controller = new D1Controller(user.role, user.id, user.name, user.email);
  const balances = await controller.getBalances();
  return apiSuccess(balances, {
    headers: { 'Cache-Control': 'private, max-age=15' }
  });
}

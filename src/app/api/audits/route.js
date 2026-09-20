import { D1Controller } from '@/lib/d1-controller';
import { getAuthenticatedUser, requirePermission } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';

export async function GET(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized: Authentication required', 401, { code: 'UNAUTHORIZED' });
  }

  // Restrict audit trail view to users with 'read:audits' permission (ADMIN, AUDITOR)
  const authCheck = requirePermission(user, 'read:audits');
  if (!authCheck.ok) {
    return apiError(authCheck.message, authCheck.status, { code: 'FORBIDDEN' });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(500, parseInt(searchParams.get('limit') || '100', 10));
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

  try {
    const controller = new D1Controller(user.role, user.id, user.name, user.email);
    const logs = await controller.getAuditLogs(limit, offset);
    return apiSuccess(logs);
  } catch (err) {
    return apiError(err.message, 500, { code: 'AUDIT_ERROR' });
  }
}

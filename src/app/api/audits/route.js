import { readDB } from '@/lib/db';
import { getAuthenticatedUser, requirePermission } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';

export async function GET(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized: Authentication required', 401, { code: 'UNAUTHORIZED' });
  }

  // Restrict audit trail view to users with 'read:audits' permission (ADMIN, AUDITOR)
  const authCheck = requirePermission(user, 'read:audits');
  if (!authCheck.ok) {
    return apiError(authCheck.message, authCheck.status, { code: 'FORBIDDEN' });
  }

  const db = readDB();
  const userMap = new Map((db.users || []).map(u => [u.id, u]));

  const logs = (db.audit_logs || []).map(log => {
    const logUser = userMap.get(log.user_id);
    return {
      ...log,
      userEmail: log.user_email || (logUser ? logUser.email : (log.user_id || 'System')),
      userName: log.user_name || (logUser ? logUser.name : (log.user_id || 'System'))
    };
  });
  
  return apiSuccess(logs);
}

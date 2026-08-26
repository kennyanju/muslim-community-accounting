import { readDB } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';

export async function GET(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized: Authentication required', 401, { code: 'UNAUTHORIZED' });
  }

  const db = readDB();
  const logs = (db.audit_logs || []).map(log => {
    const logUser = (db.users || []).find(u => u.id === log.user_id);
    return {
      ...log,
      userEmail: log.user_email || (logUser ? logUser.email : (log.user_id || 'System')),
      userName: log.user_name || (logUser ? logUser.name : (log.user_id || 'System'))
    };
  });
  
  return apiSuccess(logs);
}

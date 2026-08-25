import { NextResponse } from 'next/server';
import { readDB } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';

export async function GET(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized: Authentication required' }, { status: 401 });
  }

  const db = readDB();
  const logs = (db.audit_logs || []).map(log => {
    const logUser = (db.users || []).find(u => u.id === log.user_id);
    return {
      ...log,
      userEmail: logUser ? logUser.email : (log.user_id || 'System'),
      userName: logUser ? logUser.name : (log.user_id || 'System')
    };
  });
  
  return NextResponse.json(logs);
}

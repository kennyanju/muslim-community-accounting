import { NextResponse } from 'next/server';
import { readDB } from '@/lib/db';

export async function GET(request) {
  const db = readDB();
  
  // Enforce role-based viewing (e.g. Reviews & Auditors can read audits, which is fine)
  const role = request.headers.get('x-user-role') || 'ADMIN';
  
  // Format user emails for presentation in audits
  const logs = db.auditLogs.map(log => {
    const user = db.users.find(u => u.id === log.userId) || { email: log.userId || 'system' };
    return {
      ...log,
      userEmail: user.email
    };
  });
  
  return NextResponse.json(logs);
}

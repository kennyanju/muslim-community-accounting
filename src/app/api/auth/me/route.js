import { NextResponse } from 'next/server';
import { readDB, getOrganisationFromRequest } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';

export async function GET(request) {
  const sessionUser = getAuthenticatedUser(request);
  
  if (!sessionUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = readDB();
  const user = db.users.find(u => u.id === sessionUser.id && u.status !== 'INACTIVE');
  
  if (!user) {
    return NextResponse.json({ error: 'User not found or deactivated' }, { status: 401 });
  }

  const safeUser = {
    id: user.id,
    email: user.email,
    name: user.name || user.email.split('@')[0],
    role: user.role
  };
  
  const org = getOrganisationFromRequest(request);
  
  return NextResponse.json({ 
    user: safeUser,
    organisation: org
  });
}

import { NextResponse } from 'next/server';
import { readDB } from '@/lib/db';

export async function GET(request) {
  const userId = request.headers.get('x-user-id') || 'user-sec-1';
  const db = readDB();
  const user = db.users.find(u => u.id === userId);
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  return NextResponse.json({ user });
}

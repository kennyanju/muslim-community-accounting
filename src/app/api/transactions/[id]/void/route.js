import { NextResponse } from 'next/server';
import { DatabaseController } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';

export async function POST(request, { params }) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Financial Secretary (Admin) only' }, { status: 403 });
  }

  const { id } = await params;
  
  try {
    const { reason } = await request.json();
    const controller = new DatabaseController(user.role, user.id);
    controller.voidTransaction(id, reason);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Void transaction failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

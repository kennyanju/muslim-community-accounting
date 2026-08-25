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
    const controller = new DatabaseController(user.role, user.id);
    controller.reconcileTransaction(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

import { NextResponse } from 'next/server';
import { DatabaseController, readDB } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';

export async function GET(request) {
  const db = readDB();
  return NextResponse.json(db.organisation || {});
}

export async function PUT(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admins only' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const controller = new DatabaseController(user.role, user.id);
    const updated = controller.updateOrganisation(body);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

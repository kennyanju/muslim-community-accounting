import { NextResponse } from 'next/server';
import { DatabaseController, getOrganisationFromRequest } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';

export async function GET(request) {
  const org = getOrganisationFromRequest(request);
  return NextResponse.json(org);
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

    const response = NextResponse.json(updated);
    // Set 1-year persistent cookie so organisation settings survive edge cold-starts and logouts
    const cookieVal = encodeURIComponent(JSON.stringify(updated));
    response.cookies.set('masjid_org_pref', cookieVal, {
      path: '/',
      maxAge: 31536000, // 1 year in seconds
      sameSite: 'lax',
      httpOnly: false
    });

    return response;
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

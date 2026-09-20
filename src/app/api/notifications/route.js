import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { D1Controller } from '@/lib/d1-controller';
import { apiError } from '@/lib/response';

export async function GET(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized: Authentication required', 401);
  }

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get('unread') === 'true';
  const limit = Math.min(100, parseInt(searchParams.get('limit') || '50', 10));

  try {
    const controller = new D1Controller(user.role, user.id, user.name, user.email);
    const notifications = await controller.getNotifications(unreadOnly, limit);
    const unreadCount = notifications.filter(n => !n.read_at).length;

    return NextResponse.json({
      notifications,
      unreadCount
    }, { status: 200 });
  } catch (err) {
    return apiError(err.message, 500);
  }
}

export async function PATCH(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized: Authentication required', 401);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const id = body.id || 'all';

    const controller = new D1Controller(user.role, user.id, user.name, user.email);
    await controller.markNotificationRead(id);

    return NextResponse.json({ success: true, markedRead: id }, { status: 200 });
  } catch (err) {
    return apiError(err.message, 500);
  }
}

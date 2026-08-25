import { NextResponse } from 'next/server';
import { DatabaseController } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';

export async function GET(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admins only' }, { status: 403 });
  }

  try {
    const controller = new DatabaseController(user.role, user.id);
    const backupData = controller.exportBackup();
    const org = backupData.organisation || {};
    const shortName = (org.short_name || 'MASJID').replace(/[^a-zA-Z0-9]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    return new Response(JSON.stringify(backupData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename=${shortName}_Financial_Backup_${timestamp}.json`
      }
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admins only' }, { status: 403 });
  }

  try {
    const backupData = await request.json();
    const controller = new DatabaseController(user.role, user.id);
    controller.restoreBackup(backupData);
    return NextResponse.json({ success: true, message: 'Database restored successfully.' });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admins only' }, { status: 403 });
  }

  try {
    const controller = new DatabaseController(user.role, user.id);
    controller.resetDatabase(true);
    return NextResponse.json({ success: true, message: 'Database reset to clean state successfully.' });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

import { NextResponse } from 'next/server';
import { DatabaseController } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { logger } from '@/lib/logger';

export async function GET(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Admins only', 403, { code: 'FORBIDDEN' });
  }

  try {
    const controller = new DatabaseController(user.role, user.id);
    const backupData = controller.exportBackup();
    const org = backupData.organisation || {};
    const shortName = (org.short_name || 'MASJID').replace(/[^a-zA-Z0-9]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    logger.info('Database backup exported', { userId: user.id });

    return new Response(JSON.stringify(backupData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename=${shortName}_Financial_Backup_${timestamp}.json`
      }
    });
  } catch (err) {
    logger.error('Failed to export backup', { error: err.message, userId: user.id });
    return apiError(err.message, 500, { code: 'BACKUP_EXPORT_ERROR' });
  }
}

export async function POST(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Admins only', 403, { code: 'FORBIDDEN' });
  }

  try {
    const backupData = await request.json();
    const controller = new DatabaseController(user.role, user.id);
    controller.restoreBackup(backupData);

    logger.info('Database backup restored', { userId: user.id });

    const response = apiSuccess({ restored: true }, { message: 'Database restored successfully.' });
    if (backupData.organisation && backupData.organisation.name) {
      const cookieVal = encodeURIComponent(JSON.stringify(backupData.organisation));
      response.cookies.set('masjid_org_pref', cookieVal, {
        path: '/',
        maxAge: 31536000,
        sameSite: 'lax',
        httpOnly: false
      });
    }
    return response;
  } catch (err) {
    logger.error('Failed to restore backup', { error: err.message, userId: user.id });
    return apiError(err.message, 400, { code: 'BACKUP_RESTORE_ERROR' });
  }
}

export async function DELETE(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Admins only', 403, { code: 'FORBIDDEN' });
  }

  try {
    const controller = new DatabaseController(user.role, user.id);
    controller.resetDatabase(true);

    logger.info('Database reset to clean template', { userId: user.id });

    const response = apiSuccess({ reset: true }, { message: 'Database reset to clean state successfully.' });
    response.cookies.delete('masjid_org_pref');
    return response;
  } catch (err) {
    logger.error('Failed to reset database', { error: err.message, userId: user.id });
    return apiError(err.message, 400, { code: 'RESET_ERROR' });
  }
}

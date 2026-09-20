import { D1Controller, DISPLAY_SAFE_ORG_FIELDS } from '@/lib/d1-controller';

import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { guardRateLimit } from '@/lib/rateLimit';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

export async function GET(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Admins only', 403, { code: 'FORBIDDEN' });
  }

  // Rate limit backup export
  const rateGuard = await guardRateLimit(request, 'backup_export', config.rateLimit.backupMaxAttempts, config.rateLimit.backupWindowMs, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }

  try {
    const controller = new D1Controller(user.role, user.id);
    const backupData = await controller.exportBackup();
    const org = backupData.organisation || {};
    const shortName = (org.short_name || 'MASJID').replace(/[^a-zA-Z0-9]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    logger.info('Database backup exported', { userId: user.id });

    return new Response(JSON.stringify(backupData, null, 2), {
      headers: {
        ...rateGuard.headers,
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
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Admins only', 403, { code: 'FORBIDDEN' });
  }

  // Rate limit backup restore
  const rateGuard = await guardRateLimit(request, 'backup_restore', config.rateLimit.backupMaxAttempts, config.rateLimit.backupWindowMs, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }

  try {
    const url = new URL(request.url);
    const dryRun = url.searchParams.get('dryRun') === 'true';

    const backupData = await request.json();
    const controller = new D1Controller(user.role, user.id);
    const result = await controller.restoreBackup(backupData, dryRun);

    logger.info(`Database backup ${dryRun ? 'dry-run simulated' : 'restored'}`, { userId: user.id, dryRun });

    const responseHeaders = { ...rateGuard.headers };
    if (!dryRun && backupData.organisation && backupData.organisation.name) {
      // Whitelist only display-safe fields to avoid PII exposure in non-httpOnly cookie
      const displaySafeOrg = {};
      DISPLAY_SAFE_ORG_FIELDS.forEach(field => {
        if (backupData.organisation[field] !== undefined) {
          displaySafeOrg[field] = backupData.organisation[field];
        }
      });

      const cookieVal = encodeURIComponent(JSON.stringify(displaySafeOrg));
      responseHeaders['Set-Cookie'] = `masjid_org_pref=${cookieVal}; Path=/; Max-Age=31536000; SameSite=Lax`;
    }

    return Response.json(
      {
        success: true,
        data: result,
        message: dryRun
          ? 'Backup validation dry-run completed successfully.'
          : `Database restored successfully. Snapshot ${result.snapshotId} created.`
      },
      { status: 200, headers: responseHeaders }
    );
  } catch (err) {
    logger.error('Failed to restore backup', { error: err.message, userId: user.id });
    return apiError(err.message, 400, { code: 'BACKUP_RESTORE_ERROR' });
  }
}

export async function DELETE(request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  if (user.role !== 'ADMIN') {
    return apiError('Forbidden: Admins only', 403, { code: 'FORBIDDEN' });
  }

  // Rate limit database reset
  const rateGuard = await guardRateLimit(request, 'backup_reset', config.rateLimit.backupMaxAttempts, config.rateLimit.backupWindowMs, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }

  try {
    const controller = new D1Controller(user.role, user.id);
    await controller.resetDatabase(true);

    logger.info('Database reset to clean template', { userId: user.id });

    return Response.json(
      { success: true, data: { reset: true }, message: 'Database reset to clean state successfully.' },
      {
        status: 200,
        headers: {
          ...rateGuard.headers,
          // Clear the org display cookie by expiring it immediately
          'Set-Cookie': 'masjid_org_pref=; Path=/; Max-Age=0; SameSite=Lax'
        }
      }
    );
  } catch (err) {
    logger.error('Failed to reset database', { error: err.message, userId: user.id });
    return apiError(err.message, 400, { code: 'RESET_ERROR' });
  }
}


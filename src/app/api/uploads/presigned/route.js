import { getAuthenticatedUser } from '@/lib/auth';
import { apiSuccess, apiError } from '@/lib/response';
import { generatePresignedUploadUrl, ALLOWED_MIME_TYPES } from '@/lib/fileUpload';
import { guardRateLimit } from '@/lib/rateLimit';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

export async function POST(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  // Rate limit presigned upload ticket requests
  const rateGuard = guardRateLimit(request, 'presigned_upload', config.rateLimit.writeMaxAttempts, config.rateLimit.writeWindowMs, user.id);
  if (!rateGuard.isAllowed) {
    return rateGuard.errorResponse;
  }

  try {
    const { filename, contentType } = await request.json();

    if (!filename || !contentType) {
      return apiError('Filename and contentType are required.', 400, { code: 'INVALID_PAYLOAD' });
    }

    if (!ALLOWED_MIME_TYPES[contentType]) {
      return apiError('Unsupported content type. Allowed formats: PDF, JPEG, PNG, WEBP.', 400, { code: 'INVALID_MIME_TYPE' });
    }

    const presigned = generatePresignedUploadUrl({ filename, contentType });
    logger.info('Pre-signed direct upload ticket generated', { userId: user.id, objectKey: presigned.objectKey });

    return apiSuccess(presigned, {
      message: 'Direct upload URL generated successfully',
      headers: rateGuard.headers
    });
  } catch (err) {
    logger.error('Failed to generate pre-signed upload URL', { error: err.message, userId: user.id });
    return apiError(err.message, 400, { code: 'UPLOAD_SIGN_ERROR' });
  }
}

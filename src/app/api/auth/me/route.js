import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getOrganisationFromRequest } from '@/lib/db';
import { apiSuccess, apiError } from '@/lib/response';

export async function GET(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return apiError('Unauthorized', 401, { code: 'UNAUTHORIZED' });
  }

  const organisation = getOrganisationFromRequest(request);

  return apiSuccess({
    user,
    organisation
  });
}

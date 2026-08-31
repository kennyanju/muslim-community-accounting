import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getMetricsSnapshot, getPrometheusFormat } from '@/lib/metrics';
import { apiError } from '@/lib/response';

export async function GET(request) {
  // Check authorization: Either authenticated admin/auditor user OR scraper bearer token
  const authHeader = request.headers.get('authorization') || '';
  const scraperSecret = process.env.METRICS_SCRAPER_TOKEN;
  const isBearerScraper = scraperSecret && authHeader.startsWith('Bearer ') && authHeader.substring(7) === scraperSecret;

  if (!isBearerScraper) {
    const user = getAuthenticatedUser(request);
    if (!user || (user.role !== 'ADMIN' && user.role !== 'AUDITOR')) {
      return apiError('Unauthorized: Metrics access requires ADMIN/AUDITOR role or scraper token', 401, { code: 'UNAUTHORIZED' });
    }
  }

  const acceptHeader = request.headers.get('accept') || '';
  if (acceptHeader.includes('text/plain') || request.nextUrl.searchParams.get('format') === 'prometheus') {
    return new NextResponse(getPrometheusFormat(), {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  }

  return NextResponse.json(getMetricsSnapshot(), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}

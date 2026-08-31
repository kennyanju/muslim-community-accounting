import { NextResponse } from 'next/server';

/**
 * Liveness Probe Endpoint (/healthz)
 * Returns 200 OK if the worker/server process is alive and accepting traffic.
 */
export async function GET() {
  const uptimeSeconds = process.uptime ? Math.floor(process.uptime()) : 0;

  return NextResponse.json({
    status: 'ok',
    service: 'masjid-accounting',
    uptime: uptimeSeconds,
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  }, {
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Type': 'application/json'
    }
  });
}

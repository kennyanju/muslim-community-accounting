import { NextResponse } from 'next/server';
import { readDB } from '@/lib/db';

/**
 * Readiness Probe Endpoint (/readyz)
 * Deep dependency check verifying database access, active funds, and organization setup.
 */
export async function GET() {
  const checks = {
    database: 'unknown',
    funds: 'unknown',
    organisation: 'unknown'
  };

  let isReady = true;

  try {
    const db = readDB();
    if (!db || typeof db !== 'object') {
      checks.database = 'error: unreadable database object';
      isReady = false;
    } else {
      checks.database = 'ok';
    }

    if (Array.isArray(db?.funds) && db.funds.length > 0) {
      checks.funds = 'ok';
    } else {
      checks.funds = 'error: no active Islamic funds configured';
      isReady = false;
    }

    if (db?.organisation?.name) {
      checks.organisation = 'ok';
    } else {
      checks.organisation = 'warning: default organisation name';
    }
  } catch (err) {
    checks.database = `error: ${err.message}`;
    isReady = false;
  }

  const statusCode = isReady ? 200 : 503;

  return NextResponse.json({
    status: isReady ? 'ready' : 'degraded',
    checks,
    timestamp: new Date().toISOString()
  }, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Type': 'application/json'
    }
  });
}

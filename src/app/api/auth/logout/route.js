import { NextResponse } from 'next/server';
import { buildLogoutCookie } from '@/lib/auth';
import { apiSuccess } from '@/lib/response';

export async function POST() {
  const cookieHeader = buildLogoutCookie();
  const response = apiSuccess({ message: 'Logged out successfully' });
  response.headers.set('Set-Cookie', cookieHeader);
  return response;
}

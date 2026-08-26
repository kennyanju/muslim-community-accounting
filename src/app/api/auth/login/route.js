import { NextResponse } from 'next/server';
import { readDB, getOrganisationFromRequest } from '@/lib/db';
import { verifyPassword, createSessionToken, buildSessionCookie } from '@/lib/auth';

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const db = readDB();
    const user = db.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());

    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Account is inactive or credentials are invalid' },
        { status: 401 }
      );
    }

    const isMatch = verifyPassword(password, user.password_hash);
    if (!isMatch) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    const token = createSessionToken(user);
    const cookieHeader = buildSessionCookie(token);

    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name || user.email.split('@')[0],
      role: user.role
    };

    const org = getOrganisationFromRequest(request);

    const response = NextResponse.json({
      success: true,
      user: safeUser,
      organisation: org
    });

    response.headers.set('Set-Cookie', cookieHeader);
    return response;
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}

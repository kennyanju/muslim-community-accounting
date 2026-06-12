import { NextResponse } from 'next/server';
import { DatabaseController } from '@/lib/db';

export async function POST(request, { params }) {
  const role = request.headers.get('x-user-role') || 'ADMIN';
  const userId = request.headers.get('x-user-id') || 'user-sec-1';
  const { id } = await params;
  
  try {
    const controller = new DatabaseController(role, userId);
    controller.depositCash(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const isForbidden = err.message.includes("403 Forbidden");
    return NextResponse.json(
      { error: err.message },
      { status: isForbidden ? 403 : 400 }
    );
  }
}

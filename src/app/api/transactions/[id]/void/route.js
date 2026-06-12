import { NextResponse } from 'next/server';
import { DatabaseController } from '@/lib/db';

export async function POST(request, { params }) {
  const role = request.headers.get('x-user-role') || 'ADMIN';
  const userId = request.headers.get('x-user-id') || 'user-sec-1';
  const { id } = await params;
  
  // Verify Admin Role Check
  if (role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admins only' }, { status: 403 });
  }

  try {
    const { reason } = await request.json();
    const controller = new DatabaseController(role, userId);
    
    // Updates status to VOIDED and logs to audit trail
    controller.voidTransaction(id, reason);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Void transaction failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

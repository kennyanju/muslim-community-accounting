import { NextResponse } from 'next/server';
import { readDB, DatabaseController } from '@/lib/db';

export async function GET(request) {
  const db = readDB();
  return NextResponse.json(db.donors);
}

export async function POST(request) {
  const role = request.headers.get('x-user-role') || 'ADMIN';
  const userId = request.headers.get('x-user-id') || 'user-sec-1';
  
  try {
    const { name, address, giftAidEligible } = await request.json();
    const controller = new DatabaseController(role, userId);
    const donorId = controller.createDonor(name, address, giftAidEligible);
    return NextResponse.json({ id: donorId }, { status: 210 });
  } catch (err) {
    const isForbidden = err.message.includes("403 Forbidden");
    return NextResponse.json(
      { error: err.message },
      { status: isForbidden ? 403 : 400 }
    );
  }
}

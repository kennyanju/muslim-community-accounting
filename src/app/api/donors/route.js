import { NextResponse } from 'next/server';
import { readDB, DatabaseController } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';

export async function GET(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized: Authentication required to view donor records.' }, { status: 401 });
  }

  const db = readDB();
  return NextResponse.json(db.donors);
}

export async function POST(request) {
  const user = getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Financial Secretary (Admin) only' }, { status: 403 });
  }
  
  try {
    const { name, address, address_line_1, address_line_2, city, postcode, giftAidEligible } = await request.json();
    const controller = new DatabaseController(user.role, user.id);
    const donorId = controller.createDonor({
      name,
      address,
      address_line_1,
      address_line_2,
      city,
      postcode,
      giftAidEligible
    });
    return NextResponse.json({ success: true, id: donorId }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err.message },
      { status: 400 }
    );
  }
}

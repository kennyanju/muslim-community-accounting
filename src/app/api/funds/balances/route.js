import { NextResponse } from 'next/server';
import { DatabaseController } from '@/lib/db';

export async function GET(request) {
  try {
    const controller = new DatabaseController();
    const balances = controller.getBalances();
    return NextResponse.json(balances);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

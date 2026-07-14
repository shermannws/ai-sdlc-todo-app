import { NextResponse } from 'next/server';
import { holidayDB } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const holidays = holidayDB.findAll();
  return NextResponse.json(holidays);
}

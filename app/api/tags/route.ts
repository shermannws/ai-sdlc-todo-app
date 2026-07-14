import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { tagDB } from '@/lib/db';

export const dynamic = 'force-dynamic';

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const tags = tagDB.findByUserId(session.userId);
  return NextResponse.json(tags);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });
  }
  if (name.length > 50) {
    return NextResponse.json({ error: 'Tag name must be 50 characters or fewer' }, { status: 400 });
  }

  let color = '#3B82F6';
  if (body.color !== undefined && body.color !== null && body.color !== '') {
    if (!HEX_COLOR_RE.test(body.color)) {
      return NextResponse.json({ error: 'Color must be a valid hex color (e.g. #3B82F6)' }, { status: 400 });
    }
    color = body.color;
  }

  try {
    const tag = tagDB.create({ userId: session.userId, name, color });
    return NextResponse.json(tag, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Tag name already exists' }, { status: 409 });
    }
    throw err;
  }
}

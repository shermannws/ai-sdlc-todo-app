import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { tagDB } from '@/lib/db';

export const dynamic = 'force-dynamic';

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const tagId = parseInt(id, 10);
  if (isNaN(tagId)) return NextResponse.json({ error: 'Invalid tag id' }, { status: 400 });

  const tag = tagDB.findById(tagId);
  if (!tag || tag.user_id !== session.userId) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
  }

  const body = await request.json();
  const updates: { name?: string; color?: string } = {};

  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });
    if (name.length > 50) return NextResponse.json({ error: 'Tag name must be 50 characters or fewer' }, { status: 400 });
    updates.name = name;
  }

  if (body.color !== undefined) {
    if (!HEX_COLOR_RE.test(body.color)) {
      return NextResponse.json({ error: 'Color must be a valid hex color (e.g. #3B82F6)' }, { status: 400 });
    }
    updates.color = body.color;
  }

  try {
    const updated = tagDB.update(tagId, updates);
    return NextResponse.json(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Tag name already exists' }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const tagId = parseInt(id, 10);
  if (isNaN(tagId)) return NextResponse.json({ error: 'Invalid tag id' }, { status: 400 });

  const tag = tagDB.findById(tagId);
  if (!tag || tag.user_id !== session.userId) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
  }

  tagDB.delete(tagId);
  return new NextResponse(null, { status: 204 });
}

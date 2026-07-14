import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { tagDB, todoDB } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const todoId = parseInt(id, 10);
  if (isNaN(todoId)) return NextResponse.json({ error: 'Invalid todo id' }, { status: 400 });

  const todo = todoDB.findById(todoId);
  if (!todo || todo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  const body = await request.json();
  const tagId = typeof body.tagId === 'number' ? body.tagId : parseInt(body.tagId, 10);
  if (isNaN(tagId)) return NextResponse.json({ error: 'tagId is required' }, { status: 400 });

  const tag = tagDB.findById(tagId);
  if (!tag || tag.user_id !== session.userId) {
    return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
  }

  tagDB.attachToTodo(todoId, tagId);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const todoId = parseInt(id, 10);
  if (isNaN(todoId)) return NextResponse.json({ error: 'Invalid todo id' }, { status: 400 });

  const todo = todoDB.findById(todoId);
  if (!todo || todo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  const body = await request.json();
  const tagId = typeof body.tagId === 'number' ? body.tagId : parseInt(body.tagId, 10);
  if (isNaN(tagId)) return NextResponse.json({ error: 'tagId is required' }, { status: 400 });

  tagDB.detachFromTodo(todoId, tagId);
  return NextResponse.json({ success: true });
}

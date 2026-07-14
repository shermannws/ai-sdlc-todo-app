import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { subtaskDB, todoDB } from '@/lib/db';

async function getOwnedSubtask(subtaskId: number, userId: number) {
  const subtask = subtaskDB.findById(subtaskId);
  if (!subtask) {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }

  const todo = todoDB.findById(subtask.todo_id);
  if (!todo) {
    return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  }

  if (todo.user_id !== userId) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { subtask };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const subtaskId = Number(id);
  const owned = await getOwnedSubtask(subtaskId, session.userId);
  if ('error' in owned) return owned.error;

  const body = await request.json();
  const updateData: Parameters<typeof subtaskDB.update>[1] = {};

  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });
    updateData.title = title;
  }

  if (body.completed !== undefined) {
    if (typeof body.completed !== 'boolean') {
      return NextResponse.json({ error: 'Completed must be a boolean' }, { status: 400 });
    }
    updateData.completed = body.completed;
  }

  const updated = subtaskDB.update(subtaskId, updateData);
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const subtaskId = Number(id);
  const owned = await getOwnedSubtask(subtaskId, session.userId);
  if ('error' in owned) return owned.error;

  subtaskDB.delete(subtaskId);
  return new NextResponse(null, { status: 204 });
}

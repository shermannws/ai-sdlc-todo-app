import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { subtaskDB, todoDB } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const todoId = Number(id);
  const todo = todoDB.findById(todoId);

  if (!todo) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (todo.user_id !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });

  const existingSubtasks = subtaskDB.findByTodoId(todoId);
  const nextPosition =
    existingSubtasks.length > 0
      ? Math.max(...existingSubtasks.map((subtask) => subtask.position)) + 1
      : 0;

  const subtask = subtaskDB.create({ todoId, title, position: nextPosition });
  return NextResponse.json(subtask, { status: 201 });
}

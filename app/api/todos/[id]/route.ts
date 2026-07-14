import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';
import type { Priority } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const todo = todoDB.findById(Number(id));

  if (!todo) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (todo.user_id !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json(todo);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const todo = todoDB.findById(Number(id));

  if (!todo) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (todo.user_id !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const updateData: Parameters<typeof todoDB.update>[1] = {};

  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
    updateData.title = title;
  }

  if (body.completed !== undefined) {
    updateData.completed = Boolean(body.completed);
  }

  if (body.due_date !== undefined) {
    if (body.due_date !== null) {
      const dueDateObj = new Date(body.due_date);
      if (isNaN(dueDateObj.getTime())) {
        return NextResponse.json({ error: 'Invalid due date format' }, { status: 400 });
      }
      const minDate = new Date(getSingaporeNow().getTime() + 60 * 1000);
      if (dueDateObj < minDate) {
        return NextResponse.json({ error: 'Due date must be at least 1 minute in the future' }, { status: 400 });
      }
    }
    updateData.due_date = body.due_date;
  }

  if (body.priority !== undefined) {
    if (!(['high', 'medium', 'low'] as Priority[]).includes(body.priority)) {
      return NextResponse.json({ error: 'Invalid priority' }, { status: 400 });
    }
    updateData.priority = body.priority;
  }

  // TODO: recurring completion hook
  // feature/recurring-reminders branch replaces this comment with next-instance logic

  const updated = todoDB.update(Number(id), updateData);
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const todo = todoDB.findById(Number(id));

  if (!todo) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (todo.user_id !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  todoDB.delete(Number(id));
  return new NextResponse(null, { status: 204 });
}

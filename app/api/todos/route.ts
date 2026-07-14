import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const todos = todoDB.findByUserId(session.userId);
  return NextResponse.json(todos);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const priority = body.priority ?? 'medium';
  if (!['high', 'medium', 'low'].includes(priority)) {
    return NextResponse.json({ error: 'Invalid priority. Must be high, medium, or low.' }, { status: 400 });
  }

  let dueDate: string | null = null;
  if (body.due_date) {
    const dueDateObj = new Date(body.due_date);
    if (isNaN(dueDateObj.getTime())) {
      return NextResponse.json({ error: 'Invalid due date format' }, { status: 400 });
    }
    const minDate = new Date(getSingaporeNow().getTime() + 60 * 1000);
    if (dueDateObj < minDate) {
      return NextResponse.json({ error: 'Due date must be at least 1 minute in the future' }, { status: 400 });
    }
    dueDate = body.due_date;
  }

  const todo = todoDB.create({
    userId: session.userId,
    title,
    dueDate,
    priority,
  });

  return NextResponse.json(todo, { status: 201 });
}

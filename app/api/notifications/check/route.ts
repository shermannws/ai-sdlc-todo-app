import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { getSingaporeNow, toSingaporeISOString } from '@/lib/timezone';

function parseDueDateInSingapore(value: string): Date {
  const hasOffset = /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  return new Date(hasOffset ? value : `${value}+08:00`);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const now = getSingaporeNow();
  const todos = todoDB.findByUserId(session.userId);

  const due = todos.filter((todo) => {
    if (!todo.due_date || !todo.reminder_minutes || todo.completed) return false;

    const dueAt = parseDueDateInSingapore(todo.due_date);
    const remindAt = new Date(dueAt.getTime() - todo.reminder_minutes * 60 * 1000);
    const isInWindow = now >= remindAt && now <= dueAt;

    if (todo.last_notification_sent) {
      const lastSent = parseDueDateInSingapore(todo.last_notification_sent);
      if (lastSent >= remindAt) return false;
    }

    return isInWindow;
  });

  for (const todo of due) {
    todoDB.update(todo.id, { last_notification_sent: toSingaporeISOString(now) });
  }

  return NextResponse.json(due);
}

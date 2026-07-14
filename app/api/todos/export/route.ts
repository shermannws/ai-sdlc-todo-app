import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { getSingaporeNow, getSingaporeDateString } from '@/lib/timezone';

const REMINDER_LABELS: Record<number, string> = {
  15: '15m',
  30: '30m',
  60: '1h',
  120: '2h',
  1440: '1d',
  2880: '2d',
  10080: '1w',
};

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') ?? 'json';

  const todos = todoDB.findByUserId(session.userId);
  const dateStr = getSingaporeDateString();

  if (format === 'csv') {
    const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;

    const header = 'ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder';
    const rows = todos.map((todo) => {
      const reminderLabel =
        todo.reminder_minutes != null ? (REMINDER_LABELS[todo.reminder_minutes] ?? '') : '';
      return [
        escape(String(todo.id)),
        escape(todo.title),
        escape(String(todo.completed)),
        escape(todo.due_date ?? ''),
        escape(todo.priority),
        escape(String(todo.is_recurring)),
        escape(todo.recurrence_pattern ?? ''),
        escape(reminderLabel),
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="todos-${dateStr}.csv"`,
      },
    });
  }

  // JSON format
  const exportedTodos = todos.map((todo) => ({
    title: todo.title,
    completed: todo.completed,
    due_date: todo.due_date,
    priority: todo.priority,
    is_recurring: todo.is_recurring,
    recurrence_pattern: todo.recurrence_pattern,
    reminder_minutes: todo.reminder_minutes,
    subtasks: (todo.subtasks ?? []).map((s) => ({
      title: s.title,
      completed: s.completed,
      position: s.position,
    })),
    tags: (todo.tags ?? []).map((t) => ({
      name: t.name,
      color: t.color,
    })),
  }));

  const envelope = {
    version: 1,
    exported_at: getSingaporeNow().toISOString(),
    todos: exportedTodos,
  };

  return new Response(JSON.stringify(envelope, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="todos-${dateStr}.json"`,
    },
  });
}

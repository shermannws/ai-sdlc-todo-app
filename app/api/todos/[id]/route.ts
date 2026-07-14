import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { tagDB, todoDB } from '@/lib/db';
import { calculateNextDueDate, getSingaporeNow } from '@/lib/timezone';
import type { Priority, RecurrencePattern, ReminderMinutes } from '@/lib/db';

const ALLOWED_RECURRENCE_PATTERNS: RecurrencePattern[] = ['daily', 'weekly', 'monthly', 'yearly'];
const ALLOWED_REMINDER_MINUTES: ReminderMinutes[] = [15, 30, 60, 120, 1440, 2880, 10080];

function parseDueDateInSingapore(value: string): Date {
  const hasOffset = /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  const parsed = new Date(hasOffset ? value : `${value}+08:00`);
  if (isNaN(parsed.getTime())) {
    throw new Error('Invalid due date format');
  }
  return parsed;
}

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
      let dueDateObj: Date;
      try {
        dueDateObj = parseDueDateInSingapore(body.due_date);
      } catch {
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

  if (body.is_recurring !== undefined) {
    updateData.is_recurring = Boolean(body.is_recurring);
    if (body.is_recurring === false && body.recurrence_pattern === undefined) {
      updateData.recurrence_pattern = null;
    }
  }

  if (body.recurrence_pattern !== undefined) {
    if (body.recurrence_pattern !== null) {
      if (
        typeof body.recurrence_pattern !== 'string' ||
        !ALLOWED_RECURRENCE_PATTERNS.includes(body.recurrence_pattern as RecurrencePattern)
      ) {
        return NextResponse.json({ error: 'Invalid recurrence_pattern' }, { status: 400 });
      }
    }
    updateData.recurrence_pattern = body.recurrence_pattern;
  }

  if (body.reminder_minutes !== undefined) {
    if (body.reminder_minutes === null) {
      updateData.reminder_minutes = null;
    } else {
      const reminder = Number(body.reminder_minutes);
      if (!ALLOWED_REMINDER_MINUTES.includes(reminder as ReminderMinutes)) {
        return NextResponse.json(
          { error: 'Invalid reminder_minutes. Allowed values: 15, 30, 60, 120, 1440, 2880, 10080' },
          { status: 400 }
        );
      }
      updateData.reminder_minutes = reminder as ReminderMinutes;
    }
  }

  const resultingDueDate = body.due_date !== undefined ? body.due_date : todo.due_date;
  const resultingIsRecurring = body.is_recurring !== undefined ? Boolean(body.is_recurring) : todo.is_recurring;
  const resultingRecurrencePattern =
    body.recurrence_pattern !== undefined ? body.recurrence_pattern : todo.recurrence_pattern;
  const resultingReminderMinutes =
    body.reminder_minutes !== undefined ? body.reminder_minutes : todo.reminder_minutes;

  if (resultingIsRecurring) {
    if (!resultingDueDate) {
      return NextResponse.json({ error: 'Recurring todos require a due date' }, { status: 400 });
    }

    if (
      typeof resultingRecurrencePattern !== 'string' ||
      !ALLOWED_RECURRENCE_PATTERNS.includes(resultingRecurrencePattern as RecurrencePattern)
    ) {
      return NextResponse.json(
        { error: 'recurrence_pattern is required and must be daily, weekly, monthly, or yearly' },
        { status: 400 }
      );
    }
  }

  if (resultingReminderMinutes !== null && resultingReminderMinutes !== undefined) {
    if (!resultingDueDate) {
      return NextResponse.json({ error: 'reminder_minutes requires due_date' }, { status: 400 });
    }
  }
  const updated = todoDB.update(Number(id), updateData);

  // When a recurring todo is marked complete, create the next instance.
  if (body.completed === true && !todo.completed && todo.is_recurring && todo.recurrence_pattern && todo.due_date) {
    const nextDueDate = calculateNextDueDate(todo.due_date, todo.recurrence_pattern);

    const nextTodo = todoDB.create({
      userId: todo.user_id,
      title: todo.title,
      dueDate: nextDueDate,
      priority: todo.priority,
      isRecurring: true,
      recurrencePattern: todo.recurrence_pattern,
      reminderMinutes: todo.reminder_minutes ?? null,
    });

    const existingTags = tagDB.findByTodoId(todo.id);
    for (const tag of existingTags) {
      tagDB.attachToTodo(nextTodo.id, tag.id);
    }
  }

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

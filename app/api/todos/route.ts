import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';
import type { RecurrencePattern, ReminderMinutes } from '@/lib/db';

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
    dueDate = body.due_date;
  }

  const isRecurring = body.is_recurring === true;
  let recurrencePattern: RecurrencePattern | null = null;
  if (isRecurring) {
    if (!dueDate) {
      return NextResponse.json({ error: 'Recurring todos require a due date' }, { status: 400 });
    }

    if (
      typeof body.recurrence_pattern !== 'string' ||
      !ALLOWED_RECURRENCE_PATTERNS.includes(body.recurrence_pattern as RecurrencePattern)
    ) {
      return NextResponse.json(
        { error: 'recurrence_pattern is required and must be daily, weekly, monthly, or yearly' },
        { status: 400 }
      );
    }

    recurrencePattern = body.recurrence_pattern as RecurrencePattern;
  }

  let reminderMinutes: ReminderMinutes | null = null;
  if (body.reminder_minutes !== undefined && body.reminder_minutes !== null) {
    const reminder = Number(body.reminder_minutes);
    if (!ALLOWED_REMINDER_MINUTES.includes(reminder as ReminderMinutes)) {
      return NextResponse.json(
        { error: 'Invalid reminder_minutes. Allowed values: 15, 30, 60, 120, 1440, 2880, 10080' },
        { status: 400 }
      );
    }

    if (!dueDate) {
      return NextResponse.json({ error: 'reminder_minutes requires due_date' }, { status: 400 });
    }

    reminderMinutes = reminder as ReminderMinutes;
  }

  const todo = todoDB.create({
    userId: session.userId,
    title,
    dueDate,
    priority,
    isRecurring,
    recurrencePattern,
    reminderMinutes,
  });

  return NextResponse.json(todo, { status: 201 });
}

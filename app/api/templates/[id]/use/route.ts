import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { templateDB, todoDB, subtaskDB } from '@/lib/db';
import { getSingaporeNow, toSingaporeISOString } from '@/lib/timezone';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const template = templateDB.findById(Number(id));
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (template.user_id !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const dueDate =
    template.due_date_offset_minutes != null
      ? toSingaporeISOString(
          new Date(getSingaporeNow().getTime() + template.due_date_offset_minutes * 60 * 1000)
        )
      : null;

  const todo = todoDB.create({
    userId: session.userId,
    title: template.title_template,
    dueDate,
    priority: template.priority,
    isRecurring: template.is_recurring,
    recurrencePattern: template.recurrence_pattern,
    reminderMinutes: template.reminder_minutes,
  });

  if (template.subtasks_json) {
    const subtaskDefs: { title: string; position: number }[] = JSON.parse(template.subtasks_json);
    for (const def of subtaskDefs) {
      subtaskDB.create({ todoId: todo.id, title: def.title, position: def.position });
    }
  }

  return NextResponse.json(todo, { status: 201 });
}

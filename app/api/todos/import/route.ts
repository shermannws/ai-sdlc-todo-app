import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import db, { todoDB, subtaskDB, tagDB } from '@/lib/db';

// ─── Validation schemas ───────────────────────────────────────────────────────

const ImportSubtaskSchema = z.object({
  title: z.string().min(1),
  completed: z.boolean(),
  position: z.number().int().min(0),
});

const ImportTagSchema = z.object({
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

const ImportTodoSchema = z.object({
  title: z.string().min(1),
  completed: z.boolean(),
  due_date: z.string().nullable(),
  priority: z.enum(['high', 'medium', 'low']),
  is_recurring: z.boolean(),
  recurrence_pattern: z.enum(['daily', 'weekly', 'monthly', 'yearly']).nullable(),
  reminder_minutes: z.number().nullable(),
  subtasks: z.array(ImportSubtaskSchema),
  tags: z.array(ImportTagSchema),
});

const ImportEnvelopeSchema = z.object({
  version: z.literal(1),
  todos: z.array(ImportTodoSchema),
});

type ImportTodo = z.infer<typeof ImportTodoSchema>;

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = ImportEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid import format', details: parsed.error.format() },
      { status: 400 }
    );
  }

  const { todos } = parsed.data;
  const userId = session.userId;

  const runImport = db.transaction((todosData: ImportTodo[]) => {
    for (const todoData of todosData) {
      const todo = todoDB.create({
        userId,
        title: todoData.title,
        dueDate: todoData.due_date,
        priority: todoData.priority,
        isRecurring: todoData.is_recurring,
        recurrencePattern: todoData.recurrence_pattern,
        reminderMinutes: todoData.reminder_minutes,
      });

      if (todoData.completed) {
        todoDB.update(todo.id, { completed: true });
      }

      for (const sub of todoData.subtasks) {
        const createdSub = subtaskDB.create({
          todoId: todo.id,
          title: sub.title,
          position: sub.position,
        });
        if (sub.completed) {
          subtaskDB.update(createdSub.id, { completed: true });
        }
      }

      // Resolve tags: case-insensitive match, reuse existing or create new
      const existingTags = tagDB.findByUserId(userId);
      for (const tagData of todoData.tags) {
        const match = existingTags.find(
          (t) => t.name.toLowerCase() === tagData.name.toLowerCase()
        );
        const tag = match ?? tagDB.create({ userId, name: tagData.name, color: tagData.color });
        tagDB.attachToTodo(todo.id, tag.id);
      }
    }
    return todosData.length;
  });

  const imported = runImport(todos);
  return NextResponse.json({ imported });
}

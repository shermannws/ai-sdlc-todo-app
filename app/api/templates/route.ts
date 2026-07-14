import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { templateDB } from '@/lib/db';

const CreateTemplateSchema = z.object({
  name: z.string().min(1).trim(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  title_template: z.string().min(1).trim(),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  is_recurring: z.boolean().default(false),
  recurrence_pattern: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional().nullable(),
  reminder_minutes: z.number().int().optional().nullable(),
  due_date_offset_minutes: z.number().int().optional().nullable(),
  subtasks: z
    .array(z.object({ title: z.string().min(1).trim() }))
    .optional()
    .default([]),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const templates = templateDB.findByUserId(session.userId);
  return NextResponse.json(templates);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const data = parsed.data;

  if (data.is_recurring && !data.recurrence_pattern) {
    return NextResponse.json(
      { error: 'recurrence_pattern is required when is_recurring is true' },
      { status: 400 }
    );
  }

  const subtasks_json =
    data.subtasks && data.subtasks.length > 0
      ? JSON.stringify(data.subtasks.map((s, i) => ({ title: s.title, position: i })))
      : null;

  const template = templateDB.create({
    user_id: session.userId,
    name: data.name,
    description: data.description ?? null,
    category: data.category ?? null,
    title_template: data.title_template,
    priority: data.priority,
    is_recurring: data.is_recurring,
    recurrence_pattern: data.recurrence_pattern ?? null,
    reminder_minutes: data.reminder_minutes ?? null,
    due_date_offset_minutes: data.due_date_offset_minutes ?? null,
    subtasks_json,
  });

  return NextResponse.json(template, { status: 201 });
}

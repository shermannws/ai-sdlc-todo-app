import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { templateDB } from '@/lib/db';

const UpdateTemplateSchema = z.object({
  name: z.string().min(1).trim().optional(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  title_template: z.string().min(1).trim().optional(),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  is_recurring: z.boolean().optional(),
  recurrence_pattern: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional().nullable(),
  reminder_minutes: z.number().int().optional().nullable(),
  due_date_offset_minutes: z.number().int().optional().nullable(),
  subtasks: z.array(z.object({ title: z.string().min(1).trim() })).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const template = templateDB.findById(Number(id));
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (template.user_id !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json(template);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const template = templateDB.findById(Number(id));
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (template.user_id !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = UpdateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const data = parsed.data;

  const effectiveRecurring = data.is_recurring ?? template.is_recurring;
  const effectivePattern = data.recurrence_pattern !== undefined ? data.recurrence_pattern : template.recurrence_pattern;
  if (effectiveRecurring && !effectivePattern) {
    return NextResponse.json(
      { error: 'recurrence_pattern is required when is_recurring is true' },
      { status: 400 }
    );
  }

  const updateData: Parameters<typeof templateDB.update>[1] = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.title_template !== undefined) updateData.title_template = data.title_template;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.is_recurring !== undefined) updateData.is_recurring = data.is_recurring;
  if (data.recurrence_pattern !== undefined) updateData.recurrence_pattern = data.recurrence_pattern;
  if (data.reminder_minutes !== undefined) updateData.reminder_minutes = data.reminder_minutes;
  if (data.due_date_offset_minutes !== undefined) updateData.due_date_offset_minutes = data.due_date_offset_minutes;

  if (data.subtasks !== undefined) {
    updateData.subtasks_json =
      data.subtasks.length > 0
        ? JSON.stringify(data.subtasks.map((s, i) => ({ title: s.title, position: i })))
        : null;
  }

  const updated = templateDB.update(Number(id), updateData);
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const template = templateDB.findById(Number(id));
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (template.user_id !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  templateDB.delete(Number(id));
  return new NextResponse(null, { status: 204 });
}

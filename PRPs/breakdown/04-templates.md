# 04 — Template System

**Parallel feature branch. Start only after `develop` (00-prerequisite) is merged.**

The template system allows users to save todo patterns (title, priority, recurrence, reminder, subtasks) and quickly instantiate them as new todos.

> **Independence note:** This branch can be developed in parallel with `feature/subtasks` and `feature/tags`. The `templates` table and all its DB interfaces (`templateDB`) are provided by the prerequisite. The `/use` endpoint creates subtask rows directly via `subtaskDB.create()` — this works independently of any UI work in `feature/subtasks`. Tags are intentionally **excluded** from templates (by design — see spec below).

---

## Branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/templates
```

---

## Deliverables Checklist

- [ ] `GET /api/templates`, `POST /api/templates` — list and create templates
- [ ] `GET /api/templates/[id]`, `PUT /api/templates/[id]`, `DELETE /api/templates/[id]`
- [ ] `POST /api/templates/[id]/use` — instantiate template as a new todo
- [ ] `app/page.tsx` additions (see Owned Page.tsx Sections)
- [ ] `tests/09-templates.spec.ts`

---

## Owned `app/page.tsx` Sections

Replace the stub:

```
// ===== FEATURE: templates — insert Templates section here =====
```

### Templates Section

Add a "Templates" panel (collapsible or sidebar section) to the page:

- "New Template" button → opens Create Template modal
- List of existing templates: name, category (if set), description (if set), "Use" button, edit (pencil) and delete (trash) buttons

### Create / Edit Template Modal

Fields:
| Field | Input Type | Notes |
|-------|-----------|-------|
| Template name | text | Required |
| Category | text | Optional, for grouping |
| Description | textarea | Optional |
| Todo title template | text | Required — this becomes the todo title on use |
| Priority | select | `high / medium / low`, default `medium` |
| Recurring | checkbox | Toggle |
| Recurrence pattern | select | `daily / weekly / monthly / yearly` (shown when recurring checked) |
| Reminder | select | `none / 15m / 30m / 1h / 2h / 1d / 2d / 1w` |
| Due date offset | number input | Minutes from "use" time; blank = no due date on created todo |
| Subtasks | repeatable text inputs | Add/remove rows; each row = one subtask title |

**Subtasks ARE captured** — title and position (order in the list). Tags are NOT included in templates.

### "Use Template" Button

Calls `POST /api/templates/[id]/use`. On success, refresh the todo list.

### State

```typescript
const [templates, setTemplates] = useState<Template[]>([]);
const [showTemplates, setShowTemplates] = useState(false);
const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
```

Fetch templates on mount: `GET /api/templates`.

---

## API Routes

### `GET /api/templates`

File: `app/api/templates/route.ts`

```typescript
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const templates = templateDB.findByUserId(session.userId);
  return NextResponse.json(templates);
}
```

### `POST /api/templates`

Same file. Validate with zod:

```typescript
import { z } from 'zod';

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
  subtasks: z.array(z.object({ title: z.string().min(1).trim() })).optional().default([]),
});
```

Serialize `subtasks` array to JSON string before storing:

```typescript
const subtasks_json = body.subtasks && body.subtasks.length > 0
  ? JSON.stringify(body.subtasks.map((s, i) => ({ title: s.title, position: i })))
  : null;

const template = templateDB.create({
  userId: session.userId,
  name: body.name,
  // ... other fields
  subtasks_json,
});
```

Validate consistency: if `is_recurring: true`, `recurrence_pattern` must be set.

### `GET /api/templates/[id]`

Ownership check. Return template.

### `PUT /api/templates/[id]`

Ownership check. Accepts same partial body as POST (all fields optional). Re-serialize `subtasks` array if provided.

### `DELETE /api/templates/[id]`

Ownership check. `templateDB.delete(id)`. Returns 204.

**Deleting a template never affects todos already created from it** — there is no FK from todos to templates.

### `POST /api/templates/[id]/use`

File: `app/api/templates/[id]/use/route.ts`

```typescript
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const template = templateDB.findById(Number(id));
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (template.user_id !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Calculate due date from offset
  const dueDate = template.due_date_offset_minutes != null
    ? toSingaporeISOString(new Date(getSingaporeNow().getTime() + template.due_date_offset_minutes * 60 * 1000))
    : null;

  // Create the todo
  const todo = todoDB.create({
    userId: session.userId,
    title: template.title_template,
    dueDate,
    priority: template.priority,
    isRecurring: template.is_recurring,
    recurrencePattern: template.recurrence_pattern,
    reminderMinutes: template.reminder_minutes,
  });

  // Create subtasks from template
  if (template.subtasks_json) {
    const subtaskDefs: { title: string; position: number }[] = JSON.parse(template.subtasks_json);
    for (const def of subtaskDefs) {
      subtaskDB.create({ todoId: todo.id, title: def.title, position: def.position });
    }
  }

  return NextResponse.json(todo, { status: 201 });
}
```

**Note:** `subtaskDB.create` is available from the prerequisite's `lib/db.ts` — no dependency on `feature/subtasks` branch.

---

## Validation Rules

| Field | Rule |
|-------|------|
| `name` | Required, trimmed, non-empty |
| `title_template` | Required, trimmed, non-empty |
| `priority` | Must be `high / medium / low` |
| `is_recurring: true` | `recurrence_pattern` must be set |
| `reminder_minutes` | Must be in `{15, 30, 60, 120, 1440, 2880, 10080}` if provided |
| `subtasks[].title` | Required, trimmed, non-empty |

---

## Subtasks JSON Format

The `subtasks_json` column stores a JSON array:

```json
[
  { "title": "Step 1", "position": 0 },
  { "title": "Step 2", "position": 1 }
]
```

Always parse with `JSON.parse()` and handle null safely. On create/edit, always re-serialize the full array — do not do partial updates to the JSON string.

---

## Tests

### `tests/09-templates.spec.ts`

```
- Create template → appears in templates list
- Template with subtasks → subtask titles stored and visible in edit modal
- Use template → new todo created with correct title, priority, recurrence
- Use template with due date offset → todo has correct due date (approx offset from now)
- Use template with subtasks → todo has subtasks created
- Use template with null offset → todo has no due date
- Edit template → changes reflected on next use (not on previously-created todos)
- Delete template → removed from list; previously-created todos unaffected
- Create template requiring recurrence_pattern when is_recurring=true → validation error if missing
```

---

## Model Routing

| Task | Model |
|------|-------|
| All CRUD routes (excl. `/use`) | auto |
| `/use` endpoint (subtask insertion, offset date) | auto |
| Template create/edit modal UI | auto |
| Test file | auto |

---

## Definition of Done

- [ ] All 6 API routes implemented with ownership checks
- [ ] `subtasks_json` correctly serialized/deserialized
- [ ] `/use` creates subtask rows with correct positions
- [ ] `/use` calculates due date from offset correctly (Singapore time)
- [ ] Deleting a template does not affect existing todos
- [ ] Tests pass: `tests/09-templates.spec.ts`
- [ ] No `console.log` in any committed file
- [ ] `npm run build` passes on this branch

---

## Merge Notes (for 00-post.md)

**Files modified:**
- `app/api/templates/route.ts` (new file — no conflict)
- `app/api/templates/[id]/route.ts` (new file — no conflict)
- `app/api/templates/[id]/use/route.ts` (new file — no conflict)
- `app/page.tsx` (additive to stub section — potential conflict at merge time)
- `tests/09-templates.spec.ts` (new file — no conflict)

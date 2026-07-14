# 02 — Subtasks & Progress

**Parallel feature branch. Start only after `develop` (00-prerequisite) is merged.**

---

## Branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/subtasks
```

---

## Deliverables Checklist

- [ ] `POST /api/todos/[id]/subtasks` — create subtask
- [ ] `PUT /api/subtasks/[id]` — update subtask
- [ ] `DELETE /api/subtasks/[id]` — delete subtask
- [ ] `app/page.tsx` additions (see Owned Page.tsx Sections)
- [ ] `tests/07-subtasks.spec.ts`

---

## Owned `app/page.tsx` Sections

Replace the stub:

```
// ===== FEATURE: subtasks — insert subtask section per todo item here =====
```

Add the following **inside each todo item card**:

### Progress Bar

Show only when `todo.subtasks && todo.subtasks.length > 0`.

```
Completed: X/Y subtasks
[■■■■□□□□] (progress bar)
```

- Bar color: blue (`#3B82F6`) when progress < 100%
- Bar color: green (`#22C55E`) **at exactly 100%**
- Text: `"X/Y subtasks"` where X = completed count, Y = total count
- Do **not** render progress bar or text at all when `subtasks.length === 0`

### Subtask List

- Collapsible (expand/collapse toggle per todo item)
- Each subtask row: checkbox (toggle complete) + title + delete button
- Add subtask input at the bottom of the expanded list:
  - Text field + "Add" button
  - Pressing Enter in the text field also submits
  - Appends at `max(position) + 1`

### State

Add to the page component:
```typescript
const [expandedTodos, setExpandedTodos] = useState<Set<number>>(new Set());
```

Toggle with `expandedTodos.has(todoId)`.

---

## API Routes

### `POST /api/todos/[id]/subtasks`

File: `app/api/todos/[id]/subtasks/route.ts`

```typescript
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  const todo = todoDB.findById(Number(id));
  if (!todo) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (todo.user_id !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });

  const existingSubtasks = subtaskDB.findByTodoId(Number(id));
  const nextPosition = existingSubtasks.length > 0
    ? Math.max(...existingSubtasks.map(s => s.position)) + 1
    : 0;

  const subtask = subtaskDB.create({ todoId: Number(id), title, position: nextPosition });
  return NextResponse.json(subtask, { status: 201 });
}
```

### `PUT /api/subtasks/[id]`

File: `app/api/subtasks/[id]/route.ts`

Ownership check via `subtaskDB.findById(id)` → `todoDB.findById(subtask.todo_id)` → verify `todo.user_id === session.userId`.

Accepts partial body:
- `title`: string, trim, non-empty
- `completed`: boolean

Returns updated subtask.

### `DELETE /api/subtasks/[id]`

Same ownership check. `subtaskDB.delete(id)`. Returns 204.

**Positions are NOT renumbered after delete** — gaps are intentional.

---

## `todoDB.findByUserId` / `findById` — Subtask JOIN

The prerequisite's `todoDB.findByUserId` and `todoDB.findById` must populate `todo.subtasks`. Verify this is the case on `develop`. If not, update those methods in `lib/db.ts`:

```typescript
// In todoDB.findByUserId, after fetching todos:
const todosWithSubtasks = todos.map(todo => ({
  ...todo,
  subtasks: subtaskDB.findByTodoId(todo.id),
  tags: tagDB.findByTodoId(todo.id),
}));
```

This is an additive change to `lib/db.ts` — no schema changes needed.

---

## Validation Rules

| Field | Rule |
|-------|------|
| `title` | Required, non-empty after trim |
| `completed` | Boolean; coerce `0/1` from SQLite to boolean in the DB layer |
| `position` | Set by server (max+1), not accepted from client |

---

## Tests

### `tests/07-subtasks.spec.ts`

```
- Add subtask to a todo → appears in expanded subtask list
- Check subtask → marked complete; progress bar updates
- All subtasks checked → progress bar turns green
- Delete subtask → removed from list
- Progress bar hidden when no subtasks
- Progress text shows "X/Y subtasks"
- Add subtask via Enter key (keyboard submit)
- Subtask positions not renumbered after delete
```

---

## Model Routing

| Task | Model |
|------|-------|
| All API routes | auto |
| Progress bar UI | auto |
| Test file | auto |

---

## Definition of Done

- [ ] All 3 API routes implemented with ownership checks
- [ ] Progress bar shows correct color (blue / green at 100%)
- [ ] Progress text hidden when `subtasks.length === 0`
- [ ] Add subtask via button and via Enter key
- [ ] Delete does not renumber positions
- [ ] `todoDB.findByUserId` populates `subtasks` array
- [ ] Tests pass: `tests/07-subtasks.spec.ts`
- [ ] No `console.log` in any committed file
- [ ] `npm run build` passes on this branch

---

## Merge Notes (for 00-post.md)

**Files modified:**
- `app/api/todos/[id]/subtasks/route.ts` (new file — no conflict)
- `app/api/subtasks/[id]/route.ts` (new file — no conflict)
- `lib/db.ts` (additive — subtask JOIN in `todoDB.findByUserId`; may conflict with `feature/tags` which does the same for tags JOIN — see post-merge resolution)
- `app/page.tsx` (additive to stub section — potential conflict at merge time)
- `tests/07-subtasks.spec.ts` (new file — no conflict)

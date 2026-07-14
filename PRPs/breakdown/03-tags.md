# 03 — Tag System

**Parallel feature branch. Start only after `develop` (00-prerequisite) is merged.**

---

## Branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/tags
```

---

## Deliverables Checklist

- [ ] `GET /api/tags`, `POST /api/tags` — list and create tags
- [ ] `PUT /api/tags/[id]`, `DELETE /api/tags/[id]` — update and delete tags
- [ ] `POST /api/todos/[id]/tags`, `DELETE /api/todos/[id]/tags` — attach/detach tags to todos
- [ ] `app/page.tsx` additions (see Owned Page.tsx Sections)
- [ ] `tests/08-tags.spec.ts`

---

## Branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/tags
```

---

## Owned `app/page.tsx` Sections

Replace the stub:

```
// ===== FEATURE: tags — insert tag chips + Manage Tags modal here =====
```

### Tag Chips on Todo Items

Render after the title in each todo item card:

```tsx
{todo.tags && todo.tags.map(tag => (
  <span
    key={tag.id}
    style={{ backgroundColor: tag.color }}
    className="px-2 py-0.5 rounded-full text-xs text-white"
  >
    {tag.name}
  </span>
))}
```

### Attach Tag to Todo

In the edit/expand view of a todo, add:
- Dropdown showing available user tags (from `GET /api/tags`)
- "Attach" button → calls `POST /api/todos/[id]/tags`
- Each attached tag has an ✕ button → calls `DELETE /api/todos/[id]/tags`

### Manage Tags Modal

Triggered by a "Manage Tags" button in the page header area.

Modal contents:
- List of all user tags with color swatch, name, edit (pencil) and delete (trash) buttons
- "Add Tag" form: name input + color picker (HTML `<input type="color">`) + "Create" button
- Edit mode (inline): edits name/color inline, save/cancel buttons
- Deleting a tag: removes from all todos automatically (via FK cascade in `todo_tags`)

**Important:** edits to a tag propagate live everywhere — there are no denormalized copies of tag name/color; all rendering reads from the `Todo.tags[]` objects which are re-fetched.

### State

```typescript
const [tags, setTags] = useState<Tag[]>([]);
const [showManageTags, setShowManageTags] = useState(false);
```

Fetch tags on mount: `GET /api/tags`.

---

## API Routes

### `GET /api/tags`

File: `app/api/tags/route.ts`

```typescript
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const tags = tagDB.findByUserId(session.userId);
  return NextResponse.json(tags);
}
```

### `POST /api/tags`

Same file. Validate:
- `name`: required, trim, non-empty
- `color`: optional, default `'#3B82F6'`, must be a valid hex color string if provided

`UNIQUE(user_id, name)` constraint — handle DB unique violation and return 409 with message `"Tag name already exists"`.

### `PUT /api/tags/[id]`

File: `app/api/tags/[id]/route.ts`

Ownership check via `tagDB.findById(id)` → verify `tag.user_id === session.userId`.

Accepts `{ name?, color? }`. Apply changes via `tagDB.update()`.

Name uniqueness: handle unique constraint violation → 409.

### `DELETE /api/tags/[id]`

Same file. Ownership check. `tagDB.delete(id)`. The `todo_tags` FK cascade removes all associations.

Returns 204.

### `POST /api/todos/[id]/tags`

File: `app/api/todos/[id]/tags/route.ts`

```typescript
const { tagId } = await request.json();
// Verify todo ownership + tag ownership (both must belong to session.userId)
tagDB.attachToTodo(todoId, tagId); // idempotent — no-op if already attached
```

### `DELETE /api/todos/[id]/tags`

Same file. Parse `tagId` from request body.

```typescript
tagDB.detachFromTodo(todoId, tagId); // idempotent — no-op if not attached
```

Return 200 `{ success: true }`.

---

## `tagDB` Idempotency Implementation

`attachToTodo` must use `INSERT OR IGNORE INTO todo_tags` so calling it twice is safe:

```sql
INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?);
```

`detachFromTodo` uses `DELETE WHERE` which is always safe to call even if the row doesn't exist.

---

## `todoDB` Tag JOIN

Verify that `todoDB.findByUserId` and `todoDB.findById` populate `todo.tags`. If not, update in `lib/db.ts`:

```typescript
tags: tagDB.findByTodoId(todo.id),
```

This is the same additive change as `feature/subtasks` — see Merge Notes.

---

## Validation Rules

| Field | Rule |
|-------|------|
| Tag `name` | Required, trimmed, non-empty, max 50 chars |
| Tag `color` | Optional, default `#3B82F6`; if provided must match `^#[0-9A-Fa-f]{6}$` |
| Attach tag | Both `todo_id` and `tag_id` must be owned by `session.userId` |

---

## Tests

### `tests/08-tags.spec.ts`

```
- Create tag via Manage Tags modal → tag appears in list
- Edit tag name → updated everywhere (on existing todos)
- Edit tag color → updated everywhere
- Delete tag → removed from all todos
- Attach tag to todo → tag chip appears on todo
- Detach tag from todo → chip removed
- Attach same tag twice → no error (idempotent)
- Detach tag not attached → no error (idempotent)
- Duplicate tag name → error message shown
```

---

## Model Routing

| Task | Model |
|------|-------|
| All API routes | auto |
| Manage Tags modal UI | auto |
| Tag chips on todo items | auto |
| Test file | auto |

---

## Implementation

### Setup

Create your feature branch and install dependencies:

```bash
git checkout develop
git pull origin develop
git checkout -b feature/tags
npm i  # Already installed on develop, but run to be safe
```

Start the dev server:

```bash
npm run dev
```

Run tests while developing:

```bash
npx playwright test --ui
```

### Verification

Before committing, verify everything passes:

```bash
npm run build
npm run lint
npx playwright test
```

---

## Definition of Done

- [ ] All 6 API routes implemented with ownership checks
- [ ] Attach/detach are idempotent (no 4xx on double call)
- [ ] Tag edit propagates live to all todo items (re-fetch after edit)
- [ ] Unique name constraint enforced (409 response)
- [ ] Color defaults to `#3B82F6` when not provided
- [ ] `todoDB.findByUserId` populates `tags` array
- [ ] Tests pass: `tests/08-tags.spec.ts`
- [ ] No `console.log` in any committed file
- [ ] `npm run build` passes on this branch

---

## Merge Notes (for 00-post.md)

**Files modified:**
- `app/api/tags/route.ts` (new file — no conflict)
- `app/api/tags/[id]/route.ts` (new file — no conflict)
- `app/api/todos/[id]/tags/route.ts` (new file — no conflict)
- `lib/db.ts` (additive — tag JOIN in `todoDB.findByUserId`; conflicts with `feature/subtasks` which does same for subtasks — see post-merge resolution)
- `app/page.tsx` (additive to stub section — potential conflict at merge time)
- `tests/08-tags.spec.ts` (new file — no conflict)

---

## Git Commit & Push

Once the Definition of Done checklist above is fully satisfied:

```bash
# Stage all changes
git add .

# Commit with conventional commit format
git commit -m "feat: tag system with attach/detach and manage tags modal"

# Push and set upstream (first push of this feature branch)
git push -u origin feature/tags
```

If you made incremental commits during development, push with the same command — `-u` only needs to be used once but is safe to repeat.

# 05 — Search & Filtering

**Parallel feature branch. Start only after `develop` (00-prerequisite) is merged.**

This feature is **entirely client-side** — no new API routes. It operates over the `Todo[]` state already fetched from `GET /api/todos`. It is the most independent of all 6 feature branches and can be developed in isolation without touching any API files.

---

## Branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/search-filtering
```

---

## Deliverables Checklist

- [ ] `FilterState` interface and `applyFilters()` function (pure, no side effects)
- [ ] `useDebounce` hook (or inline debounce)
- [ ] Filter panel UI in `app/page.tsx`
- [ ] Search input with 300ms debounce
- [ ] Filter presets saved to `localStorage`
- [ ] `tests/10-search-filtering.spec.ts`

---

## Owned `app/page.tsx` Sections

Replace the stub:

```
// ===== FEATURE: search-filtering — insert search/filter panel here =====
```

Add a filter panel **above** the three-section todo list. It should be collapsible (show/hide toggle).

### Filter Panel Layout

```
[Search: ________________________________] [Clear]

Priority: [All ▼]   Tag: [All ▼]   Status: [All ▼]
Due from: [date]   Due to: [date]

[Save as preset ▼]  [Saved presets: My Filter ▼] [Delete preset]
```

---

## `FilterState` Interface

Define in `app/page.tsx` (or extract to `lib/filters.ts` if you prefer):

```typescript
export interface FilterState {
  search: string;              // free-text, empty string = no filter
  priority: Priority | '';     // '' = all
  tagId: number | null;        // null = all
  completion: 'all' | 'active' | 'completed';
  dueDateFrom: string | null;  // YYYY-MM-DD or null
  dueDateTo: string | null;    // YYYY-MM-DD or null
}

export const DEFAULT_FILTER: FilterState = {
  search: '',
  priority: '',
  tagId: null,
  completion: 'all',
  dueDateFrom: null,
  dueDateTo: null,
};
```

---

## `applyFilters(todos: Todo[], filters: FilterState): Todo[]`

**Apply in this exact AND order — do not change the order:**

1. **Search filter** (if `filters.search` is non-empty after trim):
   - Lowercase the search term
   - Match against: `todo.title.toLowerCase()` OR any `subtask.title.toLowerCase()` in `todo.subtasks`
   - Partial match (includes), case-insensitive
   
2. **Priority filter** (if `filters.priority` is non-empty):
   - Keep only todos where `todo.priority === filters.priority`

3. **Tag filter** (if `filters.tagId` is not null):
   - Keep only todos where `todo.tags?.some(t => t.id === filters.tagId)`

4. **Completion filter**:
   - `'active'`: keep `!todo.completed`
   - `'completed'`: keep `todo.completed`
   - `'all'`: keep all

5. **Date range filter**:
   - If `dueDateFrom`: keep todos where `todo.due_date >= dueDateFrom` (or `due_date` is null — null dates pass the range filter)
   - If `dueDateTo`: keep todos where `todo.due_date <= dueDateTo` (or `due_date` is null)
   - Both conditions apply simultaneously if both are set

```typescript
export function applyFilters(todos: Todo[], filters: FilterState): Todo[] {
  let result = todos;

  // 1. Search
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    result = result.filter(todo =>
      todo.title.toLowerCase().includes(q) ||
      (todo.subtasks ?? []).some(s => s.title.toLowerCase().includes(q))
    );
  }

  // 2. Priority
  if (filters.priority) {
    result = result.filter(todo => todo.priority === filters.priority);
  }

  // 3. Tag
  if (filters.tagId !== null) {
    result = result.filter(todo =>
      (todo.tags ?? []).some(t => t.id === filters.tagId)
    );
  }

  // 4. Completion
  if (filters.completion === 'active') {
    result = result.filter(todo => !todo.completed);
  } else if (filters.completion === 'completed') {
    result = result.filter(todo => todo.completed);
  }

  // 5. Date range
  if (filters.dueDateFrom) {
    result = result.filter(todo => !todo.due_date || todo.due_date >= filters.dueDateFrom!);
  }
  if (filters.dueDateTo) {
    result = result.filter(todo => !todo.due_date || todo.due_date <= filters.dueDateTo!);
  }

  return result;
}
```

---

## Debounce

Apply 300ms debounce to the search text before passing to `applyFilters`. Use a custom hook or inline `useEffect` + `setTimeout`:

```typescript
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
```

Apply to the raw search input state:

```typescript
const [searchInput, setSearchInput] = useState('');
const debouncedSearch = useDebounce(searchInput, 300);

// Use debouncedSearch in FilterState (not searchInput)
const filters: FilterState = { ...filterState, search: debouncedSearch };
const visibleTodos = applyFilters(todos, filters);
```

---

## Filter Presets (localStorage)

**Key:** `'todo-app:filter-presets'`

**Type:**

```typescript
interface FilterPreset {
  id: string;       // crypto.randomUUID() or Date.now().toString()
  name: string;
  filters: FilterState;
  createdAt: string;
}
```

**Operations:**

- **Save preset:** user types a name → save `{ id, name, filters: currentFilterState, createdAt }` to localStorage array
- **Load preset:** user selects from dropdown → set `filterState` to preset's `filters`
- **Delete preset:** remove by `id` from array

**Safety:** always wrap `localStorage` reads in try/catch — storage may be unavailable or corrupted.

```typescript
function loadPresets(): FilterPreset[] {
  try {
    const raw = localStorage.getItem('todo-app:filter-presets');
    if (!raw) return [];
    return JSON.parse(raw) as FilterPreset[];
  } catch {
    return [];
  }
}

function savePresets(presets: FilterPreset[]): void {
  try {
    localStorage.setItem('todo-app:filter-presets', JSON.stringify(presets));
  } catch {
    // Silently ignore — presets are non-critical
  }
}
```

---

## Integration with Existing Section Rendering

The `applyFilters` result replaces the `todos` array used to render sections. The section logic (Overdue/Pending/Completed) and sort comparator from the prerequisite still apply **after** filtering:

```typescript
const visibleTodos = applyFilters(todos, { ...filterState, search: debouncedSearch });

// Then split into sections using the existing comparator
const overdue = visibleTodos.filter(t => !t.completed && t.due_date && t.due_date < now);
const pending = visibleTodos.filter(t => !t.completed && (!t.due_date || t.due_date >= now));
const completed = visibleTodos.filter(t => t.completed);
```

---

## Tests

### `tests/10-search-filtering.spec.ts`

```
- Search by partial title → matching todos shown
- Search by subtask title → parent todo shown
- Search is case-insensitive
- Clearing search → all todos shown
- Filter by high priority → only high priority todos shown
- Filter by tag → only tagged todos shown (requires feature/tags to be merged, can be skipped in isolation)
- Filter active only → completed todos hidden
- Filter completed only → active todos hidden
- Date range from → todos before date hidden
- Date range to → todos after date hidden
- Combined filters → correct AND intersection
- Save preset → appears in presets dropdown
- Load preset → filters restored
- Delete preset → removed from dropdown
- Filter panel collapses and expands
```

> **Note on tags in tests:** If running this test spec before `feature/tags` is merged, skip or stub the tag filter test. Use `test.skip` with a comment.

---

## Model Routing

| Task | Model |
|------|-------|
| `applyFilters` function | auto — fully specified above |
| `useDebounce` hook | auto |
| Filter panel UI | auto |
| localStorage preset management | auto |
| Test file | auto |

---

## Definition of Done

- [ ] `applyFilters` applies in the correct AND order (search → priority → tag → completion → date range)
- [ ] Search matches subtask titles as well as todo titles
- [ ] Debounce is 300ms
- [ ] Filter presets saved/loaded/deleted from localStorage
- [ ] Null `due_date` todos pass date range filters (not excluded)
- [ ] Filter panel has a collapse toggle
- [ ] Tests pass: `tests/10-search-filtering.spec.ts`
- [ ] No `console.log` in any committed file
- [ ] `npm run build` passes on this branch

---

## Merge Notes (for 00-post.md)

**Files modified:**
- `app/page.tsx` (additive to stub section, filter state, debounce hook, and the section rendering — potential conflict at merge time; this branch touches the section rendering logic)
- `tests/10-search-filtering.spec.ts` (new file — no conflict)

**No API files modified.** This is the easiest branch to merge.

---

## Git Commit & Push

Once the Definition of Done checklist above is fully satisfied:

```bash
# Stage all changes
git add .

# Commit with conventional commit format
git commit -m "feat: client-side search and filtering with localStorage presets"

# Push and set upstream (first push of this feature branch)
git push -u origin feature/search-filtering
```

If you made incremental commits during development, push with the same command — `-u` only needs to be used once but is safe to repeat.

# 06 — Export/Import & Calendar View

**Parallel feature branch. Start only after `develop` (00-prerequisite) is merged.**

Covers two features that share no UI overlap and are both output/visualization features:
- **Export & Import** — JSON/CSV download and JSON re-import of todos
- **Calendar View** — `/calendar` page showing todos by due date with holidays

---

## Branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/export-calendar
```

---

## Deliverables Checklist

- [ ] `GET /api/todos/export?format=json|csv` — export endpoint
- [ ] `POST /api/todos/import` — import endpoint
- [ ] `GET /api/holidays` — holidays API
- [ ] `scripts/seed-holidays.ts` — Singapore public holidays seeder
- [ ] `app/calendar/page.tsx` — calendar view
- [ ] `app/page.tsx` additions (export/import buttons)
- [ ] `tests/11-export-import.spec.ts`
- [ ] `tests/12-calendar.spec.ts`

---

## Owned `app/page.tsx` Sections

Replace the stub:

```
// ===== FEATURE: export-calendar — insert export/import buttons here =====
```

Add two buttons in the page header area:
- **Export** → dropdown: "Export as JSON" / "Export as CSV" → triggers file download
- **Import** → hidden `<input type="file" accept=".json">` → triggers `POST /api/todos/import` → refresh todo list

---

## Export API

### `GET /api/todos/export?format=json|csv`

File: `app/api/todos/export/route.ts`

**Common:**
- Ownership: session check
- Filename: `todos-YYYY-MM-DD.json` or `todos-YYYY-MM-DD.csv` (Singapore date via `getSingaporeNow()`)

**JSON format:**

```typescript
interface ExportEnvelope {
  version: 1;
  exported_at: string; // ISO string, Singapore timezone
  todos: ExportedTodo[];
}

interface ExportedTodo {
  title: string;
  completed: boolean;
  due_date: string | null;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  subtasks: { title: string; completed: boolean; position: number }[];
  tags: { name: string; color: string }[];
  // NOTE: original IDs are intentionally excluded
}
```

Build by:
1. `todoDB.findByUserId(session.userId)` — returns todos with subtasks and tags already joined
2. Map each todo to `ExportedTodo`, dropping `id`, `user_id`, `last_notification_sent`, `created_at`, `updated_at`
3. Return as `application/json` with `Content-Disposition: attachment; filename="todos-YYYY-MM-DD.json"`

**CSV format (one-way, not re-importable):**

Columns: `ID,Title,Completed,Due Date,Priority,Recurring,Pattern,Reminder`

```
"1","Buy groceries","false","2025-12-01T10:00:00","high","false","","1h"
```

Rules:
- Wrap all string fields in double quotes
- Escape any double quotes within values as `""`  
- `Completed`: `"true"` or `"false"`
- `Recurring`: `"true"` or `"false"`
- `Pattern`: empty string if not recurring
- `Reminder`: human label (`15m/30m/1h/2h/1d/2d/1w`) or empty string
- Return as `text/csv` with `Content-Disposition: attachment; filename="todos-YYYY-MM-DD.csv"`

---

## Import API

### `POST /api/todos/import`

File: `app/api/todos/import/route.ts`

**Validation — use zod before writing anything:**

```typescript
import { z } from 'zod';

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
```

If validation fails, return 400 with the zod error details.

**Import logic — single transaction:**

```typescript
const importTodos = db.transaction((userId: number, todos: ImportTodoSchema[]) => {
  for (const todoData of todos) {
    // Create todo with new ID
    const todo = todoDB.create({ userId, title: todoData.title, ... });

    // Create subtasks with new IDs
    for (const sub of todoData.subtasks) {
      subtaskDB.create({ todoId: todo.id, title: sub.title, position: sub.position });
      if (sub.completed) {
        subtaskDB.update(sub.id, { completed: true }); // update the just-created one
      }
    }

    // Tag conflict resolution: case-insensitive name match
    for (const tagData of todoData.tags) {
      const existingTags = tagDB.findByUserId(userId);
      const match = existingTags.find(
        t => t.name.toLowerCase() === tagData.name.toLowerCase()
      );
      const tag = match ?? tagDB.create({ userId, name: tagData.name, color: tagData.color });
      tagDB.attachToTodo(todo.id, tag.id);
    }
  }
});
```

**Notes:**
- Re-importing the same file creates duplicate todos — this is **by design**
- Run the entire import in a single `better-sqlite3` transaction (use `db.transaction(fn)()`)
- All new IDs; no attempt to match existing todos by title

Return: `{ imported: N }` where N = number of todos created.

---

## Calendar View

### `GET /api/holidays`

File: `app/api/holidays/route.ts`

```typescript
export async function GET() {
  // No auth required — holidays are global/public
  const holidays = holidayDB.findAll();
  return NextResponse.json(holidays);
}
```

### `app/calendar/page.tsx`

`'use client'`. Route is protected by middleware (already set up in prerequisite).

**URL state:** `?month=YYYY-MM`. Parse on mount; invalid or out-of-range → fall back to current Singapore month.

```typescript
const [year, month] = parseMonthParam(searchParams.get('month')); // 0-indexed month
```

**Navigation:** Previous/Next month buttons update the URL param.

### `generateCalendarGrid(year: number, month: number): CalendarDay[][]`

`month` is 0-indexed (JavaScript Date convention).

```typescript
interface CalendarDay {
  date: string;           // YYYY-MM-DD, Singapore local
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isPast: boolean;        // date < today (Singapore)
  isWeekend: boolean;     // Saturday or Sunday
  todos: Todo[];          // todos with due_date === this date
  holiday: Holiday | null;
}
```

Grid rules:
- Always produces full rows (5 or 6 rows × 7 columns = 35 or 42 cells)
- Fill leading cells with last days of the previous month
- Fill trailing cells with first days of the next month
- `isCurrentMonth: false` for leading/trailing cells
- `isWeekend`: day-of-week index is 0 (Sun) or 6 (Sat)
- `isPast`: compare date string to today's Singapore date (string comparison works for ISO dates)

**Edge cases:**
- February in leap years (28 vs 29 days)
- Months where the 1st falls on Sunday (no leading cells needed — or always add a leading row if 1st is Monday-Saturday, starting from most-recent Sunday)
- Month where last day is Saturday (no trailing cells needed — or always complete to 6 rows)

> **Use Sonnet 4.6 for `generateCalendarGrid`** — leap years and 5-vs-6-row boundary conditions are subtle.

### Calendar Cell Rendering

Each cell in the grid shows:
- Day number (dimmed if `!isCurrentMonth`)
- Today indicator (highlighted ring/background)
- Holiday name (small text, below day number)
- Todos on that date: colored dot or title chip per todo, color from priority (`high=red, medium=amber, low=blue`)
- If more than 3 todos: show first 2 + count badge ("+ N more")
- **Click on any day** → opens a modal listing all todos for that date

### State

```typescript
const [currentYear, setCurrentYear] = useState<number>(...);
const [currentMonth, setCurrentMonth] = useState<number>(...); // 0-indexed
const [todos, setTodos] = useState<Todo[]>([]);
const [holidays, setHolidays] = useState<Holiday[]>([]);
const [selectedDay, setSelectedDay] = useState<string | null>(null); // YYYY-MM-DD
```

Fetch todos from `GET /api/todos` and holidays from `GET /api/holidays` on mount and on month change.

---

## `scripts/seed-holidays.ts`

Singapore public holidays. Use `npx tsx scripts/seed-holidays.ts` to populate.

Seed at minimum the current year + next year. Example entries:

```typescript
const holidays = [
  { date: '2025-01-01', name: "New Year's Day" },
  { date: '2025-01-29', name: 'Chinese New Year' },
  { date: '2025-01-30', name: 'Chinese New Year (Day 2)' },
  { date: '2025-04-18', name: 'Good Friday' },
  { date: '2025-05-01', name: 'Labour Day' },
  { date: '2025-05-12', name: 'Vesak Day' },
  { date: '2025-06-07', name: 'Hari Raya Haji' },
  { date: '2025-08-09', name: 'National Day' },
  { date: '2025-10-20', name: 'Deepavali' },
  { date: '2025-12-25', name: 'Christmas Day' },
  // 2026 dates
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-02-17', name: 'Chinese New Year' },
  { date: '2026-02-18', name: 'Chinese New Year (Day 2)' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-05-01', name: 'Labour Day' },
  { date: '2026-05-31', name: 'Vesak Day' },
  { date: '2026-05-27', name: 'Hari Raya Haji' },
  { date: '2026-08-09', name: 'National Day' },
  { date: '2026-11-08', name: 'Deepavali' },
  { date: '2026-12-25', name: 'Christmas Day' },
];

for (const h of holidays) {
  holidayDB.upsert(h.date, h.name);
}
```

---

## Model Routing

| Task | Model |
|------|-------|
| `generateCalendarGrid` | **Sonnet 4.6** — leap years, 5-vs-6-row boundary |
| Export/Import transaction + ID remap + tag conflict resolution | **Sonnet 4.6** — data-integrity critical |
| CSV formatting | auto |
| Holiday seed script | auto |
| Calendar cell rendering UI | auto |
| Test files | auto |

---

## Tests

### `tests/11-export-import.spec.ts`

```
- Export JSON → file download with correct filename
- Export JSON structure has version:1, exported_at, todos array
- Exported todo includes subtasks and tags
- Exported todo does NOT include id or user_id fields
- Export CSV → file download with correct headers
- Import JSON → todos appear in list
- Import creates subtasks from exported subtasks
- Import reuses existing tag by case-insensitive name match
- Import creates new tag if no name match
- Re-import same file → duplicates todos (by design)
- Import invalid JSON structure → 400 error, no partial write
```

### `tests/12-calendar.spec.ts`

```
- Calendar loads for current month
- Navigate to next month → URL param changes
- Navigate to previous month → URL param changes
- Invalid ?month= param → falls back to current month
- Todo with due date shows on correct cell
- High priority todo shows red indicator
- Holiday name appears on correct cell
- Click cell with todos → modal shows todo list
- Cell with > 3 todos shows count badge
- Today's cell is highlighted
- Weekend cells visually distinct
```

---

## Implementation

### Setup

Create your feature branch and install dependencies:

```bash
git checkout develop
git pull origin develop
git checkout -b feature/export-calendar
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

- [ ] `GET /api/todos/export?format=json` returns correct envelope structure
- [ ] `GET /api/todos/export?format=csv` returns properly escaped CSV
- [ ] `POST /api/todos/import` validates with zod before any DB write
- [ ] Import runs in a single transaction (all-or-nothing)
- [ ] Tag conflict resolution: case-insensitive reuse, else create
- [ ] `generateCalendarGrid` handles all month boundaries and leap years
- [ ] Calendar shows correct todos on correct cells
- [ ] Holiday names shown on holiday cells
- [ ] URL state `?month=YYYY-MM` works with back/forward navigation
- [ ] Tests pass: `tests/11-export-import.spec.ts` and `tests/12-calendar.spec.ts`
- [ ] No `console.log` in any committed file
- [ ] `npm run build` passes on this branch

---

## Merge Notes (for 00-post.md)

**Files modified:**
- `app/api/todos/export/route.ts` (new file — no conflict; note: check no collision with `app/api/todos/[id]/route.ts` directory)
- `app/api/todos/import/route.ts` (new file — no conflict)
- `app/api/holidays/route.ts` (new file — no conflict)
- `app/calendar/page.tsx` (new file — no conflict)
- `scripts/seed-holidays.ts` (new file — no conflict)
- `app/page.tsx` (additive to stub section — potential conflict at merge time)
- `tests/11-export-import.spec.ts` (new file — no conflict)
- `tests/12-calendar.spec.ts` (new file — no conflict)

---

## Git Commit & Push

Once the Definition of Done checklist above is fully satisfied:

```bash
# Stage all changes
git add .

# Commit with conventional commit format
git commit -m "feat: export/import and calendar view with holidays"

# Push and set upstream (first push of this feature branch)
git push -u origin feature/export-calendar
```

If you made incremental commits during development, push with the same command — `-u` only needs to be used once but is safe to repeat.

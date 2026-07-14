# 01 — Recurring Todos & Reminders/Notifications

**Parallel feature branch. Start only after `develop` (00-prerequisite) is merged.**

Covers two tightly-coupled features that both extend the `todos` table with already-present columns:
- **Recurring Todos** (`is_recurring`, `recurrence_pattern`)
- **Reminders & Notifications** (`reminder_minutes`, `last_notification_sent`)

---

## Branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/recurring-reminders
```

---

## Deliverables Checklist

- [ ] `calculateNextDueDate()` utility in `lib/timezone.ts`
- [ ] `PUT /api/todos/[id]` — recurring completion hook (replaces the `// TODO` stub)
- [ ] `GET /api/notifications/check` — new route
- [ ] `lib/hooks/useNotifications.ts` — polling hook
- [ ] `app/page.tsx` additions (see Owned Page.tsx Sections)
- [ ] `tests/05-recurring-todos.spec.ts`
- [ ] `tests/06-reminders.spec.ts`

---

## Owned `app/page.tsx` Sections

Replace the two stubs in `app/page.tsx`:

```
// ===== FEATURE: recurring-reminders — insert recurrence/reminder form fields here =====
```

Add the following to the create/edit todo form:
- Recurrence toggle checkbox: "Repeat"
  - When checked, show `recurrence_pattern` dropdown: `daily | weekly | monthly | yearly`
  - Recurring todos **require** `due_date` — disable/warn if due_date is absent
- Reminder dropdown: `none | 15m | 30m | 1h | 2h | 1d | 2d | 1w`
  - Disabled (greyed out) when no `due_date` is set

**Per todo item** — add two badges after the priority badge:
- Recurrence badge: `🔄 {pattern}` in purple (`#A855F7` light / `#C084FC` dark)
- Reminder badge: `🔔 {label}` where label maps `15→15m, 30→30m, 60→1h, 120→2h, 1440→1d, 2880→2d, 10080→1w`

**Notification hook invocation** — add near the top of the component (after auth check):

```typescript
useNotifications(); // imported from '@/lib/hooks/useNotifications'
```

---

## `calculateNextDueDate(currentDueDate: string, pattern: RecurrencePattern): string`

Add to `lib/timezone.ts`. Returns a Singapore-local ISO string.

| Pattern | Rule |
|---------|------|
| `daily` | +1 day |
| `weekly` | +7 days |
| `monthly` | Same calendar day next month; if that day doesn't exist, clamp to last day of next month (e.g. Jan 31 → Feb 28/29) |
| `yearly` | Same calendar day next year; if Feb 29 and target year is not a leap year, use Feb 28 |

**Edge cases to handle explicitly:**
- Jan 31 → Feb 28 or 29 (leap year check)
- Mar 31 → Apr 30
- Oct 31 → Nov 30
- Dec 31 → Jan 31 of next year (wraps year correctly)
- Feb 29 (leap) → Feb 28 on non-leap year

Use Singapore local time throughout — parse `currentDueDate` in `Asia/Singapore`, compute the next date in local time, return in Singapore local ISO format.

---

## `PUT /api/todos/[id]` — Recurring Completion Hook

Locate the `// TODO: recurring completion hook` comment in `app/api/todos/[id]/route.ts` and replace it with:

```typescript
// When a recurring todo is marked complete, create the next instance
if (body.completed === true && todo.is_recurring && todo.recurrence_pattern && todo.due_date) {
  const nextDueDate = calculateNextDueDate(todo.due_date, todo.recurrence_pattern);

  // Create new todo with same attributes
  const nextTodo = todoDB.create({
    userId: todo.user_id,
    title: todo.title,
    dueDate: nextDueDate,
    priority: todo.priority,
    isRecurring: true,
    recurrencePattern: todo.recurrence_pattern,
    reminderMinutes: todo.reminder_minutes ?? null,
  });

  // Re-attach all tags from the completed todo to the new one
  const existingTags = tagDB.findByTodoId(todo.id);
  for (const tag of existingTags) {
    tagDB.attachToTodo(nextTodo.id, tag.id);
  }
}
```

This runs **after** the regular `todoDB.update(id, { completed: true })` call.

Import `tagDB` and `calculateNextDueDate` at the top of the route file.

---

## `GET /api/notifications/check`

File: `app/api/notifications/check/route.ts`

```typescript
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const now = getSingaporeNow();
  const todos = todoDB.findByUserId(session.userId);

  const due = todos.filter(todo => {
    if (!todo.due_date || !todo.reminder_minutes || todo.completed) return false;

    const dueAt = new Date(todo.due_date);
    const remindAt = new Date(dueAt.getTime() - todo.reminder_minutes * 60 * 1000);
    const isInWindow = now >= remindAt && now <= dueAt;

    // Dedup: skip if last_notification_sent is already within this reminder window
    if (todo.last_notification_sent) {
      const lastSent = new Date(todo.last_notification_sent);
      if (lastSent >= remindAt) return false; // already notified for this window
    }

    return isInWindow;
  });

  // Update last_notification_sent for all matched todos
  for (const todo of due) {
    todoDB.update(todo.id, { last_notification_sent: toSingaporeISOString(now) });
  }

  return NextResponse.json(due);
}
```

---

## `lib/hooks/useNotifications.ts`

```typescript
'use client';
import { useEffect } from 'react';

export function useNotifications(): void {
  useEffect(() => {
    // Request browser notification permission once
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const poll = async () => {
      try {
        const res = await fetch('/api/notifications/check');
        if (!res.ok) return;
        const todos = await res.json();
        if (!Array.isArray(todos)) return;

        if (Notification.permission === 'granted') {
          for (const todo of todos) {
            new Notification('Todo Reminder', {
              body: todo.title,
              tag: `todo-${todo.id}`,
            });
          }
        }
      } catch {
        // Silent fail — notifications are non-critical
      }
    };

    poll(); // run immediately on mount
    const id = setInterval(poll, 30_000); // every 30 seconds
    return () => clearInterval(id);
  }, []);
}
```

---

## Validation Rules

| Field | Rule |
|-------|------|
| `is_recurring: true` | Requires `due_date` to be set; return 400 if `due_date` is null/missing |
| `recurrence_pattern` | Required when `is_recurring: true`; must be one of the enum values |
| `reminder_minutes` | Must be in `{15, 30, 60, 120, 1440, 2880, 10080}` if provided; return 400 otherwise |
| `reminder_minutes` | Only valid when `due_date` is also set; return 400 if `due_date` absent |

Apply in both `POST /api/todos` and `PUT /api/todos/[id]` — the prerequisite branch only handles base validation.

---

## Tests

### `tests/05-recurring-todos.spec.ts`

- Create daily recurring todo → badge `🔄 daily` visible
- Complete recurring todo → new instance appears in Pending with next due date (+1 day)
- Complete weekly recurring todo → next due date +7 days
- Complete monthly recurring todo on Jan 31 → next due date Feb 28/29
- Creating recurring todo without due date → validation error

### `tests/06-reminders.spec.ts`

- Set reminder on todo with due date → reminder badge visible
- Try to set reminder on todo without due date → dropdown disabled
- Reminder dropdown shows correct labels (15m, 30m, 1h, 2h, 1d, 2d, 1w)
- `/api/notifications/check` returns todo in notification window
- `/api/notifications/check` does not return same todo twice (dedup check)

---

## Model Routing

| Task | Model |
|------|-------|
| `calculateNextDueDate` implementation | **Sonnet 4.6** — month/year-end clamping is subtle |
| Recurring completion hook in PUT route | **Sonnet 4.6** — cross-feature integration |
| Notification polling + dedup logic | **Sonnet 4.6** — timing correctness |
| UI form additions (badges, dropdown) | auto |
| Test files | auto |

---

## Definition of Done

- [ ] `calculateNextDueDate` passes all edge cases (Jan 31→Feb 28/29, Feb 29→Feb 28, Dec 31→Jan 31)
- [ ] Completing a recurring todo creates a next instance with all attributes copied
- [ ] `GET /api/notifications/check` deduplicates correctly (no double notifications)
- [ ] `useNotifications` polls every 30s, fires browser notification
- [ ] Recurrence/reminder fields disabled correctly when `due_date` is absent
- [ ] All validation rules enforced in API routes
- [ ] Tests pass: `tests/05-recurring-todos.spec.ts` and `tests/06-reminders.spec.ts`
- [ ] No `console.log` in any committed file
- [ ] `npm run build` passes on this branch

---

## Merge Notes (for 00-post.md)

**Files modified:**
- `lib/timezone.ts` (additive — new function)
- `app/api/todos/[id]/route.ts` (replaces TODO stub — potential conflict if tags branch also touches this file; coordinate with `feature/tags` developer)
- `app/api/notifications/check/route.ts` (new file — no conflict)
- `lib/hooks/useNotifications.ts` (new file — no conflict)
- `app/page.tsx` (additive to stub section — potential conflict at merge time)
- `tests/05-recurring-todos.spec.ts` (new file — no conflict)
- `tests/06-reminders.spec.ts` (new file — no conflict)

---

## Git Commit & Push

Once the Definition of Done checklist above is fully satisfied:

```bash
# Stage all changes
git add .

# Commit with conventional commit format
git commit -m "feat: recurring todos and reminders/notifications"

# Push and set upstream (first push of this feature branch)
git push -u origin feature/recurring-reminders
```

If you made incremental commits during development, push with the same command — `-u` only needs to be used once but is safe to repeat.

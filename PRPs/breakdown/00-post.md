# 00 — Post-Prerequisite: Merge, Integration & Deployment

**Execute only after ALL 6 feature branches have been reviewed and approved.**

This document covers:
1. Merge order and conflict resolution
2. Integration checklist
3. E2E test suite (full run)
4. Final build verification
5. Deployment to Railway

---

## Prerequisites Before Merging

- [ ] `develop` branch passes `npm run build` and `npm run lint`
- [ ] Each of the 6 feature branches passes its own `npm run build`
- [ ] Each feature branch's designated test files pass (`npx playwright test tests/<spec>.spec.ts`)
- [ ] All feature branches are up-to-date with `develop` (rebased or merged from develop)

---

## Merge Order

Merge into `develop` in this sequence to minimize conflicts. **Do not skip steps or reorder.**

```
develop (base)
    └── 1. feature/subtasks        → develop
    └── 2. feature/tags            → develop
    └── 3. feature/recurring-reminders  → develop
    └── 4. feature/search-filtering     → develop
    └── 5. feature/templates       → develop
    └── 6. feature/export-calendar → develop
```

**Rationale for this order:**
- `subtasks` and `tags` touch `lib/db.ts` (JOIN additions) and are resolved first so the JOIN logic is correct before other branches merge
- `recurring-reminders` modifies `app/api/todos/[id]/route.ts` which must be stable before templates merges (templates also relies on `tagDB.findByTodoId` being present)
- `search-filtering` is pure client-side with no API changes — lowest conflict risk, merged before the larger template/export branches
- `templates` depends on subtask+tag DB interfaces being finalized
- `export-calendar` adds new files only (except `app/page.tsx`) — safest last merge

---

## Merge Instructions Per Branch

### Step 1: Merge `feature/subtasks`

```bash
git checkout develop
git merge --no-ff feature/subtasks -m "feat: subtasks & progress tracking"
```

**Expected conflicts:** none in API files. If `lib/db.ts` has conflicts, keep both the subtask JOIN and any existing logic.

Verify after merge:
```bash
npm run build
npx playwright test tests/07-subtasks.spec.ts
```

---

### Step 2: Merge `feature/tags`

```bash
git merge --no-ff feature/tags -m "feat: tag system"
```

**Expected conflicts in `lib/db.ts`:** Both `feature/subtasks` and `feature/tags` add JOIN logic to `todoDB.findByUserId` and `todoDB.findById`. Resolve by including **both** joins:

```typescript
// Correct merged version in todoDB.findByUserId:
const todosWithRelations = todos.map(todo => ({
  ...todo,
  subtasks: subtaskDB.findByTodoId(todo.id),   // from feature/subtasks
  tags: tagDB.findByTodoId(todo.id),            // from feature/tags
}));
```

**Expected conflicts in `app/page.tsx`:** If both branches modified adjacent lines in the todo item card, resolve by including both additions (tag chips + subtask section) in the final card layout.

Verify after merge:
```bash
npm run build
npx playwright test tests/07-subtasks.spec.ts tests/08-tags.spec.ts
```

---

### Step 3: Merge `feature/recurring-reminders`

```bash
git merge --no-ff feature/recurring-reminders -m "feat: recurring todos and reminders"
```

**Expected conflicts in `app/api/todos/[id]/route.ts`:** The prerequisite has a `// TODO: recurring completion hook` comment. This branch replaces it. If the comment was already removed by a previous merge (unlikely at step 3), check that the recurring completion logic is present.

**Expected conflicts in `app/page.tsx`:** Resolve by placing the recurrence/reminder form fields in the correct position inside the create/edit form, and the `useNotifications()` call at the top of the component.

Verify after merge:
```bash
npm run build
npx playwright test tests/05-recurring-todos.spec.ts tests/06-reminders.spec.ts
```

---

### Step 4: Merge `feature/search-filtering`

```bash
git merge --no-ff feature/search-filtering -m "feat: search and filtering"
```

**Expected conflicts in `app/page.tsx`:** This branch wraps the section rendering with `applyFilters`. Verify the section rendering still works correctly after merging (the `visibleTodos` variable must be what the Overdue/Pending/Completed splits use).

Verify after merge:
```bash
npm run build
npx playwright test tests/10-search-filtering.spec.ts
```

---

### Step 5: Merge `feature/templates`

```bash
git merge --no-ff feature/templates -m "feat: template system"
```

**Expected conflicts in `app/page.tsx`:** Templates section adds state and JSX. Should be additive — resolve by keeping all additions.

Verify after merge:
```bash
npm run build
npx playwright test tests/09-templates.spec.ts
```

---

### Step 6: Merge `feature/export-calendar`

```bash
git merge --no-ff feature/export-calendar -m "feat: export/import and calendar view"
```

**Expected conflicts in `app/page.tsx`:** Export/import buttons are in the header area stub. Should be additive.

Verify after merge:
```bash
npm run build
npx playwright test tests/11-export-import.spec.ts tests/12-calendar.spec.ts
```

---

## Post-Merge Integration Checklist

After all 6 merges, verify the complete system:

### `app/page.tsx` — Final Audit

- [ ] `useNotifications()` hook called once near the top
- [ ] Filter state and `applyFilters` wraps all three section renders
- [ ] Todo item card contains (in order): title, priority badge, recurrence badge (if recurring), reminder badge (if set), tag chips, progress bar (if subtasks present), subtask list (when expanded), export/import buttons in header
- [ ] Add todo form has: title, due_date, priority, recurrence toggle + pattern, reminder dropdown
- [ ] Templates section renders
- [ ] Manage Tags modal accessible from header
- [ ] Export dropdown in header
- [ ] Import file input in header
- [ ] No `// TODO` stubs remaining (all 6 replaced)
- [ ] No `console.log` statements

### `lib/db.ts` — Final Audit

- [ ] `PRAGMA foreign_keys = ON` set at DB init
- [ ] All 8 tables created with `IF NOT EXISTS`
- [ ] `todoDB.findByUserId` and `todoDB.findById` join both `subtasks` and `tags`
- [ ] All DB objects exported: `userDB`, `authenticatorDB`, `todoDB`, `subtaskDB`, `tagDB`, `templateDB`, `holidayDB`

### API Routes — Final Audit

Every route listed in the API Surface table in `00-one-shot-implementation.md` must exist:

- [ ] `POST /api/auth/register-options`
- [ ] `POST /api/auth/register-verify`
- [ ] `POST /api/auth/login-options`
- [ ] `POST /api/auth/login-verify`
- [ ] `POST /api/auth/logout`
- [ ] `GET /api/auth/me`
- [ ] `GET /api/todos`
- [ ] `POST /api/todos`
- [ ] `GET /api/todos/[id]`
- [ ] `PUT /api/todos/[id]`
- [ ] `DELETE /api/todos/[id]`
- [ ] `POST /api/todos/[id]/subtasks`
- [ ] `PUT /api/subtasks/[id]`
- [ ] `DELETE /api/subtasks/[id]`
- [ ] `GET /api/tags`
- [ ] `POST /api/tags`
- [ ] `PUT /api/tags/[id]`
- [ ] `DELETE /api/tags/[id]`
- [ ] `POST /api/todos/[id]/tags`
- [ ] `DELETE /api/todos/[id]/tags`
- [ ] `GET /api/templates`
- [ ] `POST /api/templates`
- [ ] `GET /api/templates/[id]`
- [ ] `PUT /api/templates/[id]`
- [ ] `DELETE /api/templates/[id]`
- [ ] `POST /api/templates/[id]/use`
- [ ] `GET /api/todos/export`
- [ ] `POST /api/todos/import`
- [ ] `GET /api/holidays`
- [ ] `GET /api/notifications/check`

---

## Full E2E Test Run

```bash
npx playwright test
```

All 12 spec files must pass:

| File | Feature |
|------|---------|
| `tests/01-authentication.spec.ts` | WebAuthn register/login/logout |
| `tests/02-todo-crud.spec.ts` | Base CRUD, sections, sort |
| `tests/03-priority.spec.ts` | Priority badges and sort |
| `tests/05-recurring-todos.spec.ts` | Recurring todos, next-due logic |
| `tests/06-reminders.spec.ts` | Reminder badges, notification check |
| `tests/07-subtasks.spec.ts` | Subtasks, progress bar |
| `tests/08-tags.spec.ts` | Tag CRUD, attach/detach |
| `tests/09-templates.spec.ts` | Template CRUD, use endpoint |
| `tests/10-search-filtering.spec.ts` | Search, filter, presets |
| `tests/11-export-import.spec.ts` | Export JSON/CSV, import |
| `tests/12-calendar.spec.ts` | Calendar grid, holidays |

If any spec fails, fix on `develop` directly (or create a `fix/<issue>` branch from `develop` and merge immediately).

---

## Final Build Verification

```bash
npm run lint
npm run build
```

Both must exit 0 with no errors or warnings.

---

## Holiday Seed

```bash
npx tsx scripts/seed-holidays.ts
```

Run this once against the production database before launch.

---

## Merge to `main`

Once all tests pass and build is clean:

```bash
git checkout main
git merge --no-ff develop -m "feat: complete todo app — all 11 features"
git tag v1.0.0
git push origin main --tags
```

---

## Deployment (Railway)

Refer to `RAILWAY_DEPLOYMENT.md` and `RAILWAY_SIMPLE_SETUP.md` in the repo root for full Railway setup.

**Environment variables required on Railway:**

| Variable | Notes |
|----------|-------|
| `JWT_SECRET` | Random 32+ byte string; never commit to repo |
| `NODE_ENV` | `production` |
| `NEXTAUTH_URL` | Your Railway app URL (e.g. `https://yourapp.railway.app`) |

**SQLite on Railway:**

- The `todos.db` file must be on a persistent volume (Railway Volume)
- Mount the volume at `/app/data` and set the DB path in `lib/db.ts` to `/app/data/todos.db` when `NODE_ENV=production`
- Run the holiday seed script once after first deploy: `railway run npx tsx scripts/seed-holidays.ts`

**Build command (Railway):**

```
npm run build
```

**Start command:**

```
npm start
```

---

## Definition of Done (full app)

- [ ] All 8 tables created with `PRAGMA foreign_keys = ON`
- [ ] All 30 API routes implemented, each checking session first
- [ ] `npm run build` and `npm run lint` pass with zero errors
- [ ] All Singapore-timezone-sensitive logic uses `getSingaporeNow()` — no raw `new Date()`
- [ ] No `console.log` in any shipped file
- [ ] `npx playwright test` passes all 12 spec files
- [ ] Templates include subtasks (not due date / tags) — verified in test 09
- [ ] Export/import includes tags+subtasks (not original IDs) — verified in test 11
- [ ] `v1.0.0` tag created on `main`
- [ ] Deployed to Railway with persistent SQLite volume
- [ ] Holiday seed run against production DB

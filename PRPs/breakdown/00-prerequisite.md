# 00 — Prerequisite: Project Foundation

**Must be complete and merged to `develop` before any parallel feature branch begins.**

All 6 feature branches depend on every deliverable in this file. Do not begin parallel work until `npm run build` and `npm run lint` pass on `develop`.

---

## Branch

```
develop
```

Create this as the integration branch. All parallel feature branches will be cut from `develop` once this spec is done.

---

## Deliverables Checklist

- [ ] `package.json` + all dependencies installed
- [ ] Next.js app structure scaffolded
- [ ] `lib/db.ts` — full schema + all CRUD DB objects
- [ ] `lib/auth.ts` — JWT session helpers
- [ ] `lib/timezone.ts` — Singapore timezone helpers
- [ ] `middleware.ts` — route protection
- [ ] `app/login/page.tsx` — WebAuthn login/register UI
- [ ] `app/api/auth/**` — all 6 auth endpoints
- [ ] `app/api/todos/route.ts` — GET + POST
- [ ] `app/api/todos/[id]/route.ts` — GET + PUT + DELETE
- [ ] `app/page.tsx` — minimal shell (auth-aware, renders todo list with sections + priority badges)
- [ ] `tests/helpers.ts` — base helpers
- [ ] `tests/01-authentication.spec.ts`
- [ ] `tests/02-todo-crud.spec.ts`
- [ ] `tests/03-priority.spec.ts`
- [ ] `playwright.config.ts`
- [ ] `tsconfig.json`, `next.config.ts`, `.eslintrc.*`, `tailwind.config.*`

---

## Stack

| Package | Version / Notes |
|---------|-----------------|
| `next` | 16 (App Router) |
| `react` / `react-dom` | 19 |
| `tailwindcss` | 4 |
| `better-sqlite3` | latest stable |
| `@types/better-sqlite3` | matching |
| `@simplewebauthn/server` | latest stable |
| `@simplewebauthn/browser` | latest stable |
| `jose` | JWT (HS256) — for session signing |
| `zod` | input validation |
| `@playwright/test` | E2E testing |
| `tsx` | for seed scripts |

---

## File Layout

```
lib/db.ts
lib/auth.ts
lib/timezone.ts
middleware.ts
app/layout.tsx
app/page.tsx
app/login/page.tsx
app/api/auth/register-options/route.ts
app/api/auth/register-verify/route.ts
app/api/auth/login-options/route.ts
app/api/auth/login-verify/route.ts
app/api/auth/logout/route.ts
app/api/auth/me/route.ts
app/api/todos/route.ts
app/api/todos/[id]/route.ts
tests/helpers.ts
tests/01-authentication.spec.ts
tests/02-todo-crud.spec.ts
tests/03-priority.spec.ts
playwright.config.ts
```

---

## Database Schema (`lib/db.ts` — init block)

Run the entire schema at DB startup. Use `try/catch` around each `ALTER TABLE` if adding migration logic later.

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS authenticators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT UNIQUE NOT NULL,
  credential_public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_authenticators_user_id ON authenticators(user_id);

CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recurrence_pattern TEXT,
  reminder_minutes INTEGER,
  last_notification_sent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);
CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);

CREATE TABLE IF NOT EXISTS subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subtasks_todo_id ON subtasks(todo_id);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS todo_tags (
  todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (todo_id, tag_id)
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  title_template TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  is_recurring INTEGER NOT NULL DEFAULT 0,
  recurrence_pattern TEXT,
  reminder_minutes INTEGER,
  due_date_offset_minutes INTEGER,
  subtasks_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
```

**CRITICAL:** Call `db.pragma('foreign_keys = ON')` immediately after opening the database. `better-sqlite3` does not persist pragmas across connections.

---

## TypeScript Types (`lib/db.ts`)

Export these types. All parallel feature branches import from here.

```typescript
export type Priority = 'high' | 'medium' | 'low';
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type ReminderMinutes = 15 | 30 | 60 | 120 | 1440 | 2880 | 10080;

export interface User { id: number; username: string; created_at: string; }
export interface Authenticator {
  id: number; user_id: number; credential_id: string;
  credential_public_key: Buffer; counter: number; created_at: string;
}
export interface Session { userId: number; username: string; }

export interface Todo {
  id: number; user_id: number; title: string; completed: boolean;
  due_date: string | null; priority: Priority;
  is_recurring: boolean; recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null; last_notification_sent: string | null;
  created_at: string; updated_at: string | null;
  subtasks?: Subtask[]; tags?: Tag[];
}
export interface Subtask {
  id: number; todo_id: number; title: string; completed: boolean;
  position: number; created_at: string;
}
export interface Tag {
  id: number; user_id: number; name: string; color: string; created_at: string;
}
export interface Template {
  id: number; user_id: number; name: string; description: string | null;
  category: string | null; title_template: string; priority: Priority;
  is_recurring: boolean; recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null; due_date_offset_minutes: number | null;
  subtasks_json: string | null; created_at: string;
}
export interface Holiday { id: number; date: string; name: string; }
```

---

## DB Objects (`lib/db.ts`)

Export each DB object. Feature branches call these methods — they must all be present even if only stubs.

### `userDB`

```typescript
export const userDB = {
  findByUsername: (username: string): User | undefined => { ... },
  create: (username: string): User => { ... },
};
```

### `authenticatorDB`

```typescript
export const authenticatorDB = {
  findByUserId: (userId: number): Authenticator[] => { ... },
  findByCredentialId: (credentialId: string): Authenticator | undefined => { ... },
  create: (data: { userId: number; credentialId: string; credentialPublicKey: Buffer; counter: number }): Authenticator => { ... },
  updateCounter: (id: number, counter: number): void => { ... },
};
```

### `todoDB`

```typescript
export const todoDB = {
  findByUserId: (userId: number): Todo[] => { ... }, // joins subtasks + tags
  findById: (id: number): Todo | undefined => { ... }, // joins subtasks + tags
  create: (data: { userId: number; title: string; dueDate?: string | null; priority?: Priority; isRecurring?: boolean; recurrencePattern?: RecurrencePattern | null; reminderMinutes?: number | null }): Todo => { ... },
  update: (id: number, data: Partial<Pick<Todo, 'title' | 'completed' | 'due_date' | 'priority' | 'is_recurring' | 'recurrence_pattern' | 'reminder_minutes' | 'last_notification_sent'>>): Todo => { ... },
  delete: (id: number): void => { ... },
};
```

### `subtaskDB`

```typescript
export const subtaskDB = {
  findByTodoId: (todoId: number): Subtask[] => { ... },
  create: (data: { todoId: number; title: string; position: number }): Subtask => { ... },
  update: (id: number, data: Partial<Pick<Subtask, 'title' | 'completed'>>): Subtask => { ... },
  delete: (id: number): void => { ... },
};
```

### `tagDB`

```typescript
export const tagDB = {
  findByUserId: (userId: number): Tag[] => { ... },
  findById: (id: number): Tag | undefined => { ... },
  create: (data: { userId: number; name: string; color?: string }): Tag => { ... },
  update: (id: number, data: Partial<Pick<Tag, 'name' | 'color'>>): Tag => { ... },
  delete: (id: number): void => { ... },
  attachToTodo: (todoId: number, tagId: number): void => { ... },
  detachFromTodo: (todoId: number, tagId: number): void => { ... },
  findByTodoId: (todoId: number): Tag[] => { ... },
};
```

### `templateDB`

```typescript
export const templateDB = {
  findByUserId: (userId: number): Template[] => { ... },
  findById: (id: number): Template | undefined => { ... },
  create: (data: Omit<Template, 'id' | 'created_at'>): Template => { ... },
  update: (id: number, data: Partial<Omit<Template, 'id' | 'user_id' | 'created_at'>>): Template => { ... },
  delete: (id: number): void => { ... },
};
```

### `holidayDB`

```typescript
export const holidayDB = {
  findAll: (): Holiday[] => { ... },
  upsert: (date: string, name: string): void => { ... },
};
```

---

## `lib/timezone.ts`

```typescript
const SG_TIMEZONE = 'Asia/Singapore';

export function getSingaporeNow(): Date {
  // Returns a Date whose .toISOString() equivalent in SG timezone is "now"
  // Use Intl.DateTimeFormat to get SG wall-clock time
}

export function formatSingaporeDate(date: Date): string {
  // Returns YYYY-MM-DDTHH:mm:ss (no Z) in Singapore local time
}

export function toSingaporeISOString(date: Date): string {
  return formatSingaporeDate(date);
}
```

**Rule:** Every file in the codebase that needs the current time must call `getSingaporeNow()`. No `new Date()` in production code.

---

## `lib/auth.ts`

JWT sessions in HTTP-only cookies. Use `jose` (HS256).

```typescript
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { Session } from './db';

const SESSION_COOKIE = 'todo-session';
const EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

export async function createSession(session: Session): Promise<void> { ... }
export async function getSession(): Promise<Session | null> { ... }
export async function deleteSession(): Promise<void> { ... }
```

- `createSession`: signs JWT, sets cookie with `httpOnly: true`, `sameSite: 'lax'`, `secure` only in production, `maxAge: EXPIRY_SECONDS`
- `getSession`: reads cookie, verifies JWT, returns payload or `null` on any error
- `deleteSession`: sets cookie with `maxAge: 0`

Secret key: `process.env.JWT_SECRET` (throw on missing in non-test environments).

---

## `middleware.ts`

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';

const PROTECTED = ['/', '/calendar'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await getSession();

  if (PROTECTED.some(p => pathname === p || pathname.startsWith(p + '/')) && !session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (pathname === '/login' && session) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/', '/calendar/:path*', '/login'] };
```

---

## Auth API Routes

### Common pattern for all routes

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
```

### `POST /api/auth/register-options`

1. Parse `{ username }` from request body (validate: non-empty string).
2. Check `userDB.findByUsername(username)` — if found, return 409.
3. Generate challenge via `generateRegistrationOptions` (`@simplewebauthn/server`).
4. Store challenge in a short-lived session cookie (or server-side store): `registration-challenge` keyed to username.
5. Return options JSON.

### `POST /api/auth/register-verify`

1. Parse `{ username, response }`.
2. Retrieve stored challenge for username.
3. `verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin, expectedRPID })`.
4. If verification fails, 400.
5. `userDB.create(username)` (if not already exists).
6. `authenticatorDB.create({ userId, credentialId: isoBase64URL.fromBuffer(credentialID), credentialPublicKey, counter: registrationInfo.counter ?? 0 })`.
7. `createSession({ userId, username })`.
8. Return 200 `{ verified: true }`.

**Critical:** use `isoBase64URL` from `@simplewebauthn/server/helpers` for all credential ID serialization.

### `POST /api/auth/login-options`

1. Parse `{ username }`.
2. Look up user + their authenticators. If none, 404.
3. `generateAuthenticationOptions({ allowCredentials, challenge })`.
4. Store challenge cookie.
5. Return options.

### `POST /api/auth/login-verify`

1. Parse `{ username, response }`.
2. Find authenticator by `credentialId`.
3. `verifyAuthenticationResponse(...)`.
4. **Counter regression check:** if `authenticationInfo.newCounter > 0` and `authenticationInfo.newCounter <= authenticator.counter`, return 401 (clone-attack defense). Both-zero is allowed.
5. `authenticatorDB.updateCounter(authenticator.id, authenticationInfo.newCounter)`.
6. `createSession({ userId: authenticator.user_id, username })`.
7. Return 200 `{ verified: true }`.

**Critical:** `counter: authenticator.counter ?? 0` — always use `?? 0` to handle undefined.

### `POST /api/auth/logout`

Call `deleteSession()`, return 200.

### `GET /api/auth/me`

Call `getSession()`. If null, 401. Else return `{ userId, username }`.

---

## Todo API Routes

### `GET /api/todos`

```typescript
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const todos = todoDB.findByUserId(session.userId);
  return NextResponse.json(todos);
}
```

`todoDB.findByUserId` must JOIN subtasks and tags into each todo object.

### `POST /api/todos`

Validate body:
- `title`: required, trim, non-empty → 400 if missing
- `priority`: optional, default `'medium'`, must be `'high' | 'medium' | 'low'`
- `due_date`: optional; if set, must be ≥ `getSingaporeNow()` + 1 minute → 400 if in the past

```typescript
const todo = todoDB.create({ userId: session.userId, title, dueDate, priority });
return NextResponse.json(todo, { status: 201 });
```

### `GET /api/todos/[id]`

Ownership check: if `todo.user_id !== session.userId`, return 403.

### `PUT /api/todos/[id]`

Partial update. Ownership check. For `is_recurring + completed=true` — **this is handled in `feature/recurring-reminders` branch**, leave a `// TODO: recurring completion hook` comment here in the prerequisite to mark the insertion point.

### `DELETE /api/todos/[id]`

Ownership check. `todoDB.delete(id)` cascades subtasks and tags via FK.

---

## `app/page.tsx` Shell (prerequisite scope)

This is intentionally monolithic. The prerequisite delivers the structural shell; each feature branch adds to it.

**Prerequisite provides:**
- `'use client'` directive
- Auth check on mount (`GET /api/auth/me`), redirect to `/login` if unauthenticated
- Fetch and store `todos: Todo[]` state
- Three-section layout: **Overdue** / **Pending** / **Completed**
- Section sort comparator: `priority(high→med→low) → due_date(earliest→latest) → created_at(newest→oldest)`
- Add todo form (title + due_date + priority fields)
- Todo item display: title, due date, priority badge, delete button
- Optimistic UI: add/delete updates local state immediately, then re-fetches

**Priority badge colors:**

| Priority | Light mode | Dark mode |
|----------|-----------|-----------|
| high | `#EF4444` (red-500) | `#F87171` (red-400) |
| medium | `#F59E0B` (amber-500) | `#FBBF24` (amber-400) |
| low | `#3B82F6` (blue-500) | `#60A5FA` (blue-400) |

Must pass WCAG AA contrast.

**Leave clearly-marked comment stubs for each feature branch:**

```typescript
// ===== FEATURE: recurring-reminders — insert recurrence/reminder form fields here =====
// ===== FEATURE: subtasks — insert subtask section per todo item here =====
// ===== FEATURE: tags — insert tag chips + Manage Tags modal here =====
// ===== FEATURE: templates — insert Templates section here =====
// ===== FEATURE: search-filtering — insert search/filter panel here =====
// ===== FEATURE: export-calendar — insert export/import buttons here =====
```

---

## `app/login/page.tsx`

`'use client'`. Two modes toggled by a button: **Register** / **Login**.

- **Register**: username input → calls `/api/auth/register-options` → `startRegistration` (from `@simplewebauthn/browser`) → POST to `/api/auth/register-verify` → redirect to `/`
- **Login**: username input → calls `/api/auth/login-options` → `startAuthentication` → POST to `/api/auth/login-verify` → redirect to `/`
- Show error message on failure
- If already authenticated (check `/api/auth/me` on mount), redirect to `/`

---

## `playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://localhost:3000',
    timezoneId: 'Asia/Singapore',
    launchOptions: {
      args: [
        '--enable-virtual-authenticator-environment',
        '--disable-web-security', // required for virtual WebAuthn in tests
      ],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## `tests/helpers.ts`

```typescript
import { Page } from '@playwright/test';

export class TodoAppHelper {
  constructor(private page: Page) {}

  async register(username: string): Promise<void> { ... }
  async login(username: string): Promise<void> { ... }
  async createTodo(title: string, opts?: { dueDate?: string; priority?: string }): Promise<void> { ... }
  async addSubtask(todoTitle: string, subtaskTitle: string): Promise<void> { ... }  // stub — implemented in feature/subtasks
  async createTag(name: string, color?: string): Promise<void> { ... }              // stub — implemented in feature/tags
  async createTemplate(name: string, opts?: object): Promise<void> { ... }          // stub — implemented in feature/templates
}
```

---

## Tests (prerequisite scope)

### `tests/01-authentication.spec.ts`

- Register new user → lands on `/`
- Login with registered user → lands on `/`
- Logout → lands on `/login`
- Unauthenticated access to `/` → redirected to `/login`
- Duplicate username registration → error shown

### `tests/02-todo-crud.spec.ts`

- Create todo with title only → appears in Pending section
- Create todo with due date (future) → appears in Pending
- Create todo with past due date → validation error
- Create todo with empty title → validation error
- Mark todo complete → moves to Completed section
- Delete todo → removed from list
- Due-date past `now` (simulate by using past date in form) → overdue section

### `tests/03-priority.spec.ts`

- Create high/medium/low priority todos → correct badge color
- Todos sorted within Pending: high before medium before low

---

## Definition of Done

- [ ] `npm install` succeeds
- [ ] `npm run dev` starts without errors
- [ ] `npm run build` passes, no TypeScript errors
- [ ] `npm run lint` passes
- [ ] All 8 tables created with `PRAGMA foreign_keys = ON`
- [ ] `lib/db.ts` exports all DB objects listed above (stubs are fine for methods used only by feature branches)
- [ ] `tests/01-authentication.spec.ts`, `02-todo-crud.spec.ts`, `03-priority.spec.ts` all pass
- [ ] `app/page.tsx` has the 6 feature comment stubs in place
- [ ] No `console.log` in any committed file
- [ ] Branch `develop` pushed to remote

---

## Notes for Feature Branch Developers

Once `develop` passes the above checklist, create your feature branch:

```bash
git checkout develop
git pull origin develop
git checkout -b feature/<your-feature-name>
```

Your branch will have all the DB interfaces, types, auth helpers, and the page shell ready to use. Do not modify `lib/db.ts` schema — all tables already exist. You may add new methods to the relevant DB objects.

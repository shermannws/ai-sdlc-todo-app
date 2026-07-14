import 'server-only';
import Database from 'better-sqlite3';
import path from 'path';

// ─── Types ───────────────────────────────────────────────────────────────────

export type Priority = 'high' | 'medium' | 'low';
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type ReminderMinutes = 15 | 30 | 60 | 120 | 1440 | 2880 | 10080;

export interface User {
  id: number;
  username: string;
  created_at: string;
}

export interface Authenticator {
  id: number;
  user_id: number;
  credential_id: string;
  credential_public_key: Buffer;
  counter: number;
  created_at: string;
}

export interface Session {
  userId: number;
  username: string;
}

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  completed: boolean;
  due_date: string | null;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
  updated_at: string | null;
  subtasks?: Subtask[];
  tags?: Tag[];
}

export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: boolean;
  position: number;
  created_at: string;
}

export interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface Template {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  category: string | null;
  title_template: string;
  priority: Priority;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  due_date_offset_minutes: number | null;
  subtasks_json: string | null;
  created_at: string;
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
}

// ─── Database initialisation ─────────────────────────────────────────────────

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'todos.db');

const db = new Database(DB_PATH, { timeout: 5000 });

// CRITICAL: enable FK enforcement every connection
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

db.exec(`
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
`);

// ─── Row mappers (SQLite integers → JS booleans) ─────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTodo(row: any): Omit<Todo, 'subtasks' | 'tags'> {
  return {
    id: row.id as number,
    user_id: row.user_id as number,
    title: row.title as string,
    completed: row.completed === 1,
    due_date: (row.due_date as string | null) ?? null,
    priority: (row.priority as Priority) ?? 'medium',
    is_recurring: row.is_recurring === 1,
    recurrence_pattern: (row.recurrence_pattern as RecurrencePattern | null) ?? null,
    reminder_minutes: (row.reminder_minutes as number | null) ?? null,
    last_notification_sent: (row.last_notification_sent as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSubtask(row: any): Subtask {
  return {
    id: row.id as number,
    todo_id: row.todo_id as number,
    title: row.title as string,
    completed: row.completed === 1,
    position: row.position as number,
    created_at: row.created_at as string,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTag(row: any): Tag {
  return {
    id: row.id as number,
    user_id: row.user_id as number,
    name: row.name as string,
    color: row.color as string,
    created_at: row.created_at as string,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTemplate(row: any): Template {
  return {
    id: row.id as number,
    user_id: row.user_id as number,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    title_template: row.title_template as string,
    priority: (row.priority as Priority) ?? 'medium',
    is_recurring: row.is_recurring === 1,
    recurrence_pattern: (row.recurrence_pattern as RecurrencePattern | null) ?? null,
    reminder_minutes: (row.reminder_minutes as number | null) ?? null,
    due_date_offset_minutes: (row.due_date_offset_minutes as number | null) ?? null,
    subtasks_json: (row.subtasks_json as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

// ─── DB Objects ──────────────────────────────────────────────────────────────

export const userDB = {
  findByUsername: (username: string): User | undefined => {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as User | undefined;
  },
  create: (username: string): User => {
    const result = db.prepare('INSERT INTO users (username) VALUES (?)').run(username);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(Number(result.lastInsertRowid)) as User;
  },
};

export const authenticatorDB = {
  findByUserId: (userId: number): Authenticator[] => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = db.prepare('SELECT * FROM authenticators WHERE user_id = ?').all(userId) as any[];
    return rows.map((row) => ({ ...row, credential_public_key: Buffer.from(row.credential_public_key) }));
  },
  findByCredentialId: (credentialId: string): Authenticator | undefined => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = db.prepare('SELECT * FROM authenticators WHERE credential_id = ?').get(credentialId) as any;
    if (!row) return undefined;
    return { ...row, credential_public_key: Buffer.from(row.credential_public_key) };
  },
  create: (data: {
    userId: number;
    credentialId: string;
    credentialPublicKey: Buffer;
    counter: number;
  }): Authenticator => {
    const result = db
      .prepare(
        'INSERT INTO authenticators (user_id, credential_id, credential_public_key, counter) VALUES (?, ?, ?, ?)'
      )
      .run(data.userId, data.credentialId, data.credentialPublicKey, data.counter);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = db.prepare('SELECT * FROM authenticators WHERE id = ?').get(Number(result.lastInsertRowid)) as any;
    return { ...row, credential_public_key: Buffer.from(row.credential_public_key) };
  },
  updateCounter: (id: number, counter: number): void => {
    db.prepare('UPDATE authenticators SET counter = ? WHERE id = ?').run(counter, id);
  },
};

export const subtaskDB = {
  findByTodoId: (todoId: number): Subtask[] => {
    const rows = db.prepare('SELECT * FROM subtasks WHERE todo_id = ? ORDER BY position ASC').all(todoId);
    return rows.map(mapSubtask);
  },
  findById: (id: number): Subtask | undefined => {
    const row = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id);
    if (!row) return undefined;
    return mapSubtask(row);
  },
  create: (data: { todoId: number; title: string; position: number }): Subtask => {
    const result = db
      .prepare('INSERT INTO subtasks (todo_id, title, position) VALUES (?, ?, ?)')
      .run(data.todoId, data.title, data.position);
    const row = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(Number(result.lastInsertRowid));
    return mapSubtask(row);
  },
  update: (id: number, data: Partial<Pick<Subtask, 'title' | 'completed'>>): Subtask => {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
    if (data.completed !== undefined) { fields.push('completed = ?'); values.push(data.completed ? 1 : 0); }
    if (fields.length > 0) {
      values.push(id);
      db.prepare(`UPDATE subtasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
    return mapSubtask(db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id));
  },
  delete: (id: number): void => {
    db.prepare('DELETE FROM subtasks WHERE id = ?').run(id);
  },
};

export const tagDB = {
  findByUserId: (userId: number): Tag[] => {
    const rows = db.prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC').all(userId);
    return rows.map(mapTag);
  },
  findById: (id: number): Tag | undefined => {
    const row = db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
    if (!row) return undefined;
    return mapTag(row);
  },
  create: (data: { userId: number; name: string; color?: string }): Tag => {
    const result = db
      .prepare('INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)')
      .run(data.userId, data.name, data.color ?? '#3B82F6');
    return mapTag(db.prepare('SELECT * FROM tags WHERE id = ?').get(Number(result.lastInsertRowid)));
  },
  update: (id: number, data: Partial<Pick<Tag, 'name' | 'color'>>): Tag => {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.color !== undefined) { fields.push('color = ?'); values.push(data.color); }
    if (fields.length > 0) {
      values.push(id);
      db.prepare(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
    return mapTag(db.prepare('SELECT * FROM tags WHERE id = ?').get(id));
  },
  delete: (id: number): void => {
    db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  },
  attachToTodo: (todoId: number, tagId: number): void => {
    db.prepare('INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?, ?)').run(todoId, tagId);
  },
  detachFromTodo: (todoId: number, tagId: number): void => {
    db.prepare('DELETE FROM todo_tags WHERE todo_id = ? AND tag_id = ?').run(todoId, tagId);
  },
  findByTodoId: (todoId: number): Tag[] => {
    const rows = db
      .prepare(
        'SELECT t.* FROM tags t INNER JOIN todo_tags tt ON t.id = tt.tag_id WHERE tt.todo_id = ? ORDER BY t.name ASC'
      )
      .all(todoId);
    return rows.map(mapTag);
  },
};

export const todoDB = {
  findByUserId: (userId: number): Todo[] => {
    const rows = db.prepare('SELECT * FROM todos WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    return rows.map((row) => {
      const todo = mapTodo(row);
      return {
        ...todo,
        subtasks: subtaskDB.findByTodoId(todo.id),
        tags: tagDB.findByTodoId(todo.id),
      };
    });
  },
  findById: (id: number): Todo | undefined => {
    const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    if (!row) return undefined;
    const todo = mapTodo(row);
    return {
      ...todo,
      subtasks: subtaskDB.findByTodoId(todo.id),
      tags: tagDB.findByTodoId(todo.id),
    };
  },
  create: (data: {
    userId: number;
    title: string;
    dueDate?: string | null;
    priority?: Priority;
    isRecurring?: boolean;
    recurrencePattern?: RecurrencePattern | null;
    reminderMinutes?: number | null;
  }): Todo => {
    const result = db
      .prepare(
        'INSERT INTO todos (user_id, title, due_date, priority, is_recurring, recurrence_pattern, reminder_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        data.userId,
        data.title,
        data.dueDate ?? null,
        data.priority ?? 'medium',
        data.isRecurring ? 1 : 0,
        data.recurrencePattern ?? null,
        data.reminderMinutes ?? null
      );
    return todoDB.findById(Number(result.lastInsertRowid))!;
  },
  update: (
    id: number,
    data: Partial<
      Pick<
        Todo,
        | 'title'
        | 'completed'
        | 'due_date'
        | 'priority'
        | 'is_recurring'
        | 'recurrence_pattern'
        | 'reminder_minutes'
        | 'last_notification_sent'
      >
    >
  ): Todo => {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
    if (data.completed !== undefined) { fields.push('completed = ?'); values.push(data.completed ? 1 : 0); }
    if (data.due_date !== undefined) { fields.push('due_date = ?'); values.push(data.due_date); }
    if (data.priority !== undefined) { fields.push('priority = ?'); values.push(data.priority); }
    if (data.is_recurring !== undefined) { fields.push('is_recurring = ?'); values.push(data.is_recurring ? 1 : 0); }
    if (data.recurrence_pattern !== undefined) { fields.push('recurrence_pattern = ?'); values.push(data.recurrence_pattern); }
    if (data.reminder_minutes !== undefined) { fields.push('reminder_minutes = ?'); values.push(data.reminder_minutes); }
    if (data.last_notification_sent !== undefined) { fields.push('last_notification_sent = ?'); values.push(data.last_notification_sent); }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(id);
      db.prepare(`UPDATE todos SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
    return todoDB.findById(id)!;
  },
  delete: (id: number): void => {
    db.prepare('DELETE FROM todos WHERE id = ?').run(id);
  },
};

export const templateDB = {
  findByUserId: (userId: number): Template[] => {
    const rows = db.prepare('SELECT * FROM templates WHERE user_id = ? ORDER BY name ASC').all(userId);
    return rows.map(mapTemplate);
  },
  findById: (id: number): Template | undefined => {
    const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(id);
    if (!row) return undefined;
    return mapTemplate(row);
  },
  create: (data: Omit<Template, 'id' | 'created_at'>): Template => {
    const result = db
      .prepare(
        `INSERT INTO templates
          (user_id, name, description, category, title_template, priority,
           is_recurring, recurrence_pattern, reminder_minutes,
           due_date_offset_minutes, subtasks_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.user_id,
        data.name,
        data.description ?? null,
        data.category ?? null,
        data.title_template,
        data.priority,
        data.is_recurring ? 1 : 0,
        data.recurrence_pattern ?? null,
        data.reminder_minutes ?? null,
        data.due_date_offset_minutes ?? null,
        data.subtasks_json ?? null
      );
    return mapTemplate(db.prepare('SELECT * FROM templates WHERE id = ?').get(Number(result.lastInsertRowid)));
  },
  update: (id: number, data: Partial<Omit<Template, 'id' | 'user_id' | 'created_at'>>): Template => {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
    if (data.category !== undefined) { fields.push('category = ?'); values.push(data.category); }
    if (data.title_template !== undefined) { fields.push('title_template = ?'); values.push(data.title_template); }
    if (data.priority !== undefined) { fields.push('priority = ?'); values.push(data.priority); }
    if (data.is_recurring !== undefined) { fields.push('is_recurring = ?'); values.push(data.is_recurring ? 1 : 0); }
    if (data.recurrence_pattern !== undefined) { fields.push('recurrence_pattern = ?'); values.push(data.recurrence_pattern); }
    if (data.reminder_minutes !== undefined) { fields.push('reminder_minutes = ?'); values.push(data.reminder_minutes); }
    if (data.due_date_offset_minutes !== undefined) { fields.push('due_date_offset_minutes = ?'); values.push(data.due_date_offset_minutes); }
    if (data.subtasks_json !== undefined) { fields.push('subtasks_json = ?'); values.push(data.subtasks_json); }
    if (fields.length > 0) {
      values.push(id);
      db.prepare(`UPDATE templates SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }
    return templateDB.findById(id)!;
  },
  delete: (id: number): void => {
    db.prepare('DELETE FROM templates WHERE id = ?').run(id);
  },
};

export const holidayDB = {
  findAll: (): Holiday[] => {
    return db.prepare('SELECT * FROM holidays ORDER BY date ASC').all() as Holiday[];
  },
  upsert: (date: string, name: string): void => {
    db.prepare(
      `INSERT INTO holidays (date, name) VALUES (?, ?)
       ON CONFLICT(date) DO UPDATE SET name = excluded.name`
    ).run(date, name);
  },
};

export default db;

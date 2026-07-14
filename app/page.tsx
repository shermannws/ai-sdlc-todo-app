'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Todo, Priority } from '@/lib/db';

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<Priority, string> = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#3B82F6',
};

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

// ─── Sort comparator (priority → due_date → created_at) ──────────────────────

function sortTodos(a: Todo, b: Todo): number {
  const pd = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (pd !== 0) return pd;

  if (a.due_date && b.due_date) {
    const dd = a.due_date.localeCompare(b.due_date);
    if (dd !== 0) return dd;
  } else if (a.due_date) {
    return -1;
  } else if (b.due_date) {
    return 1;
  }

  return b.created_at.localeCompare(a.created_at);
}

// ─── Components ───────────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      style={{ backgroundColor: PRIORITY_COLORS[priority] }}
      className="px-2 py-0.5 rounded-full text-xs text-white font-medium"
    >
      {priority}
    </span>
  );
}

function TodoItem({
  todo,
  onToggle,
  onDelete,
}: {
  todo: Todo;
  onToggle: (todo: Todo) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      className={`p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg flex items-start gap-3 ${
        todo.completed ? 'opacity-60' : ''
      }`}
    >
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={() => onToggle(todo)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-blue-600"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`font-medium text-gray-900 dark:text-gray-100 ${
              todo.completed ? 'line-through text-gray-400 dark:text-gray-500' : ''
            }`}
          >
            {todo.title}
          </span>
          <PriorityBadge priority={todo.priority} />
          {/* ===== FEATURE: recurring-reminders — insert recurrence/reminder badges here ===== */}
          {/* ===== FEATURE: tags — insert tag chips here ===== */}
        </div>
        {todo.due_date && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Due:{' '}
            {new Date(todo.due_date).toLocaleString('en-SG', {
              timeZone: 'Asia/Singapore',
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </p>
        )}
        {/* ===== FEATURE: subtasks — insert subtask section per todo item here ===== */}
      </div>
      <button
        onClick={() => onDelete(todo.id)}
        className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
        aria-label={`Delete "${todo.title}"`}
      >
        ✕
      </button>
    </div>
  );
}

function Section({
  title,
  titleClass,
  todos,
  onToggle,
  onDelete,
  emptyMessage,
}: {
  title: string;
  titleClass: string;
  todos: Todo[];
  onToggle: (todo: Todo) => void;
  onDelete: (id: number) => void;
  emptyMessage?: string;
}) {
  return (
    <div className="mb-6">
      <h2 className={`text-base font-semibold mb-2 ${titleClass}`}>
        {title} ({todos.length})
      </h2>
      {todos.length === 0 && emptyMessage ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{emptyMessage}</p>
      ) : (
        <div className="space-y-2">
          {todos.map((todo) => (
            <TodoItem key={todo.id} todo={todo} onToggle={onToggle} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Add-todo form state
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('medium');

  // ===== FEATURE: recurring-reminders — insert recurrence/reminder state here =====
  // ===== FEATURE: search-filtering — insert filter state here =====
  // ===== FEATURE: tags — insert tag state here =====
  // ===== FEATURE: templates — insert template state here =====

  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) {
        router.push('/login');
        return;
      }
      const data = await res.json();
      setUsername(data.username);
      await fetchTodos();
    } catch {
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }

  async function fetchTodos() {
    const res = await fetch('/api/todos');
    if (res.ok) {
      const data: Todo[] = await res.json();
      setTodos(data);
    }
  }

  async function handleAddTodo(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    setFormError(null);

    const res = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: trimmed,
        due_date: newDueDate || null,
        priority: newPriority,
      }),
    });

    if (res.ok) {
      const created: Todo = await res.json();
      setTodos((prev) => [...prev, created]);
      setNewTitle('');
      setNewDueDate('');
      setNewPriority('medium');
    } else {
      const data = await res.json();
      setFormError(data.error ?? 'Failed to create todo');
    }
  }

  async function handleToggle(todo: Todo) {
    const newCompleted = !todo.completed;
    // Optimistic update
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, completed: newCompleted } : t)));

    const res = await fetch(`/api/todos/${todo.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: newCompleted }),
    });

    if (!res.ok) {
      // Rollback
      setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, completed: todo.completed } : t)));
    } else {
      // Refresh to pick up any server-side changes (e.g. recurring next instance)
      await fetchTodos();
    }
  }

  async function handleDelete(id: number) {
    // Optimistic delete
    setTodos((prev) => prev.filter((t) => t.id !== id));

    const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      // Rollback
      await fetchTodos();
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="text-gray-500">Loading…</span>
      </div>
    );
  }

  const now = new Date().toISOString();
  const overdue = todos.filter((t) => !t.completed && t.due_date && t.due_date < now).sort(sortTodos);
  const pending = todos.filter((t) => !t.completed && (!t.due_date || t.due_date >= now)).sort(sortTodos);
  const completed = todos.filter((t) => t.completed).sort((a, b) => b.created_at.localeCompare(a.created_at));

  // ===== FEATURE: search-filtering — replace above three arrays with applyFilters(todos, filters) then section split =====

  return (
    <div className="max-w-2xl mx-auto p-4 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">My Todos</h1>
          {username && <p className="text-sm text-gray-500 dark:text-gray-400">Logged in as {username}</p>}
        </div>
        <div className="flex items-center gap-3">
          {/* ===== FEATURE: export-calendar — insert export/import buttons here ===== */}
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Logout
          </button>
        </div>
      </div>

      {/* ===== FEATURE: search-filtering — insert search/filter panel here ===== */}

      {/* ===== FEATURE: tags — insert Manage Tags button + modal here ===== */}

      {/* ===== FEATURE: templates — insert Templates section here ===== */}

      {/* Add Todo Form */}
      <form
        onSubmit={handleAddTodo}
        className="mb-6 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg"
      >
        <h2 className="text-base font-semibold mb-3">Add Todo</h2>
        {formError && (
          <p className="text-sm text-red-500 mb-2">{formError}</p>
        )}
        <div className="space-y-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => { setNewTitle(e.target.value); setFormError(null); }}
            placeholder="Todo title…"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
            required
          />
          <div className="flex gap-2">
            <input
              type="datetime-local"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
            />
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as Priority)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          {/* ===== FEATURE: recurring-reminders — insert recurrence/reminder form fields here ===== */}
        </div>
        <button
          type="submit"
          className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md transition-colors"
        >
          Add Todo
        </button>
      </form>

      {/* Sections */}
      {overdue.length > 0 && (
        <Section
          title="Overdue"
          titleClass="text-red-600 dark:text-red-400"
          todos={overdue}
          onToggle={handleToggle}
          onDelete={handleDelete}
        />
      )}

      <Section
        title="Pending"
        titleClass="text-gray-700 dark:text-gray-300"
        todos={pending}
        onToggle={handleToggle}
        onDelete={handleDelete}
        emptyMessage="No pending todos — you're all caught up!"
      />

      {completed.length > 0 && (
        <Section
          title="Completed"
          titleClass="text-green-600 dark:text-green-400"
          todos={completed}
          onToggle={handleToggle}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

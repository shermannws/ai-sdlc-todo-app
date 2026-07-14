'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Todo, Tag, Priority } from '@/lib/db';

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
  allTags,
  onToggle,
  onDelete,
  onAttachTag,
  onDetachTag,
}: {
  todo: Todo;
  allTags: Tag[];
  onToggle: (todo: Todo) => void;
  onDelete: (id: number) => void;
  onAttachTag: (todoId: number, tagId: number) => void;
  onDetachTag: (todoId: number, tagId: number) => void;
}) {
  const attachedIds = new Set((todo.tags ?? []).map((t) => t.id));
  const unattached = allTags.filter((t) => !attachedIds.has(t.id));
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
          {(todo.tags ?? []).map((tag) => (
            <span
              key={tag.id}
              style={{ backgroundColor: tag.color }}
              className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs text-white"
            >
              {tag.name}
              <button
                onClick={() => onDetachTag(todo.id, tag.id)}
                className="ml-0.5 hover:opacity-70"
                aria-label={`Remove tag ${tag.name}`}
              >
                ×
              </button>
            </span>
          ))}
          {unattached.length > 0 && (
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  onAttachTag(todo.id, parseInt(e.target.value, 10));
                  e.target.value = '';
                }
              }}
              className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 bg-white dark:bg-gray-700"
              aria-label="Add tag to todo"
            >
              <option value="">+ tag</option>
              {unattached.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
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
  allTags,
  onToggle,
  onDelete,
  onAttachTag,
  onDetachTag,
  emptyMessage,
}: {
  title: string;
  titleClass: string;
  todos: Todo[];
  allTags: Tag[];
  onToggle: (todo: Todo) => void;
  onDelete: (id: number) => void;
  onAttachTag: (todoId: number, tagId: number) => void;
  onDetachTag: (todoId: number, tagId: number) => void;
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
            <TodoItem
              key={todo.id}
              todo={todo}
              allTags={allTags}
              onToggle={onToggle}
              onDelete={onDelete}
              onAttachTag={onAttachTag}
              onDetachTag={onDetachTag}
            />
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
  // ===== FEATURE: tags =====
  const [tags, setTags] = useState<Tag[]>([]);
  const [showManageTags, setShowManageTags] = useState(false);
  const [tagFormName, setTagFormName] = useState('');
  const [tagFormColor, setTagFormColor] = useState('#3B82F6');
  const [tagFormError, setTagFormError] = useState<string | null>(null);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
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
      await fetchTags();
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

  async function fetchTags() {
    const res = await fetch('/api/tags');
    if (res.ok) {
      const data: Tag[] = await res.json();
      setTags(data);
    }
  }

  async function handleCreateTag(e: React.FormEvent) {
    e.preventDefault();
    setTagFormError(null);
    const res = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tagFormName, color: tagFormColor }),
    });
    if (res.ok) {
      await fetchTags();
      setTagFormName('');
      setTagFormColor('#3B82F6');
    } else {
      const data = await res.json();
      setTagFormError(data.error ?? 'Failed to create tag');
    }
  }

  async function handleUpdateTag(tag: Tag) {
    const res = await fetch(`/api/tags/${tag.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, color: editColor }),
    });
    if (res.ok) {
      await fetchTags();
      await fetchTodos();
      setEditingTag(null);
    } else {
      const data = await res.json();
      setTagFormError(data.error ?? 'Failed to update tag');
    }
  }

  async function handleDeleteTag(id: number) {
    const res = await fetch(`/api/tags/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await fetchTags();
      await fetchTodos();
    }
  }

  async function handleAttachTag(todoId: number, tagId: number) {
    const res = await fetch(`/api/todos/${todoId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagId }),
    });
    if (res.ok) await fetchTodos();
  }

  async function handleDetachTag(todoId: number, tagId: number) {
    const res = await fetch(`/api/todos/${todoId}/tags`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagId }),
    });
    if (res.ok) await fetchTodos();
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

      {/* Manage Tags */}
      <div className="mb-4">
        <button
          onClick={() => { setShowManageTags(true); setTagFormError(null); }}
          className="text-sm px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          🏷 Manage Tags
        </button>
      </div>

      {showManageTags && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Manage Tags</h2>
              <button
                onClick={() => { setShowManageTags(false); setEditingTag(null); setTagFormError(null); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {tagFormError && (
              <p className="text-sm text-red-500 mb-3">{tagFormError}</p>
            )}

            {/* Existing tags */}
            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
              {tags.length === 0 && (
                <p className="text-sm text-gray-400">No tags yet.</p>
              )}
              {tags.map((tag) => (
                <div key={tag.id} className="flex items-center gap-2">
                  {editingTag?.id === tag.id ? (
                    <>
                      <input
                        type="color"
                        value={editColor}
                        onChange={(e) => setEditColor(e.target.value)}
                        className="h-7 w-7 rounded cursor-pointer border-0 p-0"
                      />
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                        maxLength={50}
                      />
                      <button
                        onClick={() => handleUpdateTag(tag)}
                        className="text-sm px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setEditingTag(null); setTagFormError(null); }}
                        className="text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span
                        style={{ backgroundColor: tag.color }}
                        className="h-5 w-5 rounded-full flex-shrink-0"
                      />
                      <span className="flex-1 text-sm">{tag.name}</span>
                      <button
                        onClick={() => { setEditingTag(tag); setEditName(tag.name); setEditColor(tag.color); setTagFormError(null); }}
                        className="text-gray-400 hover:text-blue-500 text-sm px-1"
                        aria-label={`Edit tag ${tag.name}`}
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => handleDeleteTag(tag.id)}
                        className="text-gray-400 hover:text-red-500 text-sm px-1"
                        aria-label={`Delete tag ${tag.name}`}
                      >
                        🗑
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Add tag form */}
            <form onSubmit={handleCreateTag} className="flex items-center gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
              <input
                type="color"
                value={tagFormColor}
                onChange={(e) => setTagFormColor(e.target.value)}
                className="h-8 w-8 rounded cursor-pointer border-0 p-0"
                aria-label="Tag color"
              />
              <input
                type="text"
                value={tagFormName}
                onChange={(e) => { setTagFormName(e.target.value); setTagFormError(null); }}
                placeholder="Tag name…"
                maxLength={50}
                className="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                required
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
              >
                Create
              </button>
            </form>
          </div>
        </div>
      )}

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
          allTags={tags}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onAttachTag={handleAttachTag}
          onDetachTag={handleDetachTag}
        />
      )}

      <Section
        title="Pending"
        titleClass="text-gray-700 dark:text-gray-300"
        todos={pending}
        allTags={tags}
        onToggle={handleToggle}
        onDelete={handleDelete}
        onAttachTag={handleAttachTag}
        onDetachTag={handleDetachTag}
        emptyMessage="No pending todos — you're all caught up!"
      />

      {completed.length > 0 && (
        <Section
          title="Completed"
          titleClass="text-green-600 dark:text-green-400"
          todos={completed}
          allTags={tags}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onAttachTag={handleAttachTag}
          onDetachTag={handleDetachTag}
        />
      )}
    </div>
  );
}

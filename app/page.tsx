'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Todo, Priority, Template, RecurrencePattern, Subtask } from '@/lib/db';

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
  isExpanded,
  subtaskInput,
  onToggleExpand,
  onSubtaskInputChange,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
}: {
  todo: Todo;
  onToggle: (todo: Todo) => void;
  onDelete: (id: number) => void;
  isExpanded: boolean;
  subtaskInput: string;
  onToggleExpand: (todoId: number) => void;
  onSubtaskInputChange: (todoId: number, value: string) => void;
  onAddSubtask: (todoId: number) => void;
  onToggleSubtask: (subtask: Subtask) => void;
  onDeleteSubtask: (subtaskId: number) => void;
}) {
  const subtasks = todo.subtasks ?? [];
  const completedCount = subtasks.filter((subtask) => subtask.completed).length;
  const totalCount = subtasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const progressColor = progressPercent === 100 ? '#22C55E' : '#3B82F6';

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
        <div className="mt-2">
          {totalCount > 0 && (
            <div className="mb-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{completedCount}/{totalCount} subtasks</p>
              <div
                className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
              >
                <div
                  className="h-full transition-all"
                  style={{ width: `${progressPercent}%`, backgroundColor: progressColor }}
                />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => onToggleExpand(todo.id)}
            className="text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
            aria-expanded={isExpanded}
            aria-label={`Toggle subtasks for ${todo.title}`}
          >
            {isExpanded ? '▼' : '▶'} Subtasks ({totalCount})
          </button>

          {isExpanded && (
            <div className="mt-2 space-y-2">
              {subtasks.map((subtask) => (
                <div key={subtask.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={subtask.completed}
                    onChange={() => onToggleSubtask(subtask)}
                    className="h-4 w-4 rounded border-gray-300 accent-blue-600"
                    aria-label={`Toggle subtask ${subtask.title}`}
                  />
                  <span
                    className={`flex-1 text-gray-700 dark:text-gray-200 ${
                      subtask.completed ? 'line-through text-gray-400 dark:text-gray-500' : ''
                    }`}
                  >
                    {subtask.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteSubtask(subtask.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    aria-label={`Delete subtask ${subtask.title}`}
                  >
                    ✕
                  </button>
                </div>
              ))}

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={subtaskInput}
                  onChange={(e) => onSubtaskInputChange(todo.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onAddSubtask(todo.id);
                    }
                  }}
                  placeholder="Add subtask…"
                  className="flex-1 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                  aria-label={`Add subtask for ${todo.title}`}
                />
                <button
                  type="button"
                  onClick={() => onAddSubtask(todo.id)}
                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
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
  expandedTodos,
  subtaskInputs,
  onToggleExpand,
  onSubtaskInputChange,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  emptyMessage,
}: {
  title: string;
  titleClass: string;
  todos: Todo[];
  onToggle: (todo: Todo) => void;
  onDelete: (id: number) => void;
  expandedTodos: Set<number>;
  subtaskInputs: Record<number, string>;
  onToggleExpand: (todoId: number) => void;
  onSubtaskInputChange: (todoId: number, value: string) => void;
  onAddSubtask: (todoId: number) => void;
  onToggleSubtask: (subtask: Subtask) => void;
  onDeleteSubtask: (subtaskId: number) => void;
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
              onToggle={onToggle}
              onDelete={onDelete}
              isExpanded={expandedTodos.has(todo.id)}
              subtaskInput={subtaskInputs[todo.id] ?? ''}
              onToggleExpand={onToggleExpand}
              onSubtaskInputChange={onSubtaskInputChange}
              onAddSubtask={onAddSubtask}
              onToggleSubtask={onToggleSubtask}
              onDeleteSubtask={onDeleteSubtask}
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
  const [expandedTodos, setExpandedTodos] = useState<Set<number>>(new Set());
  const [subtaskInputs, setSubtaskInputs] = useState<Record<number, string>>({});

  // ===== FEATURE: recurring-reminders — insert recurrence/reminder state here =====
  // ===== FEATURE: search-filtering — insert filter state here =====
  // ===== FEATURE: tags — insert tag state here =====

  // Template state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateForm, setTemplateForm] = useState<{
    name: string;
    description: string;
    category: string;
    title_template: string;
    priority: Priority;
    is_recurring: boolean;
    recurrence_pattern: RecurrencePattern | '';
    reminder_minutes: string;
    due_date_offset_minutes: string;
    subtasks: string[];
  }>({
    name: '',
    description: '',
    category: '',
    title_template: '',
    priority: 'medium',
    is_recurring: false,
    recurrence_pattern: '',
    reminder_minutes: '',
    due_date_offset_minutes: '',
    subtasks: [],
  });
  const [templateFormError, setTemplateFormError] = useState<string | null>(null);

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
      await fetchTemplates();
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

  async function fetchTemplates() {
    const res = await fetch('/api/templates');
    if (res.ok) {
      const data: Template[] = await res.json();
      setTemplates(data);
    }
  }

  function openCreateTemplate() {
    setEditingTemplate(null);
    setTemplateForm({
      name: '',
      description: '',
      category: '',
      title_template: '',
      priority: 'medium',
      is_recurring: false,
      recurrence_pattern: '',
      reminder_minutes: '',
      due_date_offset_minutes: '',
      subtasks: [],
    });
    setTemplateFormError(null);
    setShowTemplateModal(true);
  }

  function openEditTemplate(template: Template) {
    setEditingTemplate(template);
    const subtasks: string[] = template.subtasks_json
      ? (JSON.parse(template.subtasks_json) as { title: string }[]).map((s) => s.title)
      : [];
    setTemplateForm({
      name: template.name,
      description: template.description ?? '',
      category: template.category ?? '',
      title_template: template.title_template,
      priority: template.priority,
      is_recurring: template.is_recurring,
      recurrence_pattern: template.recurrence_pattern ?? '',
      reminder_minutes: template.reminder_minutes != null ? String(template.reminder_minutes) : '',
      due_date_offset_minutes:
        template.due_date_offset_minutes != null ? String(template.due_date_offset_minutes) : '',
      subtasks,
    });
    setTemplateFormError(null);
    setShowTemplateModal(true);
  }

  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault();
    setTemplateFormError(null);

    const payload = {
      name: templateForm.name.trim(),
      description: templateForm.description.trim() || null,
      category: templateForm.category.trim() || null,
      title_template: templateForm.title_template.trim(),
      priority: templateForm.priority,
      is_recurring: templateForm.is_recurring,
      recurrence_pattern: templateForm.is_recurring ? templateForm.recurrence_pattern || null : null,
      reminder_minutes: templateForm.reminder_minutes ? parseInt(templateForm.reminder_minutes, 10) : null,
      due_date_offset_minutes: templateForm.due_date_offset_minutes
        ? parseInt(templateForm.due_date_offset_minutes, 10)
        : null,
      subtasks: templateForm.subtasks
        .map((s) => s.trim())
        .filter(Boolean)
        .map((title) => ({ title })),
    };

    const url = editingTemplate ? `/api/templates/${editingTemplate.id}` : '/api/templates';
    const method = editingTemplate ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      await fetchTemplates();
      setShowTemplateModal(false);
    } else {
      const data = await res.json();
      setTemplateFormError(data.error ?? 'Failed to save template');
    }
  }

  async function handleDeleteTemplate(id: number) {
    const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    }
  }

  async function handleUseTemplate(id: number) {
    const res = await fetch(`/api/templates/${id}/use`, { method: 'POST' });
    if (res.ok) {
      await fetchTodos();
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

  function handleToggleExpand(todoId: number) {
    setExpandedTodos((prev) => {
      const next = new Set(prev);
      if (next.has(todoId)) {
        next.delete(todoId);
      } else {
        next.add(todoId);
      }
      return next;
    });
  }

  function handleSubtaskInputChange(todoId: number, value: string) {
    setSubtaskInputs((prev) => ({
      ...prev,
      [todoId]: value,
    }));
  }

  async function handleAddSubtask(todoId: number) {
    const title = (subtaskInputs[todoId] ?? '').trim();
    if (!title) return;

    const res = await fetch(`/api/todos/${todoId}/subtasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });

    if (res.ok) {
      setSubtaskInputs((prev) => ({
        ...prev,
        [todoId]: '',
      }));
      await fetchTodos();
    }
  }

  async function handleToggleSubtask(subtask: Subtask) {
    const res = await fetch(`/api/subtasks/${subtask.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !subtask.completed }),
    });

    if (res.ok) {
      await fetchTodos();
    }
  }

  async function handleDeleteSubtask(subtaskId: number) {
    const res = await fetch(`/api/subtasks/${subtaskId}`, { method: 'DELETE' });
    if (res.ok) {
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

      {/* Templates Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setShowTemplates((v) => !v)}
            className="text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
          >
            {showTemplates ? '▼' : '▶'} Templates ({templates.length})
          </button>
          <button
            onClick={openCreateTemplate}
            className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            + New Template
          </button>
        </div>

        {showTemplates && (
          <div className="space-y-2">
            {templates.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500">No templates yet.</p>
            )}
            {templates.map((tmpl) => (
              <div
                key={tmpl.id}
                className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{tmpl.name}</span>
                  {tmpl.category && (
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">[{tmpl.category}]</span>
                  )}
                  {tmpl.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{tmpl.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleUseTemplate(tmpl.id)}
                    className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                    aria-label={`Use template "${tmpl.name}"`}
                  >
                    Use
                  </button>
                  <button
                    onClick={() => openEditTemplate(tmpl)}
                    className="text-gray-400 hover:text-blue-500 transition-colors text-sm"
                    aria-label={`Edit template "${tmpl.name}"`}
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(tmpl.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors text-sm"
                    aria-label={`Delete template "${tmpl.name}"`}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-lg font-semibold mb-4">
              {editingTemplate ? 'Edit Template' : 'New Template'}
            </h2>
            <form onSubmit={handleSaveTemplate} className="space-y-3">
              {templateFormError && (
                <p className="text-sm text-red-500">{templateFormError}</p>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Template name *
                </label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={templateForm.category}
                  onChange={(e) => setTemplateForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                  placeholder="e.g. Work, Personal"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={templateForm.description}
                  onChange={(e) => setTemplateForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Todo title template *
                </label>
                <input
                  type="text"
                  value={templateForm.title_template}
                  onChange={(e) => setTemplateForm((f) => ({ ...f, title_template: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Priority
                </label>
                <select
                  value={templateForm.priority}
                  onChange={(e) =>
                    setTemplateForm((f) => ({ ...f, priority: e.target.value as Priority }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="tmpl-recurring"
                  checked={templateForm.is_recurring}
                  onChange={(e) =>
                    setTemplateForm((f) => ({ ...f, is_recurring: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-300 accent-blue-600"
                />
                <label htmlFor="tmpl-recurring" className="text-sm text-gray-700 dark:text-gray-300">
                  Recurring
                </label>
              </div>
              {templateForm.is_recurring && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Recurrence pattern *
                  </label>
                  <select
                    value={templateForm.recurrence_pattern}
                    onChange={(e) =>
                      setTemplateForm((f) => ({
                        ...f,
                        recurrence_pattern: e.target.value as RecurrencePattern | '',
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                    required
                  >
                    <option value="">Select…</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Reminder
                </label>
                <select
                  value={templateForm.reminder_minutes}
                  onChange={(e) =>
                    setTemplateForm((f) => ({ ...f, reminder_minutes: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                >
                  <option value="">None</option>
                  <option value="15">15 minutes before</option>
                  <option value="30">30 minutes before</option>
                  <option value="60">1 hour before</option>
                  <option value="120">2 hours before</option>
                  <option value="1440">1 day before</option>
                  <option value="2880">2 days before</option>
                  <option value="10080">1 week before</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Due date offset (minutes from now when used)
                </label>
                <input
                  type="number"
                  value={templateForm.due_date_offset_minutes}
                  onChange={(e) =>
                    setTemplateForm((f) => ({ ...f, due_date_offset_minutes: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                  placeholder="Leave blank for no due date"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Subtasks
                </label>
                <div className="space-y-1">
                  {templateForm.subtasks.map((st, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        value={st}
                        onChange={(e) => {
                          const updated = [...templateForm.subtasks];
                          updated[idx] = e.target.value;
                          setTemplateForm((f) => ({ ...f, subtasks: updated }));
                        }}
                        className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                        placeholder={`Subtask ${idx + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setTemplateForm((f) => ({
                            ...f,
                            subtasks: f.subtasks.filter((_, i) => i !== idx),
                          }));
                        }}
                        className="text-gray-400 hover:text-red-500 text-sm px-1"
                        aria-label={`Remove subtask ${idx + 1}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setTemplateForm((f) => ({ ...f, subtasks: [...f.subtasks, ''] }))
                    }
                    className="text-xs text-blue-600 hover:text-blue-700 mt-1"
                  >
                    + Add subtask
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {editingTemplate ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
          expandedTodos={expandedTodos}
          subtaskInputs={subtaskInputs}
          onToggleExpand={handleToggleExpand}
          onSubtaskInputChange={handleSubtaskInputChange}
          onAddSubtask={handleAddSubtask}
          onToggleSubtask={handleToggleSubtask}
          onDeleteSubtask={handleDeleteSubtask}
        />
      )}

      <Section
        title="Pending"
        titleClass="text-gray-700 dark:text-gray-300"
        todos={pending}
        onToggle={handleToggle}
        onDelete={handleDelete}
        expandedTodos={expandedTodos}
        subtaskInputs={subtaskInputs}
        onToggleExpand={handleToggleExpand}
        onSubtaskInputChange={handleSubtaskInputChange}
        onAddSubtask={handleAddSubtask}
        onToggleSubtask={handleToggleSubtask}
        onDeleteSubtask={handleDeleteSubtask}
        emptyMessage="No pending todos — you're all caught up!"
      />

      {completed.length > 0 && (
        <Section
          title="Completed"
          titleClass="text-green-600 dark:text-green-400"
          todos={completed}
          onToggle={handleToggle}
          onDelete={handleDelete}
          expandedTodos={expandedTodos}
          subtaskInputs={subtaskInputs}
          onToggleExpand={handleToggleExpand}
          onSubtaskInputChange={handleSubtaskInputChange}
          onAddSubtask={handleAddSubtask}
          onToggleSubtask={handleToggleSubtask}
          onDeleteSubtask={handleDeleteSubtask}
        />
      )}
    </div>
  );
}

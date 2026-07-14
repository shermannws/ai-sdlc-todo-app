'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Todo, Tag, Priority, Template, RecurrencePattern, Subtask } from '@/lib/db';
import { useNotifications } from '@/lib/hooks/useNotifications';

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<Priority, string> = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#3B82F6',
};

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
const REMINDER_LABELS: Record<number, string> = {
  15: '15m',
  30: '30m',
  60: '1h',
  120: '2h',
  1440: '1d',
  2880: '2d',
  10080: '1w',
};

function getReminderLabel(minutes: number | null): string | null {
  if (!minutes) return null;
  return REMINDER_LABELS[minutes] ?? `${minutes}m`;
}

function getSingaporeNowLocalISO(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

interface FilterState {
  search: string;
  priority: Priority | '';
  tagId: number | null;
  completion: 'all' | 'active' | 'completed';
  dueDateFrom: string | null;
  dueDateTo: string | null;
}

const DEFAULT_FILTER: FilterState = {
  search: '',
  priority: '',
  tagId: null,
  completion: 'all',
  dueDateFrom: null,
  dueDateTo: null,
};

interface FilterPreset {
  id: string;
  name: string;
  filters: FilterState;
  createdAt: string;
}

const FILTER_PRESETS_KEY = 'todo-app:filter-presets';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

function loadPresets(): FilterPreset[] {
  try {
    if (typeof window === 'undefined') return [];

    const raw = localStorage.getItem(FILTER_PRESETS_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((preset): preset is FilterPreset => {
      return Boolean(
        preset &&
          typeof preset === 'object' &&
          typeof preset.id === 'string' &&
          typeof preset.name === 'string' &&
          typeof preset.createdAt === 'string' &&
          typeof preset.filters === 'object'
      );
    });
  } catch {
    return [];
  }
}

function savePresets(presets: FilterPreset[]): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(FILTER_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // Presets are non-critical and should not break the page.
  }
}

function applyFilters(todos: Todo[], filters: FilterState): Todo[] {
  let result = todos;

  if (filters.search.trim()) {
    const query = filters.search.trim().toLowerCase();
    result = result.filter(
      (todo) =>
        todo.title.toLowerCase().includes(query) ||
        (todo.subtasks ?? []).some((subtask) => subtask.title.toLowerCase().includes(query))
    );
  }

  if (filters.priority) {
    result = result.filter((todo) => todo.priority === filters.priority);
  }

  if (filters.tagId !== null) {
    result = result.filter((todo) => (todo.tags ?? []).some((tag) => tag.id === filters.tagId));
  }

  if (filters.completion === 'active') {
    result = result.filter((todo) => !todo.completed);
  } else if (filters.completion === 'completed') {
    result = result.filter((todo) => todo.completed);
  }

  if (filters.dueDateFrom) {
    result = result.filter((todo) => !todo.due_date || todo.due_date.slice(0, 10) >= filters.dueDateFrom!);
  }

  if (filters.dueDateTo) {
    result = result.filter((todo) => !todo.due_date || todo.due_date.slice(0, 10) <= filters.dueDateTo!);
  }

  return result;
}

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
  isExpanded,
  subtaskInput,
  onToggleExpand,
  onSubtaskInputChange,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onAttachTag,
  onDetachTag,
}: {
  todo: Todo;
  allTags: Tag[];
  onToggle: (todo: Todo) => void;
  onDelete: (id: number) => void;
  isExpanded: boolean;
  subtaskInput: string;
  onToggleExpand: (todoId: number) => void;
  onSubtaskInputChange: (todoId: number, value: string) => void;
  onAddSubtask: (todoId: number) => void;
  onToggleSubtask: (subtask: Subtask) => void;
  onDeleteSubtask: (subtaskId: number) => void;
  onAttachTag: (todoId: number, tagId: number) => void;
  onDetachTag: (todoId: number, tagId: number) => void;
}) {
  const attachedIds = new Set((todo.tags ?? []).map((t) => t.id));
  const unattached = allTags.filter((t) => !attachedIds.has(t.id));
  const subtasks = todo.subtasks ?? [];
  const completedCount = subtasks.filter((subtask) => subtask.completed).length;
  const totalCount = subtasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const progressColor = progressPercent === 100 ? '#22C55E' : '#3B82F6';

  return (
    <div
      data-todo-id={todo.id}
      className={`p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg flex items-start gap-3 ${
        todo.completed ? 'opacity-60' : ''
      }`}
    >
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={() => onToggle(todo)}
        aria-label={`Toggle completion for "${todo.title}"`}
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
          {todo.is_recurring && todo.recurrence_pattern && (
            <span className="px-2 py-0.5 rounded-full text-xs text-white font-medium bg-[#A855F7] dark:bg-[#C084FC]">
              🔄 {todo.recurrence_pattern}
            </span>
          )}
          {todo.reminder_minutes && (
            <span className="px-2 py-0.5 rounded-full text-xs text-white font-medium bg-amber-500 dark:bg-amber-400">
              🔔 {getReminderLabel(todo.reminder_minutes)}
            </span>
          )}
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
  allTags,
  onToggle,
  onDelete,
  expandedTodos,
  subtaskInputs,
  onToggleExpand,
  onSubtaskInputChange,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
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
  expandedTodos: Set<number>;
  subtaskInputs: Record<number, string>;
  onToggleExpand: (todoId: number) => void;
  onSubtaskInputChange: (todoId: number, value: string) => void;
  onAddSubtask: (todoId: number) => void;
  onToggleSubtask: (subtask: Subtask) => void;
  onDeleteSubtask: (subtaskId: number) => void;
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
              onToggle={onToggle}
              onDelete={onDelete}
              isExpanded={expandedTodos.has(todo.id)}
              subtaskInput={subtaskInputs[todo.id] ?? ''}
              onToggleExpand={onToggleExpand}
              onSubtaskInputChange={onSubtaskInputChange}
              onAddSubtask={onAddSubtask}
              onToggleSubtask={onToggleSubtask}
              onDeleteSubtask={onDeleteSubtask}
              allTags={allTags}
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
  const [showFilters, setShowFilters] = useState(false);
  const [filterState, setFilterState] = useState<FilterState>(DEFAULT_FILTER);
  const [searchInput, setSearchInput] = useState('');
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>([]);
  const [filterPresetName, setFilterPresetName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetsLoaded, setPresetsLoaded] = useState(false);

  // Add-todo form state
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('medium');
  const [expandedTodos, setExpandedTodos] = useState<Set<number>>(new Set());
  const [subtaskInputs, setSubtaskInputs] = useState<Record<number, string>>({});

  const [newIsRecurring, setNewIsRecurring] = useState(false);
  const [newRecurrencePattern, setNewRecurrencePattern] = useState<RecurrencePattern>('daily');
  const [newReminderMinutes, setNewReminderMinutes] = useState('');
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

  useNotifications();

  // Export / Import state
  const [showExportMenu, setShowExportMenu] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useDebounce(searchInput, 300);

  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setFilterPresets(loadPresets());
    setPresetsLoaded(true);
  }, []);

  useEffect(() => {
    if (!presetsLoaded) return;
    savePresets(filterPresets);
  }, [filterPresets, presetsLoaded]);

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

    if (newIsRecurring && !newDueDate) {
      setFormError('Recurring todos require a due date');
      return;
    }

    if (newReminderMinutes && !newDueDate) {
      setFormError('Reminder requires a due date');
      return;
    }

    const res = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: trimmed,
        due_date: newDueDate || null,
        priority: newPriority,
        is_recurring: newIsRecurring,
        recurrence_pattern: newIsRecurring ? newRecurrencePattern : null,
        reminder_minutes: newReminderMinutes ? Number(newReminderMinutes) : null,
      }),
    });

    if (res.ok) {
      const created: Todo = await res.json();
      setTodos((prev) => [...prev, created]);
      setNewTitle('');
      setNewDueDate('');
      setNewPriority('medium');
      setNewIsRecurring(false);
      setNewRecurrencePattern('daily');
      setNewReminderMinutes('');
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

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await fetch('/api/todos/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await fetchTodos();
      } else {
        const err = await res.json();
        setFormError(err.error ?? 'Import failed');
      }
    } catch {
      setFormError('Failed to read or parse the import file');
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  function clearFilters() {
    setSearchInput('');
    setFilterState(DEFAULT_FILTER);
    setSelectedPresetId('');
    setFilterPresetName('');
  }

  function saveCurrentPreset() {
    const name = filterPresetName.trim();
    if (!name) return;

    const nextPreset: FilterPreset = {
      id: globalThis.crypto?.randomUUID?.() ?? Date.now().toString(),
      name,
      filters: { ...filterState, search: searchInput },
      createdAt: new Date().toISOString(),
    };

    setFilterPresets((prev) => [...prev, nextPreset]);
    setSelectedPresetId(nextPreset.id);
    setFilterPresetName('');
  }

  function loadPresetById(presetId: string) {
    setSelectedPresetId(presetId);

    if (!presetId) {
      return;
    }

    const preset = filterPresets.find((entry) => entry.id === presetId);
    if (!preset) return;

    setFilterState(preset.filters);
    setSearchInput(preset.filters.search);
    setFilterPresetName(preset.name);
  }

  function deleteSelectedPreset() {
    if (!selectedPresetId) return;

    setFilterPresets((prev) => prev.filter((preset) => preset.id !== selectedPresetId));
    setSelectedPresetId('');
    setFilterPresetName('');
  }

  function updateSearch(value: string) {
    setSearchInput(value);
    setFilterState((prev) => ({ ...prev, search: value }));
    setSelectedPresetId('');
  }

  function updateFilterState(updater: (current: FilterState) => FilterState) {
    setFilterState((current) => updater(current));
    setSelectedPresetId('');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <span className="text-gray-500">Loading…</span>
      </div>
    );
  }

  const availableTags = Array.from(
    new Map<number, Tag>(todos.flatMap((todo) => todo.tags ?? []).map((tag) => [tag.id, tag] as const)).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const visibleTodos = applyFilters(todos, { ...filterState, search: debouncedSearch });

  const now = getSingaporeNowLocalISO();
  const overdue = visibleTodos.filter((t) => !t.completed && t.due_date && t.due_date < now).sort(sortTodos);
  const pending = visibleTodos.filter((t) => !t.completed && (!t.due_date || t.due_date >= now)).sort(sortTodos);
  const completed = visibleTodos
    .filter((t) => t.completed)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="max-w-2xl mx-auto p-4 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">My Todos</h1>
          {username && <p className="text-sm text-gray-500 dark:text-gray-400">Logged in as {username}</p>}
        </div>
        <div className="flex items-center gap-3">
          {/* Calendar link */}
          <Link
            href="/calendar"
            className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Calendar
          </Link>
          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu((prev) => !prev)}
              className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Export ▾
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-10">
                <button
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => { setShowExportMenu(false); window.location.href = '/api/todos/export?format=json'; }}
                >
                  Export as JSON
                </button>
                <button
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => { setShowExportMenu(false); window.location.href = '/api/todos/export?format=csv'; }}
                >
                  Export as CSV
                </button>
              </div>
            )}
          </div>
          {/* Import */}
          <button
            onClick={() => importInputRef.current?.click()}
            className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Import
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Filters</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Search, narrow, and save the current view.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((current) => !current)}
            className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {showFilters ? 'Hide filters' : 'Show filters'}
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label htmlFor="filter-search" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Search
                </label>
                <input
                  id="filter-search"
                  type="search"
                  value={searchInput}
                  onChange={(e) => updateSearch(e.target.value)}
                  placeholder="Search titles or subtasks…"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={clearFilters}
                className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Clear filters
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label htmlFor="filter-priority" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Priority
                </label>
                <select
                  id="filter-priority"
                  value={filterState.priority}
                  onChange={(e) => {
                    const nextPriority = e.target.value as Priority | '';
                    updateFilterState((current) => ({ ...current, priority: nextPriority }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                >
                  <option value="">All</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              <div>
                <label htmlFor="filter-tag" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Tag
                </label>
                <select
                  id="filter-tag"
                  value={filterState.tagId === null ? '' : String(filterState.tagId)}
                  onChange={(e) => {
                    const nextTagId = e.target.value ? Number(e.target.value) : null;
                    updateFilterState((current) => ({ ...current, tagId: nextTagId }));
                  }}
                  disabled={availableTags.length === 0}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm disabled:opacity-60"
                >
                  <option value="">All</option>
                  {availableTags.length === 0 ? <option value="">No tags available</option> : null}
                  {availableTags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="filter-completion" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Completion
                </label>
                <select
                  id="filter-completion"
                  value={filterState.completion}
                  onChange={(e) => {
                    const nextCompletion = e.target.value as FilterState['completion'];
                    updateFilterState((current) => ({ ...current, completion: nextCompletion }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="filter-due-from" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Due from
                </label>
                <input
                  id="filter-due-from"
                  type="date"
                  value={filterState.dueDateFrom ?? ''}
                  onChange={(e) => {
                    const nextDueDateFrom = e.target.value || null;
                    updateFilterState((current) => ({ ...current, dueDateFrom: nextDueDateFrom }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                />
              </div>

              <div>
                <label htmlFor="filter-due-to" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Due to
                </label>
                <input
                  id="filter-due-to"
                  type="date"
                  value={filterState.dueDateTo ?? ''}
                  onChange={(e) => {
                    const nextDueDateTo = e.target.value || null;
                    updateFilterState((current) => ({ ...current, dueDateTo: nextDueDateTo }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]">
              <div>
                <label htmlFor="filter-preset-name" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Preset name
                </label>
                <input
                  id="filter-preset-name"
                  type="text"
                  value={filterPresetName}
                  onChange={(e) => setFilterPresetName(e.target.value)}
                  placeholder="My filter"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                />
              </div>

              <button
                type="button"
                onClick={saveCurrentPreset}
                className="self-end px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
              >
                Save preset
              </button>

              <div>
                <label htmlFor="saved-presets" className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Saved presets
                </label>
                <select
                  id="saved-presets"
                  value={selectedPresetId}
                  onChange={(e) => loadPresetById(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
                >
                  <option value="">Select a preset</option>
                  {filterPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={deleteSelectedPreset}
                disabled={!selectedPresetId}
                className="self-end px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Delete preset
              </button>
            </div>
          </div>
        )}
      </div>

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
                        aria-label="Rename tag"
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
                <label htmlFor="template-name" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Template name *
                </label>
                <input
                  id="template-name"
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
                <label htmlFor="template-title-template" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Todo title template *
                </label>
                <input
                  id="template-title-template"
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
              onChange={(e) => {
                const value = e.target.value;
                setNewDueDate(value);
                if (!value) setNewReminderMinutes('');
              }}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
            />
            <select
              aria-label="Priority"
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as Priority)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
            >
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={newIsRecurring}
                onChange={(e) => setNewIsRecurring(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-blue-600"
              />
              Repeat
            </label>
            {newIsRecurring && (
              <select
                aria-label="Repeat pattern"
                value={newRecurrencePattern}
                onChange={(e) => setNewRecurrencePattern(e.target.value as RecurrencePattern)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
              >
                <option value="daily">daily</option>
                <option value="weekly">weekly</option>
                <option value="monthly">monthly</option>
                <option value="yearly">yearly</option>
              </select>
            )}
          </div>
          <div>
            <label htmlFor="reminder-select" className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
              Reminder
            </label>
            <select
              id="reminder-select"
              aria-label="Reminder"
              value={newReminderMinutes}
              onChange={(e) => setNewReminderMinutes(e.target.value)}
              disabled={!newDueDate}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white disabled:bg-gray-100 dark:bg-gray-700 dark:disabled:bg-gray-800 text-sm disabled:text-gray-400"
            >
              <option value="">none</option>
              <option value="15">15m</option>
              <option value="30">30m</option>
              <option value="60">1h</option>
              <option value="120">2h</option>
              <option value="1440">1d</option>
              <option value="2880">2d</option>
              <option value="10080">1w</option>
            </select>
          </div>
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
          expandedTodos={expandedTodos}
          subtaskInputs={subtaskInputs}
          onToggleExpand={handleToggleExpand}
          onSubtaskInputChange={handleSubtaskInputChange}
          onAddSubtask={handleAddSubtask}
          onToggleSubtask={handleToggleSubtask}
          onDeleteSubtask={handleDeleteSubtask}
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
        expandedTodos={expandedTodos}
        subtaskInputs={subtaskInputs}
        onToggleExpand={handleToggleExpand}
        onSubtaskInputChange={handleSubtaskInputChange}
        onAddSubtask={handleAddSubtask}
        onToggleSubtask={handleToggleSubtask}
        onDeleteSubtask={handleDeleteSubtask}
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
          expandedTodos={expandedTodos}
          subtaskInputs={subtaskInputs}
          onToggleExpand={handleToggleExpand}
          onSubtaskInputChange={handleSubtaskInputChange}
          onAddSubtask={handleAddSubtask}
          onToggleSubtask={handleToggleSubtask}
          onDeleteSubtask={handleDeleteSubtask}
          onAttachTag={handleAttachTag}
          onDetachTag={handleDetachTag}
        />
      )}
    </div>
  );
}

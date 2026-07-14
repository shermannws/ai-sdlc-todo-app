'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Todo, Holiday } from '@/lib/db';
import { getSingaporeDateString } from '@/lib/timezone';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarDay {
  date: string;           // YYYY-MM-DD, Singapore local
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isPast: boolean;        // date < today (Singapore)
  isWeekend: boolean;     // Saturday or Sunday
  todos: Todo[];
  holiday: Holiday | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-400',
  low: 'bg-blue-500',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Parse ?month=YYYY-MM search param.
 * Returns [year, month] where month is 0-indexed.
 * Falls back to current Singapore month on invalid input.
 */
function parseMonthParam(param: string | null): [number, number] {
  if (param) {
    const match = /^(\d{4})-(\d{2})$/.exec(param);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1; // 0-indexed
      if (year >= 1970 && year <= 2100 && month >= 0 && month <= 11) {
        return [year, month];
      }
    }
  }
  // Fallback: current Singapore month
  const todayStr = getSingaporeDateString();
  const parts = todayStr.split('-');
  return [parseInt(parts[0], 10), parseInt(parts[1], 10) - 1];
}

/**
 * Build a 5- or 6-row × 7-column calendar grid.
 * month is 0-indexed (JavaScript Date convention).
 */
function generateCalendarGrid(
  year: number,
  month: number,
  todos: Todo[],
  holidays: Holiday[],
  todayStr: string
): CalendarDay[][] {
  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay(); // 0=Sun … 6=Sat
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  function makeCell(d: Date, isCurrentMonth: boolean): CalendarDay {
    const dateStr = toDateStr(d);
    const dow = d.getDay();
    return {
      date: dateStr,
      dayNumber: d.getDate(),
      isCurrentMonth,
      isToday: dateStr === todayStr,
      isPast: dateStr < todayStr,
      isWeekend: dow === 0 || dow === 6,
      todos: todos.filter((t) => t.due_date?.slice(0, 10) === dateStr),
      holiday: holidays.find((h) => h.date === dateStr) ?? null,
    };
  }

  const cells: CalendarDay[] = [];

  // Leading cells from previous month
  for (let i = startDow - 1; i >= 0; i--) {
    cells.push(makeCell(new Date(year, month, -i), false));
  }

  // Current month
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(makeCell(new Date(year, month, day), true));
  }

  // Trailing cells to fill to 35 (5 rows) or 42 (6 rows)
  const target = cells.length <= 35 ? 35 : 42;
  let trailing = 1;
  while (cells.length < target) {
    cells.push(makeCell(new Date(year, month + 1, trailing++), false));
  }

  // Chunk into rows of 7
  const grid: CalendarDay[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    grid.push(cells.slice(i, i + 7));
  }
  return grid;
}

// ─── Calendar app (uses useSearchParams) ─────────────────────────────────────

function CalendarApp() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [currentYear, setCurrentYear] = useState<number>(() => {
    return parseMonthParam(searchParams.get('month'))[0];
  });
  const [currentMonth, setCurrentMonth] = useState<number>(() => {
    return parseMonthParam(searchParams.get('month'))[1];
  });

  const [todos, setTodos] = useState<Todo[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [todayStr] = useState(() => getSingaporeDateString());

  // Sync year/month from URL on navigation
  useEffect(() => {
    const [y, m] = parseMonthParam(searchParams.get('month'));
    setCurrentYear(y);
    setCurrentMonth(m);
  }, [searchParams]);

  // Fetch todos and holidays once on mount
  useEffect(() => {
    async function fetchData() {
      const [todosRes, holidaysRes] = await Promise.all([
        fetch('/api/todos'),
        fetch('/api/holidays'),
      ]);
      if (todosRes.ok) setTodos(await todosRes.json());
      if (holidaysRes.ok) setHolidays(await holidaysRes.json());
    }
    fetchData();
  }, []);

  const navigateMonth = useCallback(
    (direction: 'prev' | 'next') => {
      let m = currentMonth + (direction === 'next' ? 1 : -1);
      let y = currentYear;
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      const monthStr = String(m + 1).padStart(2, '0');
      router.push(`/calendar?month=${y}-${monthStr}`);
    },
    [currentYear, currentMonth, router]
  );

  const grid = generateCalendarGrid(currentYear, currentMonth, todos, holidays, todayStr);
  const selectedDayTodos = selectedDay
    ? todos.filter((t) => t.due_date?.slice(0, 10) === selectedDay)
    : [];

  return (
    <div className="max-w-4xl mx-auto p-4 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          ← Back to Todos
        </Link>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigateMonth('prev')}
            aria-label="Previous month"
            className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            ‹
          </button>
          <h1 className="text-xl font-bold">
            {MONTH_NAMES[currentMonth]} {currentYear}
          </h1>
          <button
            onClick={() => navigateMonth('next')}
            aria-label="Next month"
            className="px-3 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            ›
          </button>
        </div>
        <div className="w-24" />
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div
            key={d}
            className="text-center text-xs font-semibold text-gray-500 dark:text-gray-400 py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        {grid.map((week, wi) => (
          <div
            key={wi}
            className="grid grid-cols-7 divide-x divide-gray-200 dark:divide-gray-700"
          >
            {week.map((cell) => {
              const displayTodos =
                cell.todos.length > 3 ? cell.todos.slice(0, 2) : cell.todos;
              const remaining =
                cell.todos.length > 3 ? cell.todos.length - 2 : 0;

              return (
                <div
                  key={cell.date}
                  onClick={() => cell.todos.length > 0 && setSelectedDay(cell.date)}
                  className={[
                    'min-h-[80px] p-1 border-b border-gray-200 dark:border-gray-700 transition-colors',
                    cell.isCurrentMonth
                      ? cell.isWeekend
                        ? 'bg-slate-50 dark:bg-slate-800/60'
                        : 'bg-white dark:bg-gray-800'
                      : 'bg-gray-50 dark:bg-gray-900',
                    cell.todos.length > 0
                      ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/20'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {/* Day number */}
                  <div className="mb-1">
                    <span
                      className={[
                        'text-xs font-medium w-6 h-6 inline-flex items-center justify-center rounded-full',
                        cell.isToday
                          ? 'bg-blue-600 text-white'
                          : cell.isCurrentMonth
                            ? cell.isPast
                              ? 'text-gray-400 dark:text-gray-500'
                              : 'text-gray-900 dark:text-gray-100'
                            : 'text-gray-300 dark:text-gray-600',
                      ].join(' ')}
                    >
                      {cell.dayNumber}
                    </span>
                  </div>

                  {/* Holiday name */}
                  {cell.holiday && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 truncate leading-tight mb-0.5">
                      {cell.holiday.name}
                    </p>
                  )}

                  {/* Todo indicators */}
                  <div className="space-y-0.5">
                    {displayTodos.map((todo) => (
                      <div key={todo.id} className="flex items-center gap-1 min-w-0">
                        <span
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            PRIORITY_DOT[todo.priority] ?? 'bg-gray-400'
                          }`}
                        />
                        <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
                          {todo.title}
                        </span>
                      </div>
                    ))}
                    {remaining > 0 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        +{remaining} more
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Day detail modal */}
      {selectedDay && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedDay(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg p-4 max-w-md w-full max-h-[60vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">
                Todos for {selectedDay}
              </h2>
              <button
                onClick={() => setSelectedDay(null)}
                aria-label="Close modal"
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2">
              {selectedDayTodos.map((todo) => (
                <div
                  key={todo.id}
                  className="flex items-center gap-2 p-2 rounded border border-gray-200 dark:border-gray-700"
                >
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      PRIORITY_DOT[todo.priority] ?? 'bg-gray-400'
                    }`}
                  />
                  <span
                    className={`text-sm ${
                      todo.completed
                        ? 'line-through text-gray-400'
                        : 'text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    {todo.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page export (Suspense wrapper required for useSearchParams) ───────────────

export default function CalendarPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <span className="text-gray-500">Loading calendar…</span>
        </div>
      }
    >
      <CalendarApp />
    </Suspense>
  );
}

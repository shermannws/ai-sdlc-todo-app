const SG_TIMEZONE = 'Asia/Singapore';

type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

/**
 * Returns the current moment as a JS Date (UTC-anchored).
 * Use this instead of `new Date()` so timezone intent is explicit.
 */
export function getSingaporeNow(): Date {
  return new Date();
}

/**
 * Formats a Date as a Singapore-local ISO string without timezone suffix.
 * Example: "2025-03-15T14:30:00"
 */
export function formatSingaporeDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SG_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

/**
 * Alias for formatSingaporeDate — returns Singapore-local ISO string.
 */
export function toSingaporeISOString(date: Date): string {
  return formatSingaporeDate(date);
}

/**
 * Returns today's date as YYYY-MM-DD in Singapore local time.
 */
export function getSingaporeDateString(date: Date = getSingaporeNow()): string {
  return formatSingaporeDate(date).split('T')[0];
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function parseSingaporeLocalISO(input: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4]),
      minute: Number(match[5]),
      second: Number(match[6] ?? 0),
    };
  }

  const parsed = new Date(input);
  if (isNaN(parsed.getTime())) {
    throw new Error('Invalid due date format');
  }

  const singaporeISO = formatSingaporeDate(parsed);
  const fallbackMatch = singaporeISO.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (!fallbackMatch) {
    throw new Error('Failed to parse Singapore date');
  }

  return {
    year: Number(fallbackMatch[1]),
    month: Number(fallbackMatch[2]),
    day: Number(fallbackMatch[3]),
    hour: Number(fallbackMatch[4]),
    minute: Number(fallbackMatch[5]),
    second: Number(fallbackMatch[6]),
  };
}

function formatPartsAsISO(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

/**
 * Calculates the next Singapore-local due date for recurring todos.
 */
export function calculateNextDueDate(currentDueDate: string, pattern: RecurrencePattern): string {
  const current = parseSingaporeLocalISO(currentDueDate);

  if (pattern === 'daily') {
    const next = new Date(Date.UTC(current.year, current.month - 1, current.day, current.hour, current.minute, current.second));
    next.setUTCDate(next.getUTCDate() + 1);
    return formatPartsAsISO({
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
      hour: current.hour,
      minute: current.minute,
      second: current.second,
    });
  }

  if (pattern === 'weekly') {
    const next = new Date(Date.UTC(current.year, current.month - 1, current.day, current.hour, current.minute, current.second));
    next.setUTCDate(next.getUTCDate() + 7);
    return formatPartsAsISO({
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
      hour: current.hour,
      minute: current.minute,
      second: current.second,
    });
  }

  if (pattern === 'monthly') {
    const nextYear = current.month === 12 ? current.year + 1 : current.year;
    const nextMonth = current.month === 12 ? 1 : current.month + 1;
    const nextDay = Math.min(current.day, daysInMonth(nextYear, nextMonth));

    return formatPartsAsISO({
      year: nextYear,
      month: nextMonth,
      day: nextDay,
      hour: current.hour,
      minute: current.minute,
      second: current.second,
    });
  }

  const targetYear = current.year + 1;
  const maxDayInTargetMonth = daysInMonth(targetYear, current.month);
  const targetDay = Math.min(current.day, maxDayInTargetMonth);

  return formatPartsAsISO({
    year: targetYear,
    month: current.month,
    day: targetDay,
    hour: current.hour,
    minute: current.minute,
    second: current.second,
  });
}

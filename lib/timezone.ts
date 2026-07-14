const SG_TIMEZONE = 'Asia/Singapore';

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

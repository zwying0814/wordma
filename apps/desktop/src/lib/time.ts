const relative = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function formatRelativeTime(timestamp: number): string {
  const diff = timestamp - Date.now();
  const abs = Math.abs(diff);

  if (abs < MINUTE) return '刚刚';
  if (abs < HOUR) return relative.format(Math.round(diff / MINUTE), 'minute');
  if (abs < DAY) return relative.format(Math.round(diff / HOUR), 'hour');
  if (abs < WEEK) return relative.format(Math.round(diff / DAY), 'day');
  if (abs < MONTH) return relative.format(Math.round(diff / WEEK), 'week');
  if (abs < YEAR) return relative.format(Math.round(diff / MONTH), 'month');
  return relative.format(Math.round(diff / YEAR), 'year');
}

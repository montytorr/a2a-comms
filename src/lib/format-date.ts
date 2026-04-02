const TIMEZONE = process.env.NEXT_PUBLIC_DISPLAY_TIMEZONE || 'Europe/Paris';
const LOCALE = process.env.NEXT_PUBLIC_DISPLAY_LOCALE || 'fr-FR';

export function formatDate(date: string | Date, opts?: { includeTime?: boolean }): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (opts?.includeTime) {
    return d.toLocaleString(LOCALE, { timeZone: TIMEZONE, month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(LOCALE, { timeZone: TIMEZONE, month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(date: string | Date): string {
  return formatDate(date, { includeTime: true });
}

export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString(LOCALE, { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' });
}

export function formatRelative(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

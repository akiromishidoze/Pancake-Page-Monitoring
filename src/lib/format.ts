function tzAbbr(date: Date = new Date()): string {
  try {
    return date
      .toLocaleTimeString('en', { timeZoneName: 'short' })
      .split(' ')[1] || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function formatWithTz(date: Date | string | number, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = date instanceof Date ? date : new Date(date);
  const base = d.toLocaleString('en', opts);
  return `${base} ${tzAbbr(d)}`;
}

export function formatDateWithTz(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.toLocaleDateString('en')} ${tzAbbr(d)}`;
}

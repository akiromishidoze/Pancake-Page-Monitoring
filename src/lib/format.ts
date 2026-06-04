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

const CSV_FORMULA_RE = /^[=+\-@]/;

export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  let str = String(val);
  if (CSV_FORMULA_RE.test(str)) str = '\t' + str;
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function toCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  return headers.join(',') + '\n' + rows.map(r => headers.map(h => escapeCsvCell(r[h])).join(',')).join('\n');
}

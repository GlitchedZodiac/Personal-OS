export function parseValidDate(value?: string | Date | null) {
  if (!value) return null;

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function formatDateLabel(
  value?: string | Date | null,
  locale?: string,
  options?: Intl.DateTimeFormatOptions
) {
  return parseValidDate(value)?.toLocaleDateString(locale, options) ?? null;
}

export function formatDateTimeLabel(
  value?: string | Date | null,
  locale?: string,
  options?: Intl.DateTimeFormatOptions
) {
  return parseValidDate(value)?.toLocaleString(locale, options) ?? null;
}

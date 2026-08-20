export function formatNumber(
  locale: string,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatPercent(
  locale: string,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return formatNumber(locale, value, { style: "percent", ...options });
}

export function formatDateTime(
  locale: string,
  value: Date | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale, options).format(value);
}

export function formatList(
  locale: string,
  values: readonly string[],
  options?: Intl.ListFormatOptions,
): string {
  return new Intl.ListFormat(locale, options).format(values);
}

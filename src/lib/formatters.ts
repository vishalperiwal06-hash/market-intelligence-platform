/**
 * Safe numeric and string formatting utilities for institutional-grade financial rendering.
 * All functions are guarded against undefined, null, or invalid data types to prevent rendering crashes.
 */

export function safeFloat(value: any, defaultValue = 0.0): number {
  if (value === null || value === undefined || value === '') return defaultValue;
  if (typeof value === 'number') return isNaN(value) ? defaultValue : value;
  const parsed = parseFloat(String(value).replace(/,/g, ''));
  return isNaN(parsed) ? defaultValue : parsed;
}

export function safeInt(value: any, defaultValue = 0): number {
  if (value === null || value === undefined || value === '') return defaultValue;
  if (typeof value === 'number') return isNaN(value) ? defaultValue : Math.round(value);
  const parsed = parseInt(String(value).replace(/,/g, ''), 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function formatPrice(value: any, prefix = '₹'): string {
  const num = safeFloat(value);
  return `${prefix}${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(value: any, includeSign = true): string {
  const num = safeFloat(value);
  const sign = includeSign && num > 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
}

export function formatVolume(value: any): string {
  const num = safeFloat(value);
  if (num >= 10000000) {
    return `${(num / 10000000).toFixed(2)} Cr`;
  }
  if (num >= 100000) {
    return `${(num / 100000).toFixed(2)} L`;
  }
  return num.toLocaleString('en-IN');
}

export function formatTurnover(value: any): string {
  const num = safeFloat(value);
  // nse turnover values are typically in Lakhs or Crores already
  if (num >= 100) {
    return `₹${(num / 100).toFixed(2)} Cr`;
  }
  return `₹${num.toFixed(2)} L`;
}

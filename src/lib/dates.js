/** Shared date helpers. All arithmetic is on local calendar parts - never UTC -
 *  so the displayed day can't drift across a timezone boundary. */
import { dateKey } from './parseMenu.js';

export { dateKey, todayKey } from './parseMenu.js';

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-09-07" -> local Date */
export function dateFromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "Monday, 7 September" */
export function formatLong(date) {
  return WEEKDAY_NAMES[date.getDay()] + ', ' + date.getDate() + ' ' + MONTH_NAMES[date.getMonth()];
}

/** Move a date key by n days, rolling over months and years correctly. */
export function shiftKey(key, n) {
  const d = dateFromKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Mess-menu Excel parser.
 *
 * Written against the VIT-AP hostel workbook format:
 *   - one sheet per menu category (e.g. "Veg & Non-Veg", "Special")
 *   - a title row  : "VEG & NON-VEG MESS MENU FOR THE MONTH OF SEPTEMBER"
 *   - a header row : Day | Breakfast | Lunch | Snacks | Dinner
 *   - one *block* of many rows per day, with the day cell merged down column A
 *     and holding text like "Mon\n7, 21" -> the block applies to the 7th AND 21st
 *   - a trailing "MESS SERVICE INSTRUCTIONS" block that is NOT a day
 *
 * Nothing about September is hardcoded: month, year, day numbers, meal columns
 * and sheet names are all discovered from the workbook itself.
 */
import * as XLSX from 'xlsx';

export const MEALS = [
  { key: 'breakfast', label: 'Morning', icon: '🌅', match: /breakfast|morning/i },
  { key: 'lunch', label: 'Afternoon', icon: '☀️', match: /lunch|afternoon|noon/i },
  { key: 'snacks', label: 'Snacks', icon: '☕', match: /snack|evening/i },
  { key: 'dinner', label: 'Dinner', icon: '🌙', match: /dinner|night|supper/i },
];

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Longest plausible menu item; anything longer is prose (e.g. the instructions block). */
const MAX_ITEM_LENGTH = 160;

export class MenuParseError extends Error {}

/* ------------------------------------------------------------------ */
/* small helpers                                                      */
/* ------------------------------------------------------------------ */

const text = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());

/** Local-date key, built from local calendar parts so no timezone shift is possible. */
export function dateKey(year, month /* 0-based */, day) {
  const p = (n) => String(n).padStart(2, '0');
  return year + '-' + p(month + 1) + '-' + p(day);
}

export function todayKey(now = new Date()) {
  return dateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

/* ------------------------------------------------------------------ */
/* month / year discovery                                             */
/* ------------------------------------------------------------------ */

function findMonth(rows) {
  // Look at the first handful of rows for "... MONTH OF <name>" or a bare month name.
  for (const row of rows.slice(0, 8)) {
    for (const cell of row || []) {
      const t = text(cell);
      if (!t) continue;
      const explicit = t.match(/month\s+of\s+([a-z]+)/i);
      if (explicit) {
        const i = MONTHS.indexOf(explicit[1].toLowerCase());
        if (i >= 0) return i;
      }
      for (let i = 0; i < MONTHS.length; i++) {
        if (new RegExp('\\b' + MONTHS[i] + '\\b', 'i').test(t)) return i;
      }
    }
  }
  return null;
}

function findYearInText(rows) {
  for (const row of rows.slice(0, 8)) {
    for (const cell of row || []) {
      const m = text(cell).match(/\b(20\d{2})\b/);
      if (m) return Number(m[1]);
    }
  }
  return null;
}

/**
 * The workbook names the month but usually not the year. Each day block carries a
 * weekday ("Mon 7, 21"), so pick the candidate year whose real calendar agrees
 * with the most of those weekday/day-number pairs.
 */
function inferYear(month, blocks, now) {
  const base = now.getFullYear();
  let best = base;
  let bestScore = -1;

  for (const year of [base, base + 1, base - 1]) {
    let score = 0;
    for (const b of blocks) {
      if (b.weekday == null) continue;
      for (const day of b.days) {
        const d = new Date(year, month, day);
        if (d.getMonth() === month && d.getDay() === b.weekday) score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = year;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* sheet structure discovery                                          */
/* ------------------------------------------------------------------ */

function findHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r] || [];
    const columns = {};
    for (let c = 0; c < row.length; c++) {
      const t = text(row[c]);
      if (!t) continue;
      for (const meal of MEALS) {
        if (columns[meal.key] === undefined && meal.match.test(t)) columns[meal.key] = c;
      }
    }
    if (Object.keys(columns).length < 2) continue;

    let dayColumn = row.findIndex((cell) => /^(day|date)s?\b/i.test(text(cell)));
    if (dayColumn < 0) dayColumn = 0;
    return { headerRow: r, dayColumn, columns };
  }
  return null;
}

/** "Mon\n7, 21" -> { weekday: 1, days: [7, 21] } */
export function parseDayCell(value) {
  const t = text(value);
  if (!t) return null;

  const wd = t.match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i);
  const nums = (t.match(/\d{1,2}/g) || [])
    .map(Number)
    .filter((n) => n >= 1 && n <= 31);
  if (!nums.length) return null;

  return {
    weekday: wd ? WEEKDAYS.indexOf(wd[1].toLowerCase()) : null,
    days: [...new Set(nums)],
  };
}

/** Map: row that opens a merged day cell -> last row of that merge. */
function mergeEndsByRow(worksheet, dayColumn) {
  const map = new Map();
  for (const m of worksheet['!merges'] || []) {
    if (m.s.c === dayColumn && m.e.c === dayColumn) map.set(m.s.r, m.e.r);
  }
  return map;
}

function cleanItems(cell) {
  return text(cell)
    .split(/\s*[\r\n]+\s*/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s && s.length <= MAX_ITEM_LENGTH && !/^[-–—.*•]+$/.test(s));
}

/* ------------------------------------------------------------------ */
/* one sheet -> day blocks                                            */
/* ------------------------------------------------------------------ */

function parseSheet(worksheet) {
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: false,
    defval: null,
    blankrows: true,
  });

  const layout = findHeader(rows);
  if (!layout) return null;

  const { headerRow, dayColumn, columns } = layout;
  const merges = mergeEndsByRow(worksheet, dayColumn);

  // Rows that open a day block, in order.
  const starts = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const parsed = parseDayCell((rows[r] || [])[dayColumn]);
    if (parsed) starts.push({ row: r, ...parsed });
  }
  if (!starts.length) return null;

  const blocks = starts.map((start, i) => {
    // The merged range is authoritative and keeps trailing content (the
    // "MESS SERVICE INSTRUCTIONS" block) out of the last day. Without a merge,
    // fall back to "everything up to the next day block".
    const nextStart = starts[i + 1] ? starts[i + 1].row - 1 : rows.length - 1;
    const end = Math.min(merges.has(start.row) ? merges.get(start.row) : nextStart, nextStart);

    const meals = {};
    for (const meal of MEALS) {
      const c = columns[meal.key];
      if (c === undefined) continue;

      const items = [];
      const seen = new Set();
      for (let r = start.row; r <= end; r++) {
        for (const item of cleanItems((rows[r] || [])[c])) {
          const k = item.toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          items.push(item);
        }
      }
      meals[meal.key] = items;
    }

    return { weekday: start.weekday, days: start.days, meals };
  });

  const hasFood = blocks.some((b) => MEALS.some((m) => (b.meals[m.key] || []).length));
  if (!hasFood) return null;

  return { blocks, month: findMonth(rows), year: findYearInText(rows) };
}

/* ------------------------------------------------------------------ */
/* public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * @param {ArrayBuffer|Uint8Array} input raw .xlsx bytes
 * @param {{fileName?: string, now?: Date}} [options]
 * @returns parsed menu, keyed by local calendar date
 */
export function parseMenuWorkbook(input, options = {}) {
  const now = options.now || new Date();

  let workbook;
  try {
    workbook = XLSX.read(input, { type: 'array' });
  } catch (e) {
    throw new MenuParseError('unreadable-workbook');
  }
  if (!workbook.SheetNames || !workbook.SheetNames.length) {
    throw new MenuParseError('empty-workbook');
  }

  const categories = [];
  let month = null;
  let year = null;

  for (const name of workbook.SheetNames) {
    const sheet = parseSheet(workbook.Sheets[name]);
    if (!sheet) continue; // not a menu sheet - skip quietly
    if (month == null && sheet.month != null) month = sheet.month;
    if (year == null && sheet.year != null) year = sheet.year;
    categories.push({ name: name.trim(), blocks: sheet.blocks });
  }

  if (!categories.length) throw new MenuParseError('no-menu-sheets');

  // Month/year fallbacks: filename hint, then the device's current month.
  if (month == null && options.fileName) {
    const i = MONTHS.findIndex((m) => new RegExp('\\b' + m, 'i').test(options.fileName));
    if (i >= 0) month = i;
  }
  if (year == null && options.fileName) {
    const m = options.fileName.match(/\b(20\d{2})\b/);
    if (m) year = Number(m[1]);
  }
  if (month == null) month = now.getMonth();
  if (year == null) {
    year = inferYear(month, categories.flatMap((c) => c.blocks), now);
  }

  // Flatten blocks into a date-keyed lookup. A block listing "7, 21" lands on both.
  const result = categories.map((category) => {
    const days = {};
    for (const block of category.blocks) {
      for (const day of block.days) {
        const d = new Date(year, month, day);
        if (d.getMonth() !== month) continue; // e.g. a "31" in a 30-day month
        days[dateKey(year, month, day)] = block.meals;
      }
    }
    return { name: category.name, days };
  });

  const dayCount = result.reduce((n, c) => n + Object.keys(c.days).length, 0);
  if (!dayCount) throw new MenuParseError('no-dates-found');

  return {
    version: 1,
    month,
    year,
    monthLabel: MONTHS[month][0].toUpperCase() + MONTHS[month].slice(1) + ' ' + year,
    categories: result,
    uploadedAt: now.toISOString(),
    fileName: options.fileName || null,
  };
}

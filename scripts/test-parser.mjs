/**
 * Parser test harness.
 *
 * Runs the real parser against a real hostel workbook and asserts the structural
 * rules that matter: multi-date day cells, multi-row day blocks, no lost items,
 * no leaked instruction text, correct date -> menu resolution.
 *
 *   node scripts/test-parser.mjs [path-to.xlsx]
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseMenuWorkbook, MEALS, dateKey, MenuParseError } from '../src/lib/parseMenu.js';

const file = process.argv[2] || 'E:/downloads/VIT-AP_Final Mess Menu_September 2026.xlsx';

let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log('  PASS  ' + name);
  } else {
    failed++;
    console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : ''));
  }
}

function section(title) {
  console.log('\n' + title);
  console.log('-'.repeat(title.length));
}

/* ------------------------------------------------------------------ */

console.log('Workbook: ' + file);
const bytes = fs.readFileSync(file);
const now = new Date(2026, 8, 7); // pin "today" so the test is date-independent
const menu = parseMenuWorkbook(bytes, { fileName: path.basename(file), now });

section('1-3. Workbook, sheets and month/year');
check('workbook opened', !!menu);
check('two menu categories found', menu.categories.length === 2, JSON.stringify(menu.categories.map((c) => c.name)));
check('category names preserved', menu.categories[0].name === 'Veg & Non-Veg' && menu.categories[1].name === 'Special');
check('month label is September 2026', menu.monthLabel === 'September 2026', menu.monthLabel);

const veg = menu.categories[0];
const special = menu.categories[1];

section('4-5. Date structure: "Mon 7, 21" style cells');
check('Veg sheet covers 30 days', Object.keys(veg.days).length === 30, String(Object.keys(veg.days).length));
check('Special sheet covers 30 days', Object.keys(special.days).length === 30, String(Object.keys(special.days).length));

const missing = [];
for (let d = 1; d <= 30; d++) if (!veg.days[dateKey(2026, 8, d)]) missing.push(d);
check('every day 1-30 present, none skipped', missing.length === 0, 'missing ' + missing.join(','));

// "7, 21" must be two separate dates sharing one menu, not the number 721.
const sep7 = veg.days[dateKey(2026, 8, 7)];
const sep21 = veg.days[dateKey(2026, 8, 21)];
check('Sept 7 and Sept 21 both resolve', !!sep7 && !!sep21);
check('Sept 7 and Sept 21 share the same menu', JSON.stringify(sep7) === JSON.stringify(sep21));
check('no bogus date 721 leaked in', !Object.keys(veg.days).some((k) => /-(7 21|721)$/.test(k)));

section('6. Sept 7 resolves to the correct Monday menu');
check('breakfast starts with Carrot Idly', sep7.breakfast[0] === 'Carrot Idly', sep7.breakfast[0]);
check('lunch contains Jilebi (last row of the block)', sep7.lunch.includes('Jilebi'));
check('snacks contain Dry Maggi', sep7.snacks.includes('Dry Maggi'));
check('dinner contains Telangana Chicken Curry (Non-Veg)', sep7.dinner.includes('Telangana Chicken Curry (Non-Veg)'));

section('7. Sept 21 -> same Monday block');
check('Sept 21 breakfast starts with Carrot Idly', sep21.breakfast[0] === 'Carrot Idly');

section('8. Other dates resolve correctly');
const sep1 = veg.days[dateKey(2026, 8, 1)];
const sep29 = veg.days[dateKey(2026, 8, 29)];
check('Sept 1 (Tue 1,15,29) breakfast starts with Multi Grain Dosa', sep1.breakfast[0] === 'Multi Grain Dosa (2 Pcs Thin)', sep1.breakfast[0]);
check('Sept 29 matches Sept 1 (three-date block)', JSON.stringify(sep1) === JSON.stringify(sep29));
const sep14 = veg.days[dateKey(2026, 8, 14)];
const sep28 = veg.days[dateKey(2026, 8, 28)];
check('Sept 14 (last block) is Konaseema Pottikkalu', sep14.breakfast[0].startsWith('Konaseema Pottikkalu'), sep14.breakfast[0]);
check('Sept 28 matches Sept 14', JSON.stringify(sep14) === JSON.stringify(sep28));
const sep30 = veg.days[dateKey(2026, 8, 30)];
check('Sept 30 (Wed 2,16,30) resolves', sep30.breakfast[0].startsWith('Methu Vada'), sep30.breakfast[0]);

section('9-12. No meal is lost, on any day, in either category');
for (const category of menu.categories) {
  for (const meal of MEALS) {
    const empty = Object.entries(category.days)
      .filter(([, m]) => !(m[meal.key] || []).length)
      .map(([k]) => k);
    check(category.name + ' / ' + meal.label + ' non-empty on all 30 days', empty.length === 0, 'empty on ' + empty.join(','));
  }
}

section('Multi-row blocks combined (not one row per day)');
// Rows 84-96 of the sheet; note "Egg Bhurji" sits 5 rows below the last other
// breakfast item with a blank day cell in between - it must not be dropped.
check('Sept 7 breakfast collects all 8 items across the block', sep7.breakfast.length === 8, JSON.stringify(sep7.breakfast));
check('Sept 7 breakfast keeps the far-separated Egg Bhurji row', sep7.breakfast.includes('Egg Bhurji'));
check('Sept 7 lunch has 12+ items across many rows', sep7.lunch.length >= 12, String(sep7.lunch.length));
check('Sept 7 dinner keeps last row (Milk + Cofee Powder)', sep7.dinner[sep7.dinner.length - 1] === 'Milk + Cofee Powder', sep7.dinner.join(' | '));
check('date cell blank on later rows did not drop items', sep7.lunch[0] === 'Beetroot & Cucumber Salad' && sep7.lunch.includes('Ghee + Podi'));

section('Instructions block excluded from the last day');
const allText = JSON.stringify(menu);
check('MESS SERVICE INSTRUCTIONS not in menu data', !/MESS SERVICE INSTRUCTIONS/i.test(allText));
check('instruction prose not in menu data', !/weighing machine/i.test(allText));
check('Sept 14 breakfast has no stray long prose', sep14.breakfast.every((i) => i.length < 100));

section('Sheets differ where the workbook says they differ');
const vegBreakfast7 = sep7.breakfast.join(' | ');
const specialBreakfast7 = special.days[dateKey(2026, 8, 7)].breakfast.join(' | ');
check('Special breakfast differs from Veg (adds juice/cereal)', vegBreakfast7 !== specialBreakfast7);
check('Special Sept 7 includes Banana Milk Shake', special.days[dateKey(2026, 8, 7)].breakfast.includes('Banana Milk Shake'));
check('Special Sept 7 dinner includes Sweet Corn Soup', special.days[dateKey(2026, 8, 7)].dinner.includes('Sweet Corn Soup'));

section('15. Missing dates handled gracefully');
check('October date returns undefined, no throw', veg.days[dateKey(2026, 9, 5)] === undefined);
check('Sept 31 does not exist', veg.days['2026-09-31'] === undefined);

section('Bad input handled gracefully');
let threw = null;
try {
  parseMenuWorkbook(new Uint8Array([1, 2, 3, 4]), { fileName: 'junk.xlsx' });
} catch (e) {
  threw = e;
}
check('garbage bytes raise MenuParseError', threw instanceof MenuParseError, threw && threw.message);

section('Year inference (workbook names no year)');
const noNameHint = parseMenuWorkbook(bytes, { now: new Date(2026, 8, 7) });
check('year inferred as 2026 from weekday alignment', noNameHint.year === 2026, String(noNameHint.year));
const sizeKb = Math.round(JSON.stringify(menu).length / 1024);
check('parsed payload is small enough to store locally', sizeKb < 400, sizeKb + ' KB');

/* ------------------------------------------------------------------ */

console.log('\n' + '='.repeat(50));
console.log(passed + ' passed, ' + failed + ' failed');
console.log('='.repeat(50));
process.exit(failed ? 1 : 0);

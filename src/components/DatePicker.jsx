import { useEffect, useMemo, useRef, useState } from 'react';
import { dateKey, dateFromKey, MONTH_NAMES } from '../lib/dates.js';

const WEEKDAY_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/**
 * In-app calendar popover.
 *
 * Deliberately not <input type="date">: the browser renders that picker outside
 * the page, so it cannot be themed. This one is plain markup, so it matches the
 * rest of the app and behaves identically on Android and on desktop.
 */
export default function DatePicker({ value, todayKey, days, onSelect }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const d = dateFromKey(value);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const root = useRef(null);

  // Jump the calendar to whatever day is being viewed each time it opens.
  useEffect(() => {
    if (!open) return;
    const d = dateFromKey(value);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e) => {
      if (root.current && !root.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Which months the loaded menu actually covers, so the arrows can't wander off.
  const range = useMemo(() => {
    const keys = Object.keys(days || {}).sort();
    if (!keys.length) return null;
    const first = dateFromKey(keys[0]);
    const last = dateFromKey(keys[keys.length - 1]);
    return {
      min: first.getFullYear() * 12 + first.getMonth(),
      max: last.getFullYear() * 12 + last.getMonth(),
    };
  }, [days]);

  const viewIndex = view.y * 12 + view.m;
  const canPrev = !range || viewIndex > range.min;
  const canNext = !range || viewIndex < range.max;

  const step = (delta) => {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  // Monday-first grid.
  const leading = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
  const dayCount = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: dayCount }, (_, i) => i + 1),
  ];

  return (
    <span className="picker" ref={root}>
      <button
        type="button"
        className="icon-btn glass"
        aria-label="View another date"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none"
          stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </button>

      {open && (
        <div className="calendar glass" role="dialog" aria-label="Choose a date">
          <div className="cal-head">
            <button type="button" className="cal-nav" onClick={() => step(-1)}
              disabled={!canPrev} aria-label="Previous month">‹</button>
            <span className="cal-month">{MONTH_NAMES[view.m]} {view.y}</span>
            <button type="button" className="cal-nav" onClick={() => step(1)}
              disabled={!canNext} aria-label="Next month">›</button>
          </div>

          <div className="cal-grid">
            {WEEKDAY_SHORT.map((w) => (
              <span key={w} className="cal-wd">{w}</span>
            ))}

            {cells.map((day, i) => {
              if (day == null) return <span key={'b' + i} />;
              const key = dateKey(view.y, view.m, day);
              const has = Boolean(days && days[key]);
              const classes = ['cal-day'];
              if (key === value) classes.push('selected');
              else if (key === todayKey) classes.push('is-today');
              if (!has) classes.push('empty');

              return (
                <button
                  key={key}
                  type="button"
                  className={classes.join(' ')}
                  disabled={!has}
                  aria-label={day + ' ' + MONTH_NAMES[view.m]}
                  aria-current={key === todayKey ? 'date' : undefined}
                  onClick={() => { onSelect(key); setOpen(false); }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </span>
  );
}

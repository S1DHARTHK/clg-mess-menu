import { useId, useState } from 'react';

const svg = (children) => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

/**
 * Monochrome line icons, keyed by meal. Emoji were the only colour left on
 * screen once the theme went greyscale, and desaturating them turned them into
 * shapeless blobs.
 */
const ICONS = {
  breakfast: svg(<path d="M12 3.6v2.6M5.9 9.3l1.8 1.8M18.1 9.3l-1.8 1.8M2.8 18.6h18.4M7.2 18.6a4.8 4.8 0 0 1 9.6 0" />),
  lunch: svg(
    <>
      <circle cx="12" cy="12" r="3.9" />
      <path d="M12 2.4v2.1M12 19.5v2.1M4.4 4.4l1.5 1.5M18.1 18.1l1.5 1.5M2.4 12h2.1M19.5 12h2.1M4.4 19.6l1.5-1.5M18.1 5.9l1.5-1.5" />
    </>
  ),
  snacks: svg(
    <>
      <path d="M4.2 8.4h11.4v4.9a4.9 4.9 0 0 1-4.9 4.9H9.1a4.9 4.9 0 0 1-4.9-4.9V8.4Z" />
      <path d="M15.6 9.9h1.9a2.4 2.4 0 0 1 0 4.7h-1.9" />
      <path d="M8.2 3.6v1.9M11.8 3.6v1.9" />
    </>
  ),
  dinner: svg(<path d="M20.1 14.4A8.3 8.3 0 0 1 9.7 4a8.5 8.5 0 1 0 10.4 10.4Z" />),
};

/**
 * One meal section. Collapsed to just its heading by default; tapping the
 * heading reveals the items for that meal.
 */
export default function MealCard({ meal, items }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <section className={'card glass' + (open ? ' open' : '')}>
      <button
        type="button"
        className="card-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="card-icon" aria-hidden="true">{ICONS[meal.key] || ICONS.lunch}</span>
        <span className="card-title">{meal.label}</span>
        <span className="card-count">{items.length}</span>
        <span className="chevron" aria-hidden="true" />
      </button>

      <div className="panel" id={panelId} aria-hidden={!open}>
        <div className="panel-inner">
          {items.length ? (
            <ul className="items">
              {items.map((item, i) => (
                <li key={meal.key + i}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Not listed for today.</p>
          )}
        </div>
      </div>
    </section>
  );
}

import { useId, useState } from 'react';

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
        <span className="card-icon" aria-hidden="true">{meal.icon}</span>
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

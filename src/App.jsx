import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MEALS, parseMenuWorkbook, MenuParseError } from './lib/parseMenu.js';
import { todayKey, dateFromKey, formatLong, shiftKey, MONTH_NAMES } from './lib/dates.js';
import { loadMenu, saveMenu, loadCategory, saveCategory } from './lib/storage.js';
import MealCard from './components/MealCard.jsx';
import DatePicker from './components/DatePicker.jsx';

function formatUploaded(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getDate() + ' ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
}

export default function App() {
  const [menu, setMenu] = useState(null);
  const [categoryName, setCategoryName] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | empty
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null); // null = follow today
  const fileInput = useRef(null);

  // Read the date once per mount and refresh it when the app comes back to the
  // foreground, so leaving the app open overnight still shows the right day.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  useEffect(() => {
    (async () => {
      const [saved, savedCategory] = await Promise.all([loadMenu(), loadCategory()]);
      if (saved) {
        setMenu(saved);
        setCategoryName(savedCategory);
      }
      setStatus(saved ? 'ready' : 'empty');
    })();
  }, []);

  const category = useMemo(() => {
    if (!menu) return null;
    return menu.categories.find((c) => c.name === categoryName) || menu.categories[0];
  }, [menu, categoryName]);

  const currentKey = todayKey(now);
  const tomorrowKey = shiftKey(currentKey, 1);
  const activeKey = selectedKey || currentKey;
  const isToday = activeKey === currentKey;
  const isTomorrow = activeKey === tomorrowKey;
  const dayMenu = category ? category.days[activeKey] : null;

  const eyebrow = isToday ? 'Today’s Mess Menu'
    : isTomorrow ? 'Tomorrow’s Menu'
    : 'Selected Day';

  const handleFile = useCallback(async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = ''; // let the same file be picked again later
    if (!file) return;

    setError(null);

    if (!/\.xlsx$/i.test(file.name)) {
      setError('Please choose an Excel .xlsx file.');
      return;
    }

    setBusy(true);
    try {
      const bytes = await file.arrayBuffer();
      const parsed = parseMenuWorkbook(bytes, { fileName: file.name });
      await saveMenu(parsed);
      const first = parsed.categories[0].name;
      const keep = parsed.categories.some((c) => c.name === categoryName) ? categoryName : first;
      await saveCategory(keep);
      setMenu(parsed);
      setCategoryName(keep);
      setStatus('ready');
      setSelectedKey(null); // a fresh menu always lands on today
      setNow(new Date());
    } catch (e) {
      if (e instanceof MenuParseError || e instanceof Error) {
        setError("Couldn't read this menu file. Please upload the hostel's Excel menu.");
      }
    } finally {
      setBusy(false);
    }
  }, [categoryName]);

  const pickFile = () => fileInput.current && fileInput.current.click();

  const chooseCategory = (name) => {
    setCategoryName(name);
    saveCategory(name);
  };

  const chooseDate = (value) => {
    if (!value) return;
    setSelectedKey(value === currentKey ? null : value);
  };

  if (status === 'loading') {
    return <div className="screen centered"><p className="muted">Loading…</p></div>;
  }

  return (
    <div className="screen">
      {/*
        `accept` is deliberately permissive: Android file managers often report an
        .xlsx that arrived via chat or email as octet-stream and would otherwise
        grey it out. The real check is the .xlsx test in handleFile.
      */}
      <input
        ref={fileInput}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream"
        onChange={handleFile}
        hidden
      />

      {status === 'empty' ? (
        <div className="centered empty">
          <div className="empty-icon glass">🍽️</div>
          <h1>No menu uploaded</h1>
          <p className="muted">Upload the hostel&rsquo;s monthly Excel menu to get started.</p>
          {error && <p className="error">{error}</p>}
          <button className="primary big" onClick={pickFile} disabled={busy}>
            {busy ? 'Reading…' : 'Upload Menu'}
          </button>
        </div>
      ) : (
        <>
          <header className="header">
            <div className="header-top">
              <p className="eyebrow">{eyebrow}</p>
              <DatePicker
                value={activeKey}
                todayKey={currentKey}
                days={category.days}
                onSelect={chooseDate}
              />
            </div>

            <h1 className="date">{formatLong(dateFromKey(activeKey))}</h1>

            <div className="quick">
              <button
                className={'chip' + (isToday ? ' active' : '')}
                onClick={() => setSelectedKey(null)}
              >
                Today
              </button>
              <button
                className={'chip' + (isTomorrow ? ' active' : '')}
                onClick={() => setSelectedKey(tomorrowKey)}
              >
                Tomorrow
              </button>
            </div>
          </header>

          {menu.categories.length > 1 && (
            <div className="tabs glass" role="tablist">
              {menu.categories.map((c) => (
                <button
                  key={c.name}
                  role="tab"
                  aria-selected={c.name === category.name}
                  className={'tab' + (c.name === category.name ? ' active' : '')}
                  onClick={() => chooseCategory(c.name)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {error && <p className="error banner glass">{error}</p>}

          <main className="meals">
            {dayMenu ? (
              MEALS.map((meal) => (
                <MealCard key={meal.key} meal={meal} items={dayMenu[meal.key] || []} />
              ))
            ) : (
              <div className="notice glass">
                <h2>No menu available for {isToday ? 'today' : 'this day'}</h2>
                <p className="muted">
                  {isToday
                    ? `The saved menu covers ${menu.monthLabel}. Upload this month’s Excel to see today’s meals.`
                    : `The saved menu covers ${menu.monthLabel}. Pick a day in that range, or upload a newer Excel.`}
                </p>
              </div>
            )}
          </main>

          <footer className="footer">
            <div className="meta">
              <span>Menu: {menu.monthLabel}</span>
              {menu.uploadedAt && formatUploaded(menu.uploadedAt) && (
                <span className="muted">Last updated: {formatUploaded(menu.uploadedAt)}</span>
              )}
            </div>
            <button className="primary" onClick={pickFile} disabled={busy}>
              {busy ? 'Reading…' : 'Update Menu'}
            </button>
          </footer>

          <p className="hello">
            Got a second?
            <span className="hello-dot" aria-hidden="true">·</span>
            <a
              className="hello-link"
              href="https://www.instagram.com/_sidaarth"
              target="_blank"
              rel="noopener noreferrer"
            >
              Say hi 👋
            </a>
          </p>
        </>
      )}
    </div>
  );
}

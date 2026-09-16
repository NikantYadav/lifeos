'use client';

import { useState } from 'react';

export type Tab =
  | 'today' | 'timetable' | 'plans' | 'week' | 'people'
  | 'reps' | 'body' | 'phases';

const ALL_TABS: [Tab, string][] = [
  ['today', 'Today'],
  ['timetable', 'Timetable'],
  ['plans', 'Plans'],
  ['week', 'Scorecard'],
  ['people', 'People'],
  ['reps', 'Approach log'],
  ['body', 'Body'],
  ['phases', '24 weeks'],
];

const PRIMARY: Tab[] = ['today', 'timetable', 'plans', 'people'];

const ICONS: Record<Tab, React.ReactNode> = {
  today: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
      <path d="M3.5 9.5h17M8 3v3M16 3v3" />
    </svg>
  ),
  timetable: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  ),
  plans: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 3.5h9l4 4v13H6z" />
      <path d="M9 11h6M9 15h6" />
    </svg>
  ),
  people: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c.8-3.3 3-5 5.5-5s4.7 1.7 5.5 5" />
      <circle cx="17" cy="9.5" r="2.3" />
      <path d="M15.7 14.3c1.9.3 3.4 1.8 4 4.7" />
    </svg>
  ),
  week: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M5 19V10M12 19V5M19 19v-6" />
    </svg>
  ),
  reps: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 12h5l2-5 3 10 2-5h4" />
    </svg>
  ),
  body: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="5" r="2.3" />
      <path d="M12 8v7M8.5 11h7M9 20l3-5 3 5" />
    </svg>
  ),
  phases: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 5h16M4 12h10M4 19h13" />
    </svg>
  ),
};

const MORE_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
);

export default function Nav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreTabs = ALL_TABS.filter(([id]) => !PRIMARY.includes(id));
  const moreActive = moreTabs.some(([id]) => id === active);

  const go = (t: Tab) => {
    onChange(t);
    setMoreOpen(false);
  };

  return (
    <>
      {/* Desktop / wide: horizontal tab bar */}
      <div className="nav-wrap nav-desktop">
        <nav role="tablist">
          {ALL_TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={active === id} onClick={() => onChange(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="nav-fade" aria-hidden="true" />
      </div>

      {/* Mobile: fixed bottom tab bar */}
      <nav className="tabbar" role="tablist" aria-label="Main">
        {PRIMARY.map((id) => {
          const label = ALL_TABS.find(([tid]) => tid === id)![1];
          return (
            <button key={id} role="tab" aria-selected={active === id} onClick={() => go(id)}>
              <span className="ic">{ICONS[id]}</span>
              {label}
            </button>
          );
        })}
        <button role="tab" aria-selected={moreActive} aria-haspopup="true" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}>
          <span className="ic">{MORE_ICON}</span>
          More
        </button>
      </nav>

      {moreOpen && (
        <div className="sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="More tabs" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            {moreTabs.map(([id, label]) => (
              <button key={id} className={'sheet-item' + (active === id ? ' on' : '')} onClick={() => go(id)}>
                <span className="ic">{ICONS[id]}</span>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

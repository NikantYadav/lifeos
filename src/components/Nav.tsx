export type Tab =
  | 'today' | 'timetable' | 'plans' | 'week' | 'people'
  | 'reps' | 'quests' | 'body' | 'phases';

const TABS: [Tab, string][] = [
  ['today', 'Today'],
  ['timetable', 'Timetable'],
  ['plans', 'Plans'],
  ['week', 'Scorecard'],
  ['people', 'People'],
  ['reps', 'Approach log'],
  ['quests', 'Side quests'],
  ['body', 'Body'],
  ['phases', '24 weeks'],
];

export default function Nav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav role="tablist">
      {TABS.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={active === id}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

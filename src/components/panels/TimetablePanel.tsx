import { WEEK } from '@/lib/data';
import SchedList from '../SchedList';

const ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function TimetablePanel({ dayOfWeek }: { dayOfWeek: number }) {
  return (
    <section className="panel">
      <h2>The whole week</h2>
      <p className="note">Every block has a place. If a block has no place, it will not happen.</p>
      <div>
        {ORDER.map((d) => {
          const [label, rows] = WEEK[d];
          return (
            <div key={d}>
              <h2>{label}</h2>
              <div className="box">
                <SchedList rows={rows} noKey={d !== dayOfWeek} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

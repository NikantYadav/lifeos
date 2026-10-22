/**
 * Golden fixtures for the Kotlin on-device block notifications (lifeos-launcher, notify/NotifyLogic.kt).
 * Runs the REAL `dueBlocks` from src/lib/schedulePush.ts over the seed schedule x a wall-clock matrix.
 *
 *   npx -y tsx --tsconfig tsconfig.json scripts/parity/golden/notify.ts
 *
 * Wall ms (Date.UTC of local wall-clock components) are emitted as "YYYY-MM-DDTHH:MM" strings.
 */
import fs from 'node:fs';
import path from 'node:path';
import { dueBlocks } from '../../../src/lib/schedulePush';
import { AppState } from '../../../src/lib/types';

const LAUNCHER = '/home/nikant/Desktop/lifeos-launcher/data/lifeos/src/test/resources';
const seed: AppState = JSON.parse(fs.readFileSync(path.join(LAUNCHER, 'seed_state.json'), 'utf8'));

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

const times = new Set<string>(['00:10', '00:40', '01:05', '12:00', '23:59']);
for (const entry of Object.values(seed.schedule)) for (const r of entry[1]) times.add(r[0]);

const inputs: unknown[] = [];
const outputs: unknown[] = [];
for (const startDate of ['2026-09-15', '2026-09-14']) {
  const state = { ...seed, startDate };
  for (let day = 0; day < 16; day++) {
    for (const t of times) {
      const [h, m] = t.split(':').map(Number);
      for (const off of [0, 7, 11]) {
        const now = Date.UTC(2026, 8, 13 + day, h, m + off);
        for (const lastSentOff of [null, 3]) {
          const lastSent = lastSentOff === null ? null : now - lastSentOff * 6e4;
          const due = dueBlocks(state.schedule, startDate, now, lastSent);
          inputs.push({ startDate, now: fmt(now), lastSent: lastSent === null ? null : fmt(lastSent) });
          outputs.push(due.map((b) => ({ at: fmt(b.at), time: b.row[0], title: b.row[1], note: b.row[2] })));
        }
      }
    }
  }
}
const out = path.join(LAUNCHER, 'golden');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'notify.json'), JSON.stringify({ inputs, outputs }));
console.log(`notify.json: ${inputs.length} cases`);

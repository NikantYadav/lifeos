import { currentWeekIndex, weekLetter } from './dates';
import { SCHEDULE_TZ } from './schedulePush';
import { AppState, Plan } from './types';

/**
 * Server-only (calls Gemini with GEMINI_API_KEY). The chat endpoint is
 * proposal-only: nothing here writes state.
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const TIMEOUT_MS = 60_000;

export const MAX_TEXT_CHARS = 4000;
const MAX_MESSAGES = 30;
const MAX_HISTORY_CHARS = 24_000;

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const pad = (n: number) => String(n).padStart(2, '0');

/** Calendar date, wall-clock time and weekday of `now` in the schedule timezone. */
export function zonedNow(now: Date, tz: string = SCHEDULE_TZ) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)])
  );
  const y = parts.year, mo = parts.month, d = parts.day;
  return {
    date: `${y}-${pad(mo)}-${pad(d)}`,
    time: `${pad(parts.hour)}:${pad(parts.minute)}`,
    weekday: new Date(Date.UTC(y, mo - 1, d)).getUTCDay(),
    /** Local-calendar Date for the zoned day, as currentWeekIndex expects. */
    localDate: new Date(y, mo - 1, d),
    utcDay: Date.UTC(y, mo - 1, d),
  };
}

function stripFixed(plan: Plan): Omit<Plan, 'bad' | 'ask'> {
  const rest: Plan = { ...plan };
  delete rest.bad;
  delete rest.ask;
  return rest;
}

export function buildChatContext(state: AppState, now: Date) {
  const z = zonedNow(now);
  const wi = currentWeekIndex(z.localDate, state.startDate);

  const schedule = DAY_ORDER.filter((d) => state.schedule[d]).map((d) => {
    const [label, rows] = state.schedule[d];
    return {
      dayOfWeek: d,
      name: DAY_NAMES[d],
      label,
      rows: rows.map((r, index) => ({
        index,
        time: r[0],
        title: r[1],
        note: r[2],
        isKeyBlock: r[3] ? 1 : 0,
        planId: r[4] ?? null,
        week: r[5] ?? null,
      })),
    };
  });

  const recent: Record<string, { checks: string[]; counts: Record<string, number> }> = {};
  for (let i = 0; i < 14; i++) {
    const dt = new Date(z.utcDay - i * 864e5);
    const key = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
    const e = state.days[key];
    if (e) recent[key] = { checks: Object.keys(e.c), counts: e.n };
  }

  return {
    now: {
      date: z.date,
      time: z.time,
      weekday: DAY_NAMES[z.weekday],
      dayOfWeek: z.weekday,
      timezone: SCHEDULE_TZ,
      weekIndex: wi,
      weekLetter: weekLetter(wi),
    },
    planStartDate: state.startDate,
    plans: state.plans.map(stripFixed),
    schedule,
    weekGoals: state.weekGoals,
    checks: state.checks.map(([key, label, sub, days]) => ({ key, label, sub, days: days ?? 'every day' })),
    counts: state.counts.map(([key, label]) => ({ key, label })),
    pendingTasks: state.tasks
      .filter((t) => t.status === 'pending')
      .map((t) => ({ id: t.id, title: t.title, detail: t.detail, planId: t.planId, triggerWeek: t.triggerWeek })),
    habits: state.habits.map((h) => ({ id: h.id, title: h.title, planId: h.planId, cadence: h.cadence, lastDone: h.lastDone })),
    people: state.people.map((p) => ({ name: p.name, stage: p.stage })),
    last14Days: recent,
    recentSkipReasons: state.skips.slice(-15).map((s) => ({ date: s.date, checkKey: s.checkKey, reason: s.reason, note: s.note })),
  };
}

export function buildSystemPrompt(state: AppState, now: Date): string {
  return `You are the assistant inside LifeOS, one person's private life-planning app. Be concise and direct, like a sharp friend who knows the plan. No motivational coaching, no praise filler, no long preambles.

Answer questions about the plan, schedule, goals, habits and tracking from the DATA below. If the data doesn't say, say so.

You may attach proposed changes ("proposedDiffs"). They are only proposals: the user accepts or rejects each one on their phone, and nothing is written until they accept. Propose diffs only when the user asks for a change or one is clearly implied; otherwise return an empty proposedDiffs array. Explain proposed changes briefly in "reply".

Diff kinds:
1. "scheduleRow" — edit the timetable. PREFER this for any timetable change. Set op "add" | "update" | "remove", dayOfWeek (0=Sunday..6), and index = the row's index as shown in DATA for that day (the full stored row list, A and B rows both counted). For "update" and "remove" the index must exist. For "add", index is the insertion position 0..number of rows, chosen to keep rows in time order (rows after midnight sit at the end, after the late-evening rows). "row" is required for add and update: {time "HH:MM", title, note, isKeyBlock 0|1, planId (an id from plans, or omit), week "A"|"B" (omit for every week)}. For update, give the complete new row (copy unchanged fields from the existing row). Rows listed with a week only run in that alternating week.
2. "plan" — change a plan's aim, when, where, how, quota, warn or milestones (set planId and field). Give before/after as text.
3. "schedule" — change a day's label (set dayOfWeek; before/after text). Use scheduleRow for row edits.
4. "weekGoals" — change a weekly numeric target. Set key (from weekGoals); before and after are the numbers as strings.
5. "task" — op "add" (title, detail, triggerWeek 0-based, optional planId), "drop" or "retime" (existingId from pendingTasks; retime also needs triggerWeek).
6. "habit" — op "add" (title, optional planId, optional cadence {kind "everyNDays", n} | {kind "weeklyOnDays", days [0-6]} | {kind "everyNWeeks", n}) or "drop" (existingId from habits).
Every diff needs a short "reason".

Rules:
- Never propose changes to a plan's "bad" or "ask" fields; they are fixed and not shown to you.
- When a change applies to several days, emit one diff per day.
- Never invent ids. drop/retime must use an id from the data.
- If a request is ambiguous (which day, which row, what time), ask one short clarifying question and propose nothing.
- Resolve relative dates ("tomorrow", "next week") from the current date/time in DATA.

DATA:
${JSON.stringify(buildChatContext(state, now))}`;
}

const ROW_SCHEMA = {
  type: 'object',
  properties: {
    time: { type: 'string' },
    title: { type: 'string' },
    note: { type: 'string' },
    isKeyBlock: { type: 'integer' },
    planId: { type: 'string' },
    week: { type: 'string', enum: ['A', 'B'] },
  },
  required: ['time', 'title'],
};

// 'bad' and 'ask' are absent from the field enum so a conformant response can't name them.
export const CHAT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    proposedDiffs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['plan', 'schedule', 'weekGoals', 'task', 'habit', 'scheduleRow'] },
          op: { type: 'string', enum: ['add', 'drop', 'retime', 'update', 'remove'] },
          planId: { type: 'string' },
          field: { type: 'string', enum: ['aim', 'when', 'where', 'how', 'quota', 'warn', 'milestones'] },
          dayOfWeek: { type: 'integer' },
          index: { type: 'integer' },
          row: ROW_SCHEMA,
          key: { type: 'string' },
          existingId: { type: 'string' },
          title: { type: 'string' },
          detail: { type: 'string' },
          triggerWeek: { type: 'integer' },
          cadence: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['everyNDays', 'weeklyOnDays', 'everyNWeeks'] },
              n: { type: 'integer' },
              days: { type: 'array', items: { type: 'integer' } },
            },
            required: ['kind'],
          },
          before: { type: 'string' },
          after: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['kind', 'reason'],
      },
    },
  },
  required: ['reply', 'proposedDiffs'],
};

/** Last ~30 messages within a character budget, starting on a user turn, same-role turns merged. */
export function trimMessages(messages: ChatMessage[]): ChatMessage[] {
  const kept: ChatMessage[] = [];
  let chars = 0;
  for (let i = messages.length - 1; i >= 0 && kept.length < MAX_MESSAGES; i--) {
    chars += messages[i].text.length;
    if (chars > MAX_HISTORY_CHARS && kept.length > 0) break;
    kept.unshift(messages[i]);
  }
  while (kept.length > 1 && kept[0].role !== 'user') kept.shift();
  const merged: ChatMessage[] = [];
  for (const m of kept) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.text += '\n' + m.text;
    else merged.push({ ...m });
  }
  return merged;
}

export interface GeminiChatResult {
  reply: string;
  proposedDiffs: unknown[];
}

export async function callGeminiChat(state: AppState, messages: ChatMessage[], now: Date): Promise<GeminiChatResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildSystemPrompt(state, now) }] },
      contents: trimMessages(messages).map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }],
      })),
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: CHAT_RESPONSE_SCHEMA,
        temperature: 0.4,
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') throw new Error('Gemini returned no content');
  return JSON.parse(text) as GeminiChatResult;
}

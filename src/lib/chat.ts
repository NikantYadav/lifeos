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

  const recent: Record<string, { checks: Record<string, boolean>; counts: Record<string, number> }> = {};
  const approachOutcomes: Record<string, number> = {};
  const recentKeys = new Set<string>();
  for (let i = 0; i < 14; i++) {
    const dt = new Date(z.utcDay - i * 864e5);
    const key = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
    recentKeys.add(key);
    const e = state.days[key];
    if (e) recent[key] = { checks: e.c, counts: e.n };
  }
  for (const a of state.approaches) {
    if (recentKeys.has(a.date)) approachOutcomes[a.out] = (approachOutcomes[a.out] ?? 0) + 1;
  }

  const keyBlockKeys = [
    ...new Set(Object.values(state.schedule).flatMap(([, rows]) => rows.filter((r) => r[3] && r[4]).map((r) => r[4] as string))),
  ];

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
    weekNumberConvention:
      'Week numbers are 0-based plan-week indexes: week 0 is the Monday-aligned week containing planStartDate, and the current week is now.weekIndex. The UI shows week+1. Applies to milestone weeks, milestone check-in weeks and task triggerWeek. A milestone at week w is due once w <= now.weekIndex.',
    planStartDate: state.startDate,
    plans: state.plans.map((p) => {
      const { milestones, ...rest } = stripFixed(p);
      return { ...rest, milestones: (milestones ?? []).map(([week, description]) => ({ week, description })) };
    }),
    milestoneCheckIns: state.milestoneChecks.map((m) => ({ planId: m.planId, week: m.week, status: m.status, note: m.note })),
    schedule,
    checks: state.checks.map(([key, label, sub, days]) => ({
      key,
      label,
      sub,
      days: days && days.length ? days : 'every day',
    })),
    scheduleKeyBlockKeys: keyBlockKeys,
    weekGoals: state.weekGoals,
    pendingTasks: state.tasks
      .filter((t) => t.status === 'pending')
      .map((t) => ({ id: t.id, title: t.title, detail: t.detail, planId: t.planId, triggerWeek: t.triggerWeek })),
    habits: state.habits.map((h) => ({ id: h.id, title: h.title, planId: h.planId, cadence: h.cadence, lastDone: h.lastDone })),
    people: state.people.map((p) => ({ id: p.id, name: p.name, where: p.where, stage: p.stage, last: p.last })),
    approachesLast14DaysByOutcome: approachOutcomes,
    recentWeights: state.weights.slice(-5).map((w) => ({ date: w.date, kg: w.kg })),
    last14Days: recent,
    recentSkipReasons: state.skips.slice(-15).map((s) => ({ date: s.date, checkKey: s.checkKey, reason: s.reason, note: s.note })),
  };
}

function weekIndexNow(state: AppState, now: Date): number {
  return currentWeekIndex(zonedNow(now).localDate, state.startDate);
}

export function buildSystemPrompt(state: AppState, now: Date): string {
  return `You are the assistant inside LifeOS, one person's private life-planning app. Be concise and direct, like a sharp friend who knows the plan. No motivational coaching, no praise filler, no long preambles.

Answer questions about the plan, schedule, goals, habits and tracking from the DATA below. If the data doesn't say, say so.

You may attach proposed changes ("proposedDiffs"). They are only proposals: the user accepts or rejects each one on their phone, and nothing is written until they accept. Propose diffs only when the user asks for a change or one is clearly implied; otherwise return an empty proposedDiffs array. Explain proposed changes briefly in "reply".

Diff kinds (each needs a short "reason"; fill "before"/"after" as short text for display, the server corrects "before" from real state):
1. "scheduleRow" — edit the timetable. PREFER this for any timetable change. Set op "add" | "update" | "remove", dayOfWeek (0=Sunday..6), and index = the row's index as shown in DATA for that day (the full stored row list, A and B rows both counted). For "update" and "remove" the index must exist. For "add", index is the insertion position 0..number of rows, chosen to keep rows in time order (rows after midnight sit at the end, after the late-evening rows). "row" is required for add and update: {time "HH:MM", title, note, isKeyBlock 0|1, planId (an id from plans, or omit), week "A"|"B" (omit for every week)}. For update, give the complete new row (copy unchanged fields from the existing row). Rows listed with a week only run in that alternating week.
2. "plan" — change an existing plan's aim, when, where, how, quota or warn (set planId and field; before/after as text). For field "milestones" use the structured "milestones" array instead of "after": the COMPLETE replacement list [{week, description}], weeks 0-30 (0-based, see weekNumberConvention), descriptions max 200 chars, max 20 entries. Milestones are always a full-list replacement: start from the plan's current milestones in DATA, add/edit/remove entries, and send the whole result.
3. "newPlan" — a brand-new plan. ONLY when the user explicitly asks to create a plan. Set "plan": {id (lowercase a-z 0-9 and "-", 2-32 chars, not an existing plan id), name, aim, optional when/where/how/quota (string arrays), warn, milestones [{week, description}]}. Never include "bad" or "ask".
4. "schedule" — change a day's label (set dayOfWeek; before/after text). Use scheduleRow for row edits.
5. "weekGoals" — change an existing weekly target (days per week for gym, out, protein). Set key (from weekGoals); before and after are the numbers as strings.
6. "task" — op "add" (title, detail, triggerWeek 0-based, optional planId), "drop" or "retime" (existingId from pendingTasks; retime also needs triggerWeek).
7. "habit" — op "add" (title, optional planId, optional cadence), "drop" (existingId from habits), or "retime" (existingId from habits plus a required new cadence). cadence is {kind "everyNDays", n} | {kind "weeklyOnDays", days [0-6]} | {kind "everyNWeeks", n}.
8. "check" — the daily checklist. op "add" (key = new lowercase slug a-z 0-9 "-" 2-32 chars not already a check key, label, optional sub, optional days = weekdays 0=Sunday..6 the check is due; omit for every day), "update" (existing key; give only the fields that change; days null = make it daily), "remove" (existing key).
9. "log" — log something on the user's behalf. ONLY when the user says they did something (or asks you to log it), never from a plan or an assumption. Still a proposal the user accepts. Set "target" and "date" (YYYY-MM-DD, today or up to 14 days back; resolve "yesterday"/"on Tuesday" from now.date):
   - target "check": key (an existing check key, or a key in scheduleKeyBlockKeys) and done true/false.
   - target "person": person {name, optional where, stage 1-4, last (date)}. To update someone already in people, include their id. Without an id it creates a new person.
   - target "weight": kg (30-250).
   - target "approach": approach {where, opener, out one of bailed|short|good|ig|closed, lesson}.
10. "milestoneCheck" — record how a plan milestone went: planId, week (must be an existing milestone week of that plan), status "hit"|"partial"|"missed", optional note. Only when the user tells you the result.

Rules:
- Never propose changes to a plan's "bad" or "ask" fields; they are fixed and not shown to you.
- Never create a new plan unless the user asks for one. Never invent ids or keys for existing things: ids and keys for edit/drop/retime/log/update/remove must come from DATA.
- Log only what the user states they did. Do not log on your own initiative.
- When a change applies to several days, emit one diff per day.
- If a request is ambiguous (which day, which row, what value, what time), ask one short clarifying question and propose nothing.
- Resolve relative dates ("tomorrow", "next week") from the current date/time in DATA. Week numbers follow weekNumberConvention in DATA; the current week index is ${weekIndexNow(state, now)}.

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

const MILESTONES_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: { week: { type: 'integer' }, description: { type: 'string' } },
    required: ['week', 'description'],
  },
};
const STRINGS = { type: 'array', items: { type: 'string' } };

// 'bad' and 'ask' are absent from the field enum and the plan object so a conformant response can't name them.
export const CHAT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    proposedDiffs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['plan', 'schedule', 'weekGoals', 'task', 'habit', 'scheduleRow', 'newPlan', 'check', 'log', 'milestoneCheck'],
          },
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
          // plan field "milestones": the full replacement list (mapped to `after` by the sanitizer).
          milestones: MILESTONES_SCHEMA,
          // newPlan
          plan: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              aim: { type: 'string' },
              when: STRINGS,
              where: STRINGS,
              how: STRINGS,
              quota: STRINGS,
              warn: { type: 'string' },
              milestones: MILESTONES_SCHEMA,
            },
            required: ['id', 'name', 'aim'],
          },
          // check
          label: { type: 'string' },
          sub: { type: 'string' },
          days: { type: 'array', items: { type: 'integer' }, nullable: true },
          // log
          target: { type: 'string', enum: ['check', 'person', 'weight', 'approach'] },
          date: { type: 'string' },
          done: { type: 'boolean' },
          value: { type: 'number' },
          kg: { type: 'number' },
          person: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              where: { type: 'string' },
              stage: { type: 'integer' },
              last: { type: 'string' },
            },
            required: ['name'],
          },
          approach: {
            type: 'object',
            properties: {
              where: { type: 'string' },
              opener: { type: 'string' },
              out: { type: 'string', enum: ['bailed', 'short', 'good', 'ig', 'closed'] },
              lesson: { type: 'string' },
            },
            required: ['out'],
          },
          // milestoneCheck
          week: { type: 'integer' },
          status: { type: 'string', enum: ['hit', 'partial', 'missed'] },
          note: { type: 'string' },
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

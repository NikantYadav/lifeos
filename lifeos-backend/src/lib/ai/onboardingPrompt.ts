import { Type, type Schema } from '@/lib/ai/gemini';

/**
 * The system instruction for the onboarding chat, and the `responseSchema`
 * used only on the extraction call (`/api/onboarding/propose`), never on
 * plain chat turns — asking the model for constrained JSON mid-conversation
 * makes it a worse conversationalist, so the two calls are kept separate
 * (see the route: chat uses `chatReply`, propose uses `generateStructured`
 * with this schema).
 *
 * Kept in its own module (not inlined in the route) because this is exactly
 * the kind of prompt content that changes independently of the request-
 * handling code around it, same reasoning as keeping validation in its own
 * `lib/validation/*.ts` files.
 */

export const ONBOARDING_CHAT_SYSTEM_INSTRUCTION = `You are the onboarding guide for LifeOS, an app that helps people track \
progress on personal goals with an AI-authored daily tracking setup instead \
of a generic habit-tracker template.

Have a short, focused conversation (aim for 4-8 of your own turns, not an \
open-ended interview) to learn:
- What the person is actually trying to achieve (their goals, in their words).
- Their current routine/constraints (job, schedule, energy patterns) enough \
to place realistic time blocks.
- What "on track" vs "off track" looks like for each goal — this becomes \
tracker targets later.

Ask one focused question at a time. Do not ask the person to design their \
own trackers or schedule — that is your job once the conversation has enough \
signal, not theirs. When you believe you understand enough to propose a \
concrete plan, say so plainly (e.g. "I think I have enough to put together a \
plan for you — ready to see it?") so the app knows to move to the next step. \
Keep replies conversational and brief; this is a chat, not a form.`;

export const ONBOARDING_EXTRACTION_SYSTEM_INSTRUCTION = `You just finished an onboarding conversation with a new LifeOS user. \
Based on the ENTIRE conversation above, produce a structured plan: the \
goals (plans) they're working toward, a weekly schedule of time blocks, and \
whatever trackers will let them log daily progress.

Rules:
- Every plan needs a short, stable "ref" string (e.g. "study", "fitness") — \
other items reference plans by this ref, not by a database id you don't have.
- Schedule block "day_of_week" is always an integer 0-6 (0=Sunday ... \
6=Saturday), never 7 or a day name.
- Prefer the fixed tracker kinds (checkbox, numeric, counter, timed, scale) \
over "log" whenever one of them fits — only use "log" when the person's goal \
genuinely needs multiple free-form fields per entry (e.g. a workout with \
sets/reps, or an outreach log with outcome+notes). For "log" trackers, invent \
a "fields" array: each field has key (lowercase_snake_case), type \
(text/number/select/boolean/date), label, and options (only for type \
"select").
- Only give a tracker a "target" when the conversation implies a concrete \
daily/weekly amount — do not invent a number that was never discussed.
- Do not invent goals, schedule times, or targets that weren't discussed or \
reasonably implied — it is fine to propose fewer, well-grounded items over \
many speculative ones.
- Be concise everywhere: short names/titles (a few words), short free-text \
fields (a sentence or two, not paragraphs), and no more than a handful of \
items in any list (when/where/how/quota/ask/milestones) — nothing here \
needs to be exhaustive.
- Propose at most 5 plans, 20 schedule blocks, 10 trackers, 15 tasks, and \
10 habits in total.
- Write "summary" as 2-4 sentences a person would actually want to read: \
"Here's what I put together..." — this is shown to them before they accept \
anything.`;

/**
 * IMPORTANT — every numeric constraint (`maxLength`, `maxItems`, `minItems`,
 * etc.) is deliberately absent from every schema below, even though the
 * `Schema` type supports them and earlier revisions of this file used them
 * (name/title caps, array-size caps matching the Zod limits one-for-one).
 * They were removed after bisecting a live, reproducible failure: Gemini's
 * structured-output endpoint returns a bare 400 ("Request contains an
 * invalid argument", no field-level detail) for numeric-constrained schemas
 * in ways that don't reduce to one clean rule — confirmed triggers included
 * two sibling ARRAY-of-STRING properties with identical `maxItems`/
 * `items.maxLength`, an outer array-of-objects `maxItems` combined with ANY
 * `maxItems` on a descendant array at any depth, and (once those were both
 * fixed) it was *still* rejecting deterministically until every numeric cap
 * in the whole tree was removed — three separate live-verified rounds, see
 * this file's git history / the onboarding build-status memory entry for
 * the specific repro cases. This is a real constraint of the API/model as
 * used here, not a guess: don't reintroduce `maxLength`/`maxItems` on this
 * schema without re-verifying against the live endpoint first.
 *
 * This is safe because `responseSchema` was never the real security/size
 * boundary in the first place — `onboardingProposalSchema` (Zod, in
 * lib/validation/onboarding.ts) re-validates every one of these same caps
 * for real when the proposal comes back from `/propose` and again at
 * `/commit`. What's lost by dropping the caps here is a nudge that made the
 * model's *first* draft more likely to already fit them, not any actual
 * guarantee — the extraction system instruction above compensates with
 * explicit brevity/count instructions in plain English instead, and
 * `generationConfig.maxOutputTokens` (see gemini.ts) bounds worst-case
 * response size as a blunter backstop.
 */
const enumStr = (values: readonly string[]): Schema => ({ type: Type.STRING, format: 'enum', enum: [...values] });

const milestoneSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    week: { type: Type.INTEGER },
    description: { type: Type.STRING },
  },
  required: ['week', 'description'],
};

const planSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    ref: { type: Type.STRING },
    name: { type: Type.STRING },
    aim: { type: Type.STRING },
    when: { type: Type.ARRAY, items: { type: Type.STRING } },
    where: { type: Type.ARRAY, items: { type: Type.STRING } },
    how: { type: Type.ARRAY, items: { type: Type.STRING } },
    quota: { type: Type.ARRAY, items: { type: Type.STRING } },
    good: { type: Type.STRING },
    bad: { type: Type.STRING },
    warn: { type: Type.STRING },
    ask: { type: Type.ARRAY, items: { type: Type.STRING } },
    milestones: { type: Type.ARRAY, items: milestoneSchema },
  },
  required: ['ref', 'name'],
};

const scheduleBlockSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    // `description` (plain metadata, not a numeric constraint) is safe —
    // confirmed by live testing that it never triggers the maxLength/
    // maxItems collision this file's schemas otherwise avoid. Used here
    // because a bare INTEGER gave the model no signal about the 0-6
    // convention, and a real run emitted day_of_week=7 — caught by Zod
    // (the actual gate) but wasted a full extraction round-trip on a retry.
    day_of_week: { type: Type.INTEGER, description: 'Day of week as an integer: 0=Sunday, 1=Monday, ..., 6=Saturday. Never 7 or higher.' },
    start_time: { type: Type.STRING, description: 'HH:MM 24-hour time, e.g. "19:00"' },
    end_time: { type: Type.STRING, description: 'HH:MM 24-hour time, must be after start_time' },
    title: { type: Type.STRING },
    note: { type: Type.STRING },
    is_key_block: { type: Type.BOOLEAN },
    plan_ref: { type: Type.STRING },
  },
  required: ['day_of_week', 'start_time', 'title'],
};

const trackerFieldSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    key: { type: Type.STRING },
    type: enumStr(['text', 'number', 'select', 'boolean', 'date']),
    label: { type: Type.STRING },
    options: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['key', 'type', 'label'],
};

const cadenceSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    kind: enumStr(['daily', 'weekly', 'custom']),
    days: { type: Type.ARRAY, items: { type: Type.INTEGER } },
  },
  required: ['kind'],
};

const trackerSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    description: { type: Type.STRING },
    kind: enumStr(['checkbox', 'numeric', 'counter', 'timed', 'scale', 'log']),
    unit: { type: Type.STRING },
    target: { type: Type.NUMBER },
    cadence: cadenceSchema,
    fields: { type: Type.ARRAY, items: trackerFieldSchema },
    plan_ref: { type: Type.STRING },
  },
  required: ['name', 'kind'],
};

const taskSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    detail: { type: Type.STRING },
    trigger_week: { type: Type.INTEGER },
    plan_ref: { type: Type.STRING },
  },
  required: ['title'],
};

const habitSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    cadence: cadenceSchema,
    plan_ref: { type: Type.STRING },
  },
  required: ['title'],
};

export const ONBOARDING_PROPOSAL_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    plans: { type: Type.ARRAY, items: planSchema },
    schedule_blocks: { type: Type.ARRAY, items: scheduleBlockSchema },
    trackers: { type: Type.ARRAY, items: trackerSchema },
    tasks: { type: Type.ARRAY, items: taskSchema },
    habits: { type: Type.ARRAY, items: habitSchema },
  },
  required: ['summary', 'plans'],
};

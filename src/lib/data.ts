import { Habit, Plan, SchedRow, Task, WeekSchedule } from './types';

export const START = new Date(2026, 8, 15);
export const END = new Date(2027, 2, 1);
export const DAYNAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Everything below prefixed SEED_ is a one-time default, copied into AppState
 * by migrateState() on first load and then owned by the saved state — these
 * exports must never be imported by anything that reads "live" data (panels
 * read state.plans/state.schedule/etc., not these).
 */
/**
 * Nightly wind-down stack, appended (in this order) before Sleep on every day
 * that has room for it. Each is its own key block so it shows up as its own
 * toggleable item in the Today activity list — see TodayPanel.
 */
const NECK_ROW: SchedRow = ['22:35', 'Neck exercises — 5 min', 'Isometrics, sideways stretches, chin tucks', 1, 'neck'];
const POSTURE_ROW: SchedRow = ['22:40', 'Posture — 5 min', 'Wall angels, doorway chest stretch, prone Y-raise', 1, 'posture'];
const SEXUAL_HEALTH_ROW: SchedRow = ['22:45', 'Kegels + reverse kegel — 5 min', '', 1, 'sexual-health'];
const JOURNAL_ROW: SchedRow = ['22:50', 'Journal — 10 min', 'Write it down before the day is gone', 1, 'journal'];
/** Mon and Thu only, per the dating plan's `when` — after the wind-down stack, still before Sleep. */
const PHOTO_DRILL_ROW: SchedRow = ['22:55', 'Photo drill — 10 min', 'Mirror. Five positions cold — weight on back foot, three-quarter turn, walking shot, leaning, candid laugh.', 1, 'dating'];

export const SEED_SCHEDULE: WeekSchedule = {
  1: ['Monday — office. Chest, biceps.', [
    ['07:30', 'Wake', 'Phone stays across the room'],
    ['07:45', 'Walk', 'Same route, same juice stall, same time.'],
    ['08:15', 'Breakfast, 6 eggs, shower', ''],
    ['08:45', 'Startup — 1.5h', 'Your room, your monitor, phone in a drawer', 1, 'startup'],
    ['10:15', 'Bus to Kadubeesanahalli', 'Read on the bus', undefined, 'read'],
    ['11:00', 'Job work + lunch', ''],
    ['15:00', 'Shoulder rehab — 5–8 min', 'Band external rotations, light scaption raises. Before the lift, low load.', 1, 'shoulder'],
    ['15:15', 'Gym — 90 min', 'Chest, biceps, plus shrugs and face pulls. Fresh t-shirt after. Shower at home.', 1, 'gym'],
    ['17:00', 'Bus home', ''],
    ['17:50', 'Shower, protein', ''],
    ['18:30', 'Your café — 2h', "Same table, same time. Read + 2 conversations + 1 approach. Learn the staff's names.", 1, 'places'],
    ['20:30', 'Dinner', ''],
    ['21:30', 'Russian — 20 min', '', undefined, 'russian'],
    ['22:00', 'Read', '', undefined, 'read'],
    ['22:20', 'Impromptu / Dictio — 10 min', 'Articulation and dictation practice', 1, 'speak'],
    NECK_ROW, POSTURE_ROW, SEXUAL_HEALTH_ROW, JOURNAL_ROW, PHOTO_DRILL_ROW,
    ['23:00', 'Sleep', ''],
  ]],
  2: ['Tuesday — WFH + gym trip. Back, triceps.', [
    ['07:45', 'Wake', ''],
    ['08:00', 'Walk', ''],
    ['08:30', 'Startup — 3h', 'Best block of your week', 1, 'startup'],
    ['11:30', 'Food, job work at PG', ''],
    ['13:00', 'Bus to office', 'Off-peak. 20–25 min instead of 45.'],
    ['13:45', 'Job work at office', ''],
    ['15:00', 'Shoulder rehab — 5–8 min', 'Band external rotations, light scaption raises. Before the lift, low load.', 1, 'shoulder'],
    ['15:15', 'Gym — 90 min', 'Back, triceps, plus shrugs and face pulls.', 1, 'gym'],
    ['16:50', 'Bus home', ''],
    ['17:20', 'Shower, protein', ''],
    ['18:30', 'Badminton — 90 min', 'Machaxi Scooled, AECS Layout. Solo slot on Playo. Same slot every week.', 1, 'social'],
    ['20:00', 'Stay back 20 min', 'Never leave straight after. This is where the group chat comes from.', 1, 'social'],
    ['20:30', 'Dinner', ''],
    ['21:30', 'DJ — 45 min', '', undefined, 'dj'],
    ['22:20', 'Impromptu / Dictio — 10 min', 'Articulation and dictation practice', 1, 'speak'],
    NECK_ROW, POSTURE_ROW, SEXUAL_HEALTH_ROW, JOURNAL_ROW,
    ['23:00', 'Sleep', ''],
  ]],
  3: ['Wednesday — WFH + gym trip. Shoulders, legs.', [
    ['07:45', 'Wake', ''],
    ['08:00', 'Walk', ''],
    ['08:30', 'Startup — 3h', '', 1, 'startup'],
    ['11:30', 'Food, job work at PG', ''],
    ['13:00', 'Bus to office', ''],
    ['13:45', 'Job work at office', ''],
    ['15:00', 'Shoulder rehab — 5–8 min', 'Band external rotations, light scaption raises. Before the lift, low load.', 1, 'shoulder'],
    ['15:15', 'Gym — 90 min', 'Shoulders, legs, plus shrugs and face pulls.', 1, 'gym'],
    ['16:50', 'Bus home', ''],
    ['17:20', 'Shower', ''],
    ['18:00', 'DJ — 1h', '', undefined, 'dj'],
    ['19:00', 'Write one story', 'Rework one thing that happened to you into 90 seconds', 1, 'speak'],
    ['19:30', 'Dinner', ''],
    ['20:30', 'Russian, reading', 'Your one full rest evening. Stay in.', 1, 'russian'],
    ['22:20', 'Impromptu / Dictio — 10 min', 'Articulation and dictation practice', 1, 'speak'],
    NECK_ROW, POSTURE_ROW, SEXUAL_HEALTH_ROW, JOURNAL_ROW,
    ['23:00', 'Sleep', ''],
  ]],
  4: ['Thursday — office. Chest, biceps.', [
    ['07:30', 'Wake', ''],
    ['07:45', 'Walk', ''],
    ['08:45', 'Startup — 1.5h', '', 1, 'startup'],
    ['10:15', 'Bus to office', ''],
    ['11:00', 'Job work + lunch', ''],
    ['15:00', 'Shoulder rehab — 5–8 min', 'Band external rotations, light scaption raises. Before the lift, low load.', 1, 'shoulder'],
    ['15:15', 'Gym — 90 min', 'Chest, biceps, plus shrugs and face pulls.', 1, 'gym'],
    ['17:00', 'Bus home', ''],
    ['17:50', 'Shower, protein', ''],
    ['18:30', 'New room — 2h', 'Second Playo slot, a Zone A meetup, or a new café on a quiet night so you can talk to the staff.', 1, 'places'],
    ['20:30', 'Dinner', ''],
    ['21:30', 'Russian', '', undefined, 'russian'],
    ['22:20', 'Impromptu / Dictio — 10 min', 'Articulation and dictation practice', 1, 'speak'],
    NECK_ROW, POSTURE_ROW, SEXUAL_HEALTH_ROW, JOURNAL_ROW, PHOTO_DRILL_ROW,
    ['23:00', 'Sleep', ''],
  ]],
  5: ['Friday — office. Back, triceps, shoulders.', [
    ['07:30', 'Wake', ''],
    ['07:45', 'Walk', ''],
    ['08:45', 'Startup — 1.5h', '', 1, 'startup'],
    ['10:15', 'Bus to office', ''],
    ['11:00', 'Job work + lunch', ''],
    ['15:00', 'Shoulder rehab — 5–8 min', 'Band external rotations, light scaption raises. Before the lift, low load.', 1, 'shoulder'],
    ['15:15', 'Gym — 90 min', 'Back, triceps, shoulders, plus shrugs and face pulls.', 1, 'gym'],
    ['17:00', 'Bus home', ''],
    ['17:50', 'Shower, best outfit of the week', ''],
    ['18:15', 'Neck exercises — 5 min', 'Isometrics, sideways stretches, chin tucks — done early since tonight runs late', 1, 'neck'],
    ['18:20', 'Posture — 5 min', 'Wall angels, doorway chest stretch, prone Y-raise', 1, 'posture'],
    ['18:25', 'Kegels + reverse kegel — 5 min', '', 1, 'sexual-health'],
    ['18:30', 'Journal — 10 min', 'Write yesterday and today down before you head out', 1, 'journal'],
    ['20:00', 'Out', 'You make the plan and you make the group chat, even if it is four people. Take photos of everyone.', 1, 'social'],
    ['02:00', 'Home', ''],
  ]],
  6: ['Saturday.', [
    ['09:30', 'Wake', 'You were out. No early run.'],
    ['11:00', 'Free — 4h', 'Errands, reading, whatever the week did not leave room for.', 1],
    ['15:00', 'Lunch somewhere new', 'Bring the book if you are solo'],
    ['16:00', 'Swimming — 90 min', 'Machaxi Nadando, Varthur. From week 5.', 1, 'swim'],
    ['19:00', 'Social', "Your group, someone's place, a Koramangala startup thing twice a month", 1, 'social'],
    ['22:30', 'Neck exercises — 5 min', 'Isometrics, sideways stretches, chin tucks', 1, 'neck'],
    ['22:35', 'Posture — 5 min', 'Wall angels, doorway chest stretch, prone Y-raise', 1, 'posture'],
    ['22:40', 'Kegels + reverse kegel — 5 min', '', 1, 'sexual-health'],
    ['22:45', 'Journal — 10 min', 'Write it down before the day is gone', 1, 'journal'],
    ['23:30', 'Home', ''],
  ]],
  0: ['Sunday — run, rest, plan.', [
    ['07:00', 'Wake', ''],
    ['07:30', 'Run club — 5K', 'Whitefield Run Club. RSVP the night before.', 1, 'places'],
    ['08:45', 'Coffee after the run', 'Never run and leave. 2 conversations + 1 approach. Find the organiser and talk to them.', 1, 'places'],
    ['10:00', 'Groceries', '2 trays eggs, whey, curd, peanut butter, oats, bananas', undefined, 'food'],
    ['11:00', 'Laundry, admin', ''],
    ['12:00', 'Nothing', 'Prescribed. Movie, nap, scroll if you want.', 1],
    ['17:00', 'Startup — 3h', '', 1, 'startup'],
    ['20:00', 'Book next week', 'Playo slots, run club RSVP, one invite sent', 1, 'social'],
    ['21:00', 'Dinner, read', ''],
    ['22:20', 'Impromptu / Dictio — 10 min', 'Articulation and dictation practice', 1, 'speak'],
    NECK_ROW, POSTURE_ROW, SEXUAL_HEALTH_ROW, JOURNAL_ROW,
  ]],
};

export const SPLIT: [string, string, string][] = [
  ['Mon', 'Chest, biceps', 'Bench press · Incline dumbbell press · Chest fly · Barbell curl · Preacher curl'],
  ['Tue', 'Back, triceps', 'Pull-ups/pulldown · Barbell row · Chest-supported row · Triceps pushdown · Overhead triceps extension'],
  ['Wed', 'Shoulders, legs', 'Overhead press · Lateral raise · Squat · Leg press · Leg curl'],
  ['Thu', 'Chest, biceps', 'Bench press · Incline dumbbell press · Cable fly · Barbell curl · Hammer curl'],
  ['Fri', 'Back, triceps, shoulders', 'Barbell row · Lat pulldown · Triceps pushdown · Overhead press · Rear delt fly · Band pull-aparts'],
];

/**
 * Daily additions layered on every gym session regardless of the day's
 * split — shown once, not repeated per row in SPLIT above.
 */
export const DAILY_GYM_ADDONS = 'Shrugs · Face pulls';

export const SEED_PLANS: Plan[] = [
  { id: 'principles', name: 'Principles', aim: 'The handful of ideas everything else runs on. Read this one first.',
    how: ['<b>Proximity plus repetition makes friends.</b> Not chemistry, not effort. It is why you had 10 friends in college and none here. So the whole plan is built on seeing the same people at the same place at the same time every week — the gym, the juice stall, the Tuesday court, the Sunday run.',
      '<b>Leisure routine.</b> Do not schedule "friend time". Build your fun into your routine so you see people while doing things you wanted to do anyway. Every activity should do two jobs at once — badminton is exercise and friends, run club is cardio and friends, the café is reading and approaching.',
      '<b>Invite from abundance.</b> The easiest invite is "I am already going, come along." You never have to organise something from scratch — you attach people to things already happening.',
      '<b>Spread your shots.</b> At any event, do not lock onto the first two people and stay there. Talk to as many as you can, find who you actually click with. You will not click with most people, so take more shots.',
      '<b>Open up first.</b> People match your level of disclosure. Share something real in the first hour and they will too, and you skip three months of small talk. This is how you get close friends in six months instead of two years.',
      '<b>Raise your hand.</b> When someone asks for a volunteer, be the one. Nobody else will, and it puts you next to the organiser instantly.',
      '<b>Treat people as equals.</b> At startup meetups you will meet founders you look up to. The moment you look up, you start trying too hard, and that is what kills the connection. Admire the work, treat the person normally.',
      '<b>Do not lock in.</b> Staying in your room eats your appetite for life. Five evenings out is not about productivity, it is about not going flat.'],
    warn: 'Where the case study does not transfer: he was in an expat scene where everyone was new, alone and actively hunting for friends, and he had six years of practice plus an Instagram following. Bangalore is a settled city — most people already have their circle. Same tactics, slower results. His 60 days is your six months. Do not read his timeline as your benchmark.' },

  { id: 'social', name: 'Social circle', aim: 'From nobody to 3–4 close friends and 2–3 groups by March.',
    when: ['Tue 18:30 badminton — the main one', 'Thu 18:30 second room', 'Sun 08:45 coffee after the run', 'Sat 19:00 social', 'Mon 18:30 café'],
    where: ['Machaxi Scooled Badminton, AECS Layout (0.2 km) — solo slots on Playo, ₹150–350', 'PlayTM Sports Arena Marathahalli · Sporthood Doddanekundi · Gamezy Shuttle Hub Munnekolala · iSports Arena Kundalahalli Gate', 'Whitefield Run Club — weekend mornings, 3K plus games', 'Whitefield Reads — Saturdays, free', 'One café in Marathahalli you go to every Monday'],
    how: ['Book the SAME Playo slot four weeks running. Same regulars come back. That is the trick.', 'Week 4, ask straight out: "Do you all have a group? Add me, I am here every Tuesday."', '<b>Find the organiser.</b> At the run club, the court, the meetup — talk to whoever runs it. One person who knows fifty people is worth fifty people.', 'Exchange Instagram, not numbers.', '<b>The camera trick.</b> Take good photos of people on your phone at anything social. Show them the shot. They will want it — "give me your Instagram, I will send it." You get the handle, they get something they actually wanted, and you get reps at photography for your own photos later. Free, and it works every single time.', 'Follow up inside 48 hours with something in it: the photo, a link, the city guide, a booking.', 'Third time you see someone, make it a group of 3–4 and bring someone from a different context.', 'Start the WhatsApp group yourself. Name it for the activity — "Tuesday Badminton" — not the people. You post the booking link each week. That is the whole job, and it makes you the hub.', 'After any activity with new people, bundle them into a chat the same night. Activity chat becomes a friend chat within a month.'],
    quota: ['5 new conversations', '2 Instagram exchanges', '1 invite sent', '1 follow-up message'],
    milestones: [[6, '12 acquaintances, 4 people you text, in 1 group chat'], [12, '2 groups, 1 you run, 8 you text'], [18, 'First party at your flat'], [24, '25–35 acquaintances, 10–12 you text, 3–4 close']] },

  { id: 'approach', name: 'Cold approach', aim: '80–100 approaches by March. The number you control is approaches made, not outcomes.',
    when: ['Every day — Level 0: 3 conversations with anyone', 'Mon 18:30–20:30 café — 1', 'Sun 08:45 post-run coffee — 1', 'Sat afternoon — Zone B — 1–2', 'Fri night — free-form'],
    where: ['Cafés with shared seating in Marathahalli and Brookefield', 'Post-run coffee on Sunday — best context you have', 'Bookshops, Whitefield Reads gathering at the end, meetups, house parties', 'Metro to Indiranagar on a Saturday — Church Street, cafés, bookshops'],
    how: ['<b>Level 0, from today.</b> 3 unnecessary conversations a day with anyone. Zero stakes, builds the muscle.', '<b>Level 1, week 3.</b> 2 a week. No intent signal. Leave inside a minute.', '<b>Level 2, week 6.</b> 3–5 a week. Three or four minutes. One real point of interest. Leave before it dies.', '<b>Level 3, week 10.</b> Ask for Instagram when there is signal — she asks things back, the conversation restarts itself, her body is turned toward you.', '<b>Level 4, week 14.</b> Convert to a first meet. Short, cheap, daytime.', '<b>Reframe the nerves.</b> Same physical feeling as excitement. You are offering someone two minutes of conversation, not demanding anything. Assume every stranger is a friend you have not met yet — until they show you otherwise.', 'Open on the situation, not on her. "Is that book any good?"', 'Say why you came over inside 20 seconds. Ambiguity is what makes it uncomfortable, not directness.', 'Plan to leave in three minutes.', 'Three seconds. Move before the debate starts — the debate never says go.', 'First one in the first 20 minutes of being out. The first one is a tax.', 'The camera trick works here too, but only where photos are normal — a party, an event, a group thing. Not at a café with a stranger.', 'Log it the same day. One line on what to change.'],
    good: 'Take the first no, warmly, straight away. Short answers, body turned away, phone picked up, headphones back in, nothing asked in return. Two of those, say nice to meet you, and go. The man who leaves cleanly never becomes a story.',
    bad: 'Never at your office or the office gym. Never with staff who cannot walk away, like baristas and servers. Never someone head-down with headphones in a focused setting. Never alone at night in an empty place. Never drunk.',
    milestones: [[5, 'Level 1 running'], [10, 'Level 2, 30 logged'], [14, 'First Instagram from a cold approach'], [24, '80–100 logged, 8–10 handles, 3–4 dates']] },

  { id: 'places', name: 'Third spaces and connectors', aim: 'Three places in Bangalore where they know your name.',
    when: ['Mon 18:30 — your café', 'Tue 18:30 — your court', 'Sun 07:30 — your run club', 'Thu — trying new places on quiet nights'],
    where: ['One café in Marathahalli or Brookefield. Pick it in week 1 and commit.', 'One badminton venue. Same one.', 'One run club.'],
    how: ['<b>Pick one café and go every Monday.</b> Same table, same time. By week four the staff know your order. By week eight they know your name. That is a third space — somewhere away from home that feels like home, and somewhere you can bring people.', "<b>Learn the staff's names.</b> The barista, the court manager, the juice stall guy, the guy at the gym desk. Costs nothing, changes how it feels to walk in.", '<b>Befriend the manager.</b> Of your café, your court, wherever you end up regularly. It gets you slots when they are full, and it looks good when you bring people.', '<b>Go to new places on quiet nights.</b> Thursday, not Saturday. On a dead night you can actually talk to the staff and the owner. On a busy night you are one of two hundred.', '<b>Connectors are worth fifty people.</b> Run club organisers, whoever runs the badminton group, the person who hosts things. Make a point of talking to them. Offer to help. Raise your hand.', "<b>Build a Bangalore guide.</b> A Google Maps list of your actual favourite spots — cafés, food, courts, weekend trips. Two reasons it is worth it: anyone new in the city wants it, and it gives you something to give away, which is the easiest reason in the world to ask for someone's Instagram and the easiest 48-hour follow-up you will ever send."],
    milestones: [[4, 'Café picked, staff recognise you'], [8, 'Guide has 25 places on it'], [16, 'You are on first-name terms at three places']] },

  { id: 'dating', name: 'Dating and photos', aim: 'Real photos by late January, dating live for the last six weeks.',
    when: ['Photo drill: 10 min, twice a week, Mon and Thu before bed', 'Self-timer set: once a month — prop the phone on a timer, 30 solo shots practicing the five positions, keep your best 3', 'Real shoot: week 19, a Saturday'],
    where: ['Mirror in your room for the drill', 'Shoot: three spots on a Saturday evening, golden hour, a friend with a phone'],
    how: ['Five positions to learn cold: weight on back foot with hands doing something · three-quarter turn · walking shot · leaning with one limb bent · candid laugh.', 'Never square-on with arms hanging. Always bend something. Chin forward and down. Look away in one shot of three.', 'Shoot from chest height. Low angles make tall people loom.', 'Once a month: 30 self-timer shots, pick 3, write down what was different.', 'Week 2: baseline set. It will be bad. It is your before, and it gets you on the apps now.', 'Week 19: the real set. 200 shots, keep six — clear face · full body · doing something · with 1–2 friends · a place with character · something with personality.', 'Your camera habit is quietly solving this. By January you will have months of real photos of yourself doing interesting things, which beats any posed shoot.'],
    milestones: [[2, 'Baseline photos, apps live'], [19, 'Real set shot, profiles rebuilt'], [24, 'Dating on good photos']] },

  { id: 'gym', name: 'Gym', aim: '80 kg to about 86 kg, roughly 4–6 kg of it muscle.',
    when: ['Mon, Thu, Fri — 15:30–17:00 at the office, last thing before the bus', 'Tue, Wed — 15:15–16:45, off-peak trip to the office'],
    where: ['Office gym only. City bus both ways, individual tickets, about ₹15–25 a trip.', 'Tue and Wed: leave the PG at 13:00. Off-peak the run is 20–25 minutes instead of 45. Job work at the office 13:45–15:15, lift, leave 16:50 before the crush.'],
    how: ['Five days, Monday to Friday. Weekend off. The Sunday run is the only extra.', '<b>The split:</b> Mon chest + biceps · Tue back + triceps · Wed shoulders + legs · Thu chest + biceps · Fri back + triceps + shoulders. Full exercise list is in the Body tab.', 'Every session, every day, on top of the split: shrugs and face pulls.', '<b>Right-shoulder rehab.</b> You have a cyst/tendonitis there. Before the lift, as a warm-up: 5–8 minutes of band external rotations and light scaption raises, low load. Doing it before rather than after primes the joint before it takes the day\'s pressing and pulling load, rather than adding more work to an already-fatigued shoulder. If it ever aggravates the shoulder, move it to after the session instead — this is a reasoned default, not a fixed rule.', 'One rule: top of the rep range on every set, add 2.5 kg next time.', 'Log every set. Untracked training is why people lift for six months and look the same.', 'Spare t-shirt and wipes in the bag. Change after, shower at home.'],
    warn: 'Five days from tomorrow with no ramp. The first ten days will be rough. Start at the bottom of every rep range and let the weight climb — do not add extra volume in week one. Keep the shoulder rehab light — it is maintenance, not a second workout.',
    milestones: [[4, 'Every session logged, shoulder rehab a habit'], [12, '82–83 kg, lifts up'], [24, '~86 kg, visibly different']] },

  { id: 'food', name: 'Food', aim: '150–170 g protein a day. Maintenance or slightly above. Not a deficit.',
    when: ['6 eggs at breakfast', 'Shake after the gym', 'Curd or paneer with PG dinner', 'Sunday 10:00 grocery run'],
    where: ['PG food stays. You bolt protein onto it.', 'Local shops in Marathahalli for eggs (₹6–8), curd, bananas. Whey online, 2 kg at a time.', 'Kit: egg boiler, shaker, steel bowl. About ₹1,500 once.'],
    how: ['6 eggs 36g · 2 scoops whey 48g · 400g curd 20g · paneer or chicken 18–40g · PG meals 30–40g. That is 155–180 g for ₹280–400 a day.', 'About ₹9,000 a month, which is what you already spend on Swiggy. Moving the money, not adding it.', 'When PG dinner is bad, do not order. 4 eggs, curd, banana, shake. ₹120 and six minutes.', 'Ordering: twice a week, decided in advance, never at 9pm off a craving. Delete the food apps from your home screen.', 'Creatine 5 g a day.'],
    milestones: [[4, 'Protein hit 6 days a week'], [24, 'Runs without thinking']] },

  { id: 'startup', name: 'Startup', aim: 'MVP live by 15 December. Real users by March.',
    when: ['Mon, Thu, Fri 08:45–10:15', 'Tue, Wed 08:30–11:30', 'Sun 17:00–20:00', '13.5 hours a week'],
    where: ['Your PG room, at the monitor. Not cafés.'],
    how: ['Nothing gets scheduled before 11am. That is the wall.', 'Every block starts with one written sentence: what is done by the end of it.', 'Phone in a drawer. Not face down.', 'Ship dates, not effort targets. MVP by 15 December.', 'Saturday startup meetups in Koramangala twice a month are distribution, not networking. Go with a 10-second description and watch faces.', 'Treat the founders you meet as equals. The second you fanboy, you start performing, and that is what ruins the connection.', 'First Sunday monthly: what shipped, what is blocked, is the date still real. Slipped twice means cut scope.'],
    warn: 'Leaving the job by March does not work on the money. Five months of saving is about ₹2.35 lakh — under five months of runway. Make the trigger a condition, not a date: 9 months of runway plus real user signal. March should be MVP live, first users, decision made.',
    milestones: [[12, 'MVP shipped'], [18, 'First users who are not friends'], [24, 'Quit analysis done']] },

  { id: 'skin', name: 'Skin and hair', aim: 'Acne controlled by December. Hair assessable in March.',
    when: ['Dermatologist: this week.', 'Morning 3 min, night 3 min, shower 60 seconds.'],
    where: ['Any dermatology clinic in Marathahalli or Whitefield. ₹700–1,500.'],
    how: ['<b>Why now:</b> acne takes 8–12 weeks to show change. Hair treatments take 6 months before you can judge them. Start this week and you have an answer in March.', '<b>Morning:</b> gentle cleanser, moisturiser, sunscreen — reapplied at midday. One morning application does nothing by 4pm. This is also your whole anti-tanning plan.', '<b>Night:</b> cleanser, adapalene (pea-sized, 3 nights a week building to nightly), moisturiser.', '<b>Shower:</b> benzoyl peroxide wash on chest, shoulders, back. 60 seconds before rinsing. Bleaches fabric — white towels.', 'Drop salicylic acid from your face while adapting to the retinoid.', 'Wipe down before the bus after the gym. Sweat under a shirt for 45 minutes is a real cause of your chest and shoulder acne.'],
    warn: 'You will get worse around weeks 2–4 on the retinoid. That is the purge. Almost everyone quits there. Do not.',
    ask: ['Raise with the doctor: current first-line for male pattern hair loss is topical minoxidil plus oral finasteride, and low-dose oral minoxidil is now accepted for the right people. Finasteride has real side effects worth discussing. Ask for bloods — thyroid, ferritin, vitamin D — because hair loss at 22 is not automatically pattern loss.'],
    milestones: [[1, 'Seen the dermatologist'], [12, 'Face visibly clearer'], [24, 'Six-month review']] },

  /**
   * Solo-practice only — no partner assumed anywhere below. Sensate focus is
   * normally a couples exercise; the self/solo variant linked here needs
   * neither a partner nor any equipment. Sourced from: Cleveland Clinic and
   * Physiopedia (kegel technique) · Doctronic and PrimeFlow (reverse kegels)
   * · scisexualhealth.ca's self sensate focus guide (linked in `how`, and the
   * one confirmed solo-focused among three the user supplied, alongside
   * Cornell Health's and lh.ca's sensate-focus PDFs as background reading) ·
   * Wikipedia "Sensate focus" and Ubie Doctor's Note (performance anxiety and
   * mindfulness) · Your Brain On Porn, Ro, and Ubie (porn-induced ED recovery
   * timelines) · Hims, Healthline, and NCBI Bookshelf (stop-start/squeeze
   * method) · Hims, MedicalNewsToday, and SingleCare (exercise and erectile
   * function).
   */
  { id: 'sexual-health', name: 'Sexual health', aim: 'Better erection quality and sexual stamina, less performance anxiety — solo practice only, tracked the same low-key way as everything else.',
    when: ['Kegels — 3 sets of 10–15, daily, stacked onto something you already do (the bus, brushing teeth)', 'Reverse kegel / relaxation — nightly, part of the wind-down block', 'Self sensate focus — once a week, no fixed length', 'Stop-start practice — worked into solo sessions as they happen, not a separate slot'],
    where: ['Anywhere private. No equipment.'],
    how: ['<b>Kegels.</b> Find the muscle once by stopping your urine stream mid-flow — that is identification only, do not make that your regular practice spot. 3 sets of 10–15 contractions a day, hold 3–5 seconds, release. These are the muscles that compress the base of the penis and help sustain rigidity. 8–12 weeks of consistent practice before you can honestly judge a change.', '<b>Reverse kegels.</b> The opposite move — consciously lengthen and release the same muscles instead of squeezing. Useful against a chronically tight pelvic floor and performance-related tension. Do this one at night, as part of winding down, since it pairs naturally with relaxing rather than exerting.', '<b>Performance anxiety is physiological, not just "in your head."</b> Stress narrows blood flow — that is the actual mechanism, and it is why anxiety alone can prevent an erection independent of anything else going on. Mindfulness and self sensate focus are the two evidence-backed levers for breaking that anticipation-anxiety loop.', '<b>Self sensate focus.</b> A solo, non-goal-oriented body-awareness practice — no partner, no performance, no aiming for arousal. Roughly: settle and notice general body sensation with your eyes closed, extend that same unhurried attention to parts of the body you do not normally focus on, then to the genitals — noticing sensation for its own sake, not chasing an outcome. If an anxious or distracting thought shows up, just notice it without judgment and bring attention back to physical sensation. Full step-by-step guide, confirmed solo and no partner required: <a href="https://scisexualhealth.ca/sensation-and-touch-sci/self-sensate-focus/">scisexualhealth.ca — self sensate focus</a>.', '<b>If porn is part of the picture.</b> Porn-induced ED is a real, described pattern — desensitization from frequent use — though the evidence that porn alone reliably causes ED is thin, and where it does apply it is usually psychological rather than physical damage, which is the good news. Recovery reports commonly cluster around 60–120 days of reduced or no porn use for the brain\'s reward response to recalibrate, sometimes longer. Treat that as a range, not a promise.', '<b>Stamina — the stop-start method.</b> Bring yourself close to the edge during a solo session, pause or back off until the urge passes, then resume. Repeat a few times per session. The evidence is real but modest — small trials show a few extra minutes after around 12 weeks of consistent practice — so treat it as practicing a skill, not a guaranteed fix. It doubles as a way to get comfortable with arousal without anxiety riding along.', '<b>General stamina and circulation.</b> Already covered — the gym plan\'s cardio and strength work is directly linked to erectile function in the research (≥150 minutes a week of moderate cardio plus regular strength training measurably improves scores in studies). No separate cardio prescription needed here.'],
    warn: 'None of this replaces a doctor if something feels physically wrong, not just anxious or slow to improve. This plan is conservative, evidence-based self-practice — not a diagnosis.',
    milestones: [[4, 'Kegels are a stacked daily habit, no reminder needed'], [12, 'Stop-start does not feel clinical; sensate focus sessions feel calm, not like a task'], [24, 'Full, honest review — erection quality, stamina, and anxiety, compared to week 1']] },

  { id: 'speak', name: 'Talking and stories', aim: 'Never run out of things to say. Ten stories you can tell well.',
    when: ['3 conversations a day, built into the walk, the bus, the gym, the café', '5-minute voice note every night', 'Impromptu / Dictio — 10 min, every night', 'Wed 19:00 — write one story'],
    where: ['Everywhere. Needs no venue, which is why it is the cheapest win on the list.'],
    how: ['<b>Running out of things to say</b> is a hook problem. Every answer has 2–3 hooks. "Moved from Pune last year for work" gives you Pune, moving, work, timing. Pick one and go deeper, or match it with something of your own. Name the hook in your head for two weeks and it goes automatic.', '<b>Awkward pauses</b> are a volume problem. Three conversations a day. After about 300 the first twenty seconds stops feeling like a cliff.', '<b>Boring stories</b> are structure, not material. Write ten things that happened to you. Rework each into 90 seconds: setup, tension, turn, and a line to finish on. Decide the last line before you open your mouth.', '<b>Not articulate</b> — record yourself. One voice note a night, listen back once, note one thing. You cannot fix what you have never heard. Use <b>Impromptu</b> for cold impromptu-speaking prompts and <b>Dictio</b> for dictation and articulation drills — both feed the same record-and-listen-back loop this plan already runs on.', '<b>Not witty</b> — notice how often you have the funny thought and swallow it. That gap is your wit being filtered. Say more of them.', '<b>Go deep early.</b> Share something real in the first hour and the other person will match you. It is the fastest route from stranger to friend, and it is why some people make close friends in weeks.', '<b>For the startup:</b> the 10-second, 30-second and 2-minute version. Test all three at Saturday meetups. If eyes move, it is too long.'],
    milestones: [[6, 'Story bank at 5'], [12, 'Ten stories, rehearsed out loud'], [24, 'You can hold a room']] },

  { id: 'dj', name: 'DJing', aim: "Play at a friend's party by late December.",
    when: ['Tue 21:30 — 45 min', 'Wed 18:00 — 1 hour', '3–4 hours a week'],
    where: ['Your room, headphones on.'],
    how: ['Use <b>Serato DJ Lite</b> — came with the controller, closer to industry standard, transfers to real gear.', 'Turn on the Beatmatch Guide lights. Switch them off once you can hear it.', 'Hercules DJ Academy on YouTube is free and made for your controller.', '<b>Weeks 1–2:</b> loading, gain, 3-band EQ, cue points, headphone cue.', '<b>Weeks 3–6:</b> manual beatmatching, then phrasing — counting 8s, spotting 32-beat phrases. Beginners skip phrasing. It is what makes a mix sound deliberate.', '<b>Weeks 7–14:</b> 15 tracks you know cold, same transitions over and over. Record 30 minutes and listen back.', 'Short sessions beat long ones. It is a motor skill.', 'This is a social asset, not a hobby. Once you have decks and a flat, you are the one who can throw a night.'],
    milestones: [[6, 'Beatmatching by ear'], [14, '30-minute set recorded'], [16, 'Played at a gathering']] },

  { id: 'russian', name: 'Russian', aim: 'Solid A1 by March.',
    when: ['20–25 min a day, 5 days a week', 'One tutor call a week from week 6'],
    where: ['Your room. Anki on the bus.'],
    how: ['<b>Weeks 1–2:</b> Cyrillic, handwritten. You forgot it last time because you learned it by looking.', '<b>From week 3:</b> 10 min Anki top-1000 deck plus 10–15 min of one structured course. Finish one course, do not sample five apps.', '<b>From week 6:</b> one italki session a week, roughly ₹500–900 an hour. Online, so no in-person class. This is what turns study into speech.', '<b>From week 12:</b> slow-Russian podcasts on the bus.', 'You learn a language by using it, not by studying it. Speak from week 6 even though you will be bad.'],
    warn: 'This is the goal to downgrade if something has to give. Longest payoff, least connected to everything else.',
    milestones: [[2, 'Cyrillic back'], [12, '300 words, tutor calls running'], [24, 'A1 — you can handle a café in Russian']] },

  { id: 'read', name: 'Reading', aim: '10 books by March.',
    when: ['Bus, Mon/Thu/Fri, 25 min each way', '22:30–23:00 nightly', 'Sat morning when it allows'],
    where: ['The bus. Your bed — book only, phone across the room. Your Monday café. Whitefield Reads.'],
    how: ['45 min a day is 30 pages is 2 books a month.', 'One book at a time.', 'Quit at page 50 if it is not working.', 'Audiobook counts if the bus is too rough.'],
    milestones: [[12, '5 books'], [24, '10 books']] },

  { id: 'swim', name: 'Swimming', aim: 'Comfortable freestyle, 50 m, by week 17.',
    when: ['Sat 16:00 and Sun afternoon', 'Twice a week, weeks 5 to 17'],
    where: ['Machaxi Nadando Swimming Centre, Varthur — temperature controlled, on Playo, ~1 km from Kundalahalli Gate.', 'Backups: Sporthood, Cult.fit. Roughly ₹3,000–6,000 a month for coached adult batches.'],
    how: ['Book a coached adult beginner batch, not open swim.', '12 weeks at twice a week is enough from zero.', 'Start by week 5 or it will not fit before March.'],
    milestones: [[5, 'Batch started'], [17, '50 m freestyle']] },

  { id: 'style', name: 'Clothes and grooming', aim: 'Three outfits that always work. Not a new wardrobe.',
    when: ['Weeks 5–6: reference board', 'Week 7: tailor', 'Weeks 8–20: one or two items a month'],
    where: ['Marathahalli factory outlets. A local tailor, ₹150–400 an alteration. Online: Snitch, Bonkers Corner, H&M, Uniqlo.'],
    how: ["<b>Step 1.</b> Save 50 outfits you like, on tall lean men. Look for what repeats — that is your taste.", '<b>Step 2.</b> Fit before buying. At 6\'3" your problem is length. Take five things you own to a tailor. Five tailored items beat ten new ones, for ₹1,500.', '<b>Step 3.</b> Three uniforms. Plain heavy tee + straight trousers + clean sneakers · overshirt over a tee + trousers · polo + chinos.', '<b>Step 4.</b> Replace in order: shoes, trousers, good plain tees, one overshirt.', 'Skip oversized. On 6\'3" and 80 kg it reads as a tent.', 'Retire cargos from anything social.', 'One barber, every three weeks. Beard shaped professionally once. One fragrance.'],
    milestones: [[7, 'Board done, five items tailored'], [14, 'Three uniforms working'], [24, 'You get told you dress well']] },

  { id: 'money', name: 'Money and the flat', aim: 'Save about ₹47k a month. Move by 1 December.',
    when: ['Flat search starts week 5', 'Move by 1 December'],
    where: ['Zone A and slightly toward Kadubeesanahalli — Marathahalli, AECS Layout, Munnekolala, Doddanekkundi, Kundalahalli. Do not move further from the office; ORR roadworks run October to January.'],
    how: ['Rough month: PG or flat 20–25k · food outside PG 9k · bus tickets and autos 2.5k · social 8k · skin and grooming 2.5k · clothes 3k · swimming and italki 3.5k · buffer 3k.', 'Bus: individual tickets, ₹15–25 a trip, roughly ₹1,200–1,500 a month.', '2BHK in that belt is roughly ₹30–45k, so ₹15–23k each. Add ₹4–6k for food once PG meals go.', 'Keep ₹1.5–2.5 lakh liquid for the deposit.'],
    milestones: [[5, 'Search started'], [11, 'Moved in'], [24, '~₹2.35 lakh saved']] },
];

export const SEED_CHECKS: [string, string, string][] = [
  ['gym', 'Gym done', 'Mon–Fri'],
  ['startup', 'Startup block done', 'Before 11am'],
  ['protein', '100g+ protein', ''],
  ['out', 'Got out of the room', 'Mon, Tue, Thu, Fri, Sat'],
  ['record', 'Voice note recorded', '5 min, listen back once'],
  ['russian', 'Russian, 20 min', ''],
  ['read', 'Read', ''],
  ['skin', 'Skin routine, AM + PM', ''],
];

export const SEED_COUNTS: [string, string][] = [
  ['convos', 'Conversations'], ['approaches', 'Approaches'], ['ig', 'Instagram exchanges'],
  ['invites', 'Invites sent'], ['followups', 'Follow-ups'], ['pages', 'Pages read'], ['hours', 'Startup hours'],
];

export const SEED_WEEK_GOALS: Record<string, number> = {
  convos: 5, approaches: 3, ig: 2, invites: 1, followups: 1, pages: 200, hours: 13,
  gym: 5, out: 5, protein: 6,
};

/** Materialized into AppState.tasks by migrateState() on first load. */
export const SEED_TASKS: Omit<Task, 'id' | 'createdAt' | 'status'>[] = [
  { title: 'Book the dermatologist', detail: 'Any dermatology clinic in Marathahalli or Whitefield. ₹700–1,500.', planId: 'skin', triggerWeek: 0 },
  { title: 'Baseline photos and weight', detail: 'Your before. It will be bad — that is the point. Gets you on the apps now.', planId: 'dating', triggerWeek: 1 },
  { title: 'Start the flat search', detail: 'Zone A and toward Kadubeesanahalli — Marathahalli, AECS Layout, Munnekolala, Doddanekkundi, Kundalahalli.', planId: 'money', triggerWeek: 4 },
  { title: 'Book a swimming batch', detail: 'Coached adult beginner batch, not open swim. Machaxi Nadando, Varthur or a backup.', planId: 'swim', triggerWeek: 4 },
  { title: 'Build the style reference board', detail: 'Save 50 outfits you like, on tall lean men. Look for what repeats.', planId: 'style', triggerWeek: 4 },
  { title: 'Take five items to a tailor', detail: 'Five tailored items beat ten new ones, for about ₹1,500.', planId: 'style', triggerWeek: 6 },
  { title: 'Shoot the real photo set', detail: '200 shots, keep six — clear face, full body, doing something, with friends, a place with character, personality.', planId: 'dating', triggerWeek: 18 },
];

/**
 * Materialized into AppState.habits by migrateState() on first load.
 * Photo drill lives in SEED_SCHEDULE instead (Mon/Thu, PHOTO_DRILL_ROW) since
 * it has a fixed weekly slot — putting it here too would show it twice on
 * Today, once as a "Due" prompt and once as a schedule row.
 */
export const SEED_HABITS: Omit<Habit, 'id' | 'createdAt'>[] = [
  { title: 'Self-timer photos — 30 solo shots on a timer, practicing poses', planId: 'dating', cadence: { kind: 'everyNWeeks', n: 4 } },
  { title: 'Monthly startup review', planId: 'startup', cadence: { kind: 'everyNWeeks', n: 4 } },
];

export const PHASES: [number, number, string, string[]][] = [
  [0, 1, "Weeks 1–2 · Get the frame up", [
    'Gym 5 days from tomorrow', 'All five startup blocks', 'Book the dermatologist this week',
    'Protein kit, chair, alarm clock',
    'Baseline photos and weight', 'Level 0 approaches — 3 conversations a day']],
  [2, 5, "Weeks 3–6 · Social engine on", [
    'Tuesday badminton and Sunday run club live', 'Weekly quota starts', 'Level 1 approaches — 2 a week',
    'Camera habit — photos at everything social', 'Protein system running',
    'DJ and Russian start (week 3)', 'Swimming starts (week 5)', 'Flat search starts (week 5)']],
  [6, 11, "Weeks 7–12 · Depth", [
    'Level 2 approaches — 3–5 a week',
    'Style: reference board, tailor, three uniforms', 'Story bank at 10',
    'MVP ships by 15 December', 'Move into the flat by 1 December', 'Start your own group chat']],
  [12, 17, "Weeks 13–18 · Depth continues", [
    'First DJ set at a gathering',
    'Level 3 — asking for Instagram',
    'First users on the MVP', 'Swimming done by week 17']],
  [18, 23, "Weeks 19–24 · Compound and decide", [
    'Real photo set, profiles rebuilt', 'Dating live',
    'Dermatologist six-month review', 'Quit analysis — runway, traction, date']],
];

export const STAGES: Record<number, [string, string]> = {
  1: ['Acquaintance', 's1'], 2: ['Textable', 's2'], 3: ['Met 1:1', 's3'], 4: ['In my group', 's4'],
};

export const OUTCOMES: Record<string, [string, string]> = {
  bailed: ['Chickened out', 's1'], short: ['Short', 's1'], good: ['Real conversation', 's3'],
  ig: ['Got Instagram', 's4'], closed: ['Left cleanly', 's2'],
};

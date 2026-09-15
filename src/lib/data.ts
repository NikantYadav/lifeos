export const START = new Date(2026, 8, 15);
export const END = new Date(2027, 2, 1);
export const DAYNAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type SchedRow = [string, string, string, number?];

export const WEEK: Record<number, [string, SchedRow[]]> = {
  1: ['Monday — office. Chest, shoulders, triceps.', [
    ['07:30', 'Wake', 'Phone stays across the room'],
    ['07:45', 'Walk', 'Same route, same juice stall, same time. Use one Kannada line on the stall guy.'],
    ['08:15', 'Breakfast, 6 eggs, shower', ''],
    ['08:45', 'Startup — 1.5h', 'Your room, your monitor, phone in a drawer', 1],
    ['10:15', 'Bus to Kadubeesanahalli', 'Read on the bus'],
    ['11:00', 'Job work + lunch', ''],
    ['15:30', 'Gym — 90 min', 'Fresh t-shirt after. Shower at home.', 1],
    ['17:00', 'Bus home', ''],
    ['17:50', 'Shower, protein', ''],
    ['18:30', 'Your café — 2h', "Same table, same time. Read + 2 conversations + 1 approach. Learn the staff's names.", 1],
    ['20:30', 'Dinner', ''],
    ['21:30', 'Russian — 20 min', ''],
    ['22:30', 'Read', ''],
    ['23:00', 'Sleep', ''],
  ]],
  2: ['Tuesday — WFH + gym trip. Legs, quads.', [
    ['07:45', 'Wake', ''],
    ['08:00', 'Walk', ''],
    ['08:30', 'Startup — 3h', 'Best block of your week', 1],
    ['11:30', 'Food, job work at PG', ''],
    ['13:00', 'Bus to office', 'Off-peak. 20–25 min instead of 45.'],
    ['13:45', 'Job work at office', ''],
    ['15:15', 'Gym — 90 min', '', 1],
    ['16:50', 'Bus home', ''],
    ['17:20', 'Shower, protein', ''],
    ['18:30', 'Badminton — 90 min', 'Machaxi Scooled, AECS Layout. Solo slot on Playo. Same slot every week.', 1],
    ['20:00', 'Stay back 20 min', 'Never leave straight after. This is where the group chat comes from.', 1],
    ['20:30', 'Dinner', ''],
    ['21:30', 'DJ — 45 min', ''],
    ['23:00', 'Sleep', ''],
  ]],
  3: ['Wednesday — WFH + gym trip. Back and biceps.', [
    ['07:45', 'Wake', ''],
    ['08:00', 'Walk', ''],
    ['08:30', 'Startup — 3h', '', 1],
    ['11:30', 'Food, job work at PG', ''],
    ['13:00', 'Bus to office', ''],
    ['13:45', 'Job work at office', ''],
    ['15:15', 'Gym — 90 min', '', 1],
    ['16:50', 'Bus home', ''],
    ['17:20', 'Shower', ''],
    ['18:00', 'DJ — 1h', ''],
    ['19:00', 'Write one story', 'Rework one thing that happened to you into 90 seconds', 1],
    ['19:30', 'Dinner', ''],
    ['20:30', 'Russian, reading, plan the side quest', 'Your one full rest evening. Stay in.', 1],
    ['23:00', 'Sleep', ''],
  ]],
  4: ['Thursday — office. Hamstrings, glutes, core.', [
    ['07:30', 'Wake', ''],
    ['07:45', 'Walk', ''],
    ['08:45', 'Startup — 1.5h', '', 1],
    ['10:15', 'Bus to office', ''],
    ['11:00', 'Job work + lunch', ''],
    ['15:30', 'Gym — 90 min', '', 1],
    ['17:00', 'Bus home', ''],
    ['17:50', 'Shower, protein', ''],
    ['18:30', 'New room — 2h', 'Second Playo slot, a Zone A meetup, or a new café on a quiet night so you can talk to the staff.', 1],
    ['20:30', 'Dinner', ''],
    ['21:30', 'Russian', ''],
    ['23:00', 'Sleep', ''],
  ]],
  5: ['Friday — office. Shoulders, arms, posture.', [
    ['07:30', 'Wake', ''],
    ['07:45', 'Walk', ''],
    ['08:45', 'Startup — 1.5h', '', 1],
    ['10:15', 'Bus to office', ''],
    ['11:00', 'Job work + lunch', ''],
    ['15:30', 'Gym — 90 min', '', 1],
    ['17:00', 'Bus home', ''],
    ['17:50', 'Shower, best outfit of the week', ''],
    ['20:00', 'Out', 'You make the plan and you make the group chat, even if it is four people. Take photos of everyone.', 1],
    ['02:00', 'Home', ''],
  ]],
  6: ['Saturday — side quest day.', [
    ['09:30', 'Wake', 'You were out. No early run.'],
    ['11:00', 'Side quest — 4h', 'The out-of-the-ordinary thing. See the Side quests tab. Take the phone camera.', 1],
    ['15:00', 'Lunch somewhere new', 'Bring the book if you are solo'],
    ['16:00', 'Swimming — 90 min', 'Machaxi Nadando, Varthur. From week 5.', 1],
    ['19:00', 'Social', "Your group, someone's place, a Koramangala startup thing twice a month", 1],
    ['23:30', 'Home', ''],
  ]],
  0: ['Sunday — run, rest, plan.', [
    ['07:00', 'Wake', ''],
    ['07:30', 'Run club — 5K', 'Whitefield Run Club. RSVP the night before.', 1],
    ['08:45', 'Coffee after the run', 'Never run and leave. 2 conversations + 1 approach. Find the organiser and talk to them.', 1],
    ['10:00', 'Groceries', '2 trays eggs, whey, curd, peanut butter, oats, bananas'],
    ['11:00', 'Laundry, admin', ''],
    ['12:00', 'Nothing', 'Prescribed. Movie, nap, scroll if you want.', 1],
    ['17:00', 'Startup — 3h', '', 1],
    ['20:00', 'Book next week', 'Playo slots, run club RSVP, next side quest, one invite sent', 1],
    ['21:00', 'Dinner, read', ''],
  ]],
};

export const SPLIT: [string, string, string][] = [
  ['Mon', 'Chest, shoulders, triceps', 'Bench 4×5–8 · Overhead press 3×6–10 · Incline DB press 3×8–12 · Lateral raise 3×12–20 · Triceps 3×10–15'],
  ['Tue', 'Legs, quad focus', 'Squat 4×5–8 · Leg press 3×10–12 · Split squat 3×10 · Leg extension 3×12–15 · Calf raise 3×15'],
  ['Wed', 'Back, rear delts, biceps', 'Pull-ups/pulldown 4×6–10 · Barbell row 4×8–12 · Chest-supported row 3×10 · Face pulls 3×15–20 · Curls 3×8–12'],
  ['Thu', 'Hamstrings, glutes, core', 'Romanian deadlift 4×8–10 · Hip thrust 3×8–12 · Leg curl 3×10–15 · Hanging leg raise 3×max · Plank'],
  ['Fri', 'Shoulders, arms, posture', 'Overhead press 4×6–10 · Lateral raise 4×12–20 · Rear delt fly 3×15–20 · Curls + triceps 3 each · Band pull-aparts 3×20'],
];

export interface Plan {
  id: string;
  name: string;
  aim: string;
  when?: string[];
  where?: string[];
  how?: string[];
  quota?: string[];
  good?: string;
  bad?: string;
  warn?: string;
  ask?: string[];
  milestones?: [number, string][];
}

export const PLANS: Plan[] = [
  { id: 'principles', name: 'Principles', aim: 'The handful of ideas everything else runs on. Read this one first.',
    how: ['<b>Proximity plus repetition makes friends.</b> Not chemistry, not effort. It is why you had 10 friends in college and none here. So the whole plan is built on seeing the same people at the same place at the same time every week — the gym, the juice stall, the Tuesday court, the Sunday run.',
      '<b>Leisure routine.</b> Do not schedule "friend time". Build your fun into your routine so you see people while doing things you wanted to do anyway. Every activity should do two jobs at once — badminton is exercise and friends, run club is cardio and friends, the café is reading and approaching.',
      '<b>Basics before events.</b> You cannot host a good party without a base of friends. Weeks 1–10 are the base. Hosting starts after.',
      '<b>Invite from abundance.</b> The easiest invite is "I am already going, come along." You never have to organise something from scratch — you attach people to things already happening.',
      '<b>Spread your shots.</b> At any event, do not lock onto the first two people and stay there. Talk to as many as you can, find who you actually click with. You will not click with most people, so take more shots.',
      '<b>Open up first.</b> People match your level of disclosure. Share something real in the first hour and they will too, and you skip three months of small talk. This is how you get close friends in six months instead of two years.',
      '<b>Raise your hand.</b> When someone asks for a volunteer, be the one. Nobody else will, and it puts you next to the organiser instantly.',
      '<b>Treat people as equals.</b> At startup meetups you will meet founders you look up to. The moment you look up, you start trying too hard, and that is what kills the connection. Admire the work, treat the person normally.',
      '<b>Do not lock in.</b> Staying in your room eats your appetite for life. Five evenings out is not about productivity, it is about not going flat.'],
    warn: 'Where the case study does not transfer: he was in an expat scene where everyone was new, alone and actively hunting for friends, and he had six years of practice plus an Instagram following. Bangalore is a settled city — most people already have their circle. Same tactics, slower results. His 60 days is your six months. Do not read his timeline as your benchmark.' },

  { id: 'social', name: 'Social circle', aim: 'From nobody to 3–4 close friends and 2–3 groups by March.',
    when: ['Tue 18:30 badminton — the main one', 'Thu 18:30 second room', 'Sun 08:45 coffee after the run', 'Sat 11:00 side quest and 19:00 social', 'Mon 18:30 café'],
    where: ['Machaxi Scooled Badminton, AECS Layout (0.2 km) — solo slots on Playo, ₹150–350', 'PlayTM Sports Arena Marathahalli · Sporthood Doddanekundi · Gamezy Shuttle Hub Munnekolala · iSports Arena Kundalahalli Gate', 'Whitefield Run Club — weekend mornings, 3K plus games', 'Whitefield Reads — Saturdays, free', 'One café in Marathahalli you go to every Monday'],
    how: ['Book the SAME Playo slot four weeks running. Same regulars come back. That is the trick.', 'Week 4, ask straight out: "Do you all have a group? Add me, I am here every Tuesday."', '<b>Find the organiser.</b> At the run club, the court, the meetup — talk to whoever runs it. One person who knows fifty people is worth fifty people.', 'Exchange Instagram, not numbers.', '<b>The camera trick.</b> Take good photos of people on your phone at anything social. Show them the shot. They will want it — "give me your Instagram, I will send it." You get the handle, they get something they actually wanted, and you get reps at photography for your own photos later. Free, and it works every single time.', 'Follow up inside 48 hours with something in it: the photo, a link, the city guide, a booking.', 'Third time you see someone, make it a group of 3–4 and bring someone from a different context.', 'Start the WhatsApp group yourself. Name it for the activity — "Tuesday Badminton" — not the people. You post the booking link each week. That is the whole job, and it makes you the hub.', 'After any activity with new people, bundle them into a chat the same night. Activity chat becomes a friend chat within a month.'],
    quota: ['5 new conversations', '2 Instagram exchanges', '1 invite sent', '1 follow-up message', '1 side quest'],
    milestones: [[6, '12 acquaintances, 4 people you text, in 1 group chat'], [12, '2 groups, 1 you run, 8 you text'], [18, 'First party at your flat'], [24, '25–35 acquaintances, 10–12 you text, 3–4 close']] },

  { id: 'approach', name: 'Cold approach', aim: '80–100 approaches by March. The number you control is approaches made, not outcomes.',
    when: ['Every day — Level 0: 3 conversations with anyone', 'Mon 18:30–20:30 café — 1', 'Sun 08:45 post-run coffee — 1', 'Sat 11:00–15:00 side quest / Zone B — 1–2', 'Fri night — free-form'],
    where: ['Cafés with shared seating in Marathahalli and Brookefield', 'Post-run coffee on Sunday — best context you have', 'Bookshops, Whitefield Reads gathering at the end, meetups, house parties', 'Metro to Indiranagar on a Saturday — Church Street, cafés, bookshops'],
    how: ['<b>Level 0, from today.</b> 3 unnecessary conversations a day with anyone. Zero stakes, builds the muscle.', '<b>Level 1, week 3.</b> 2 a week. No intent signal. Leave inside a minute.', '<b>Level 2, week 6.</b> 3–5 a week. Three or four minutes. One real point of interest. Leave before it dies.', '<b>Level 3, week 10.</b> Ask for Instagram when there is signal — she asks things back, the conversation restarts itself, her body is turned toward you.', '<b>Level 4, week 14.</b> Convert to a first meet. Short, cheap, daytime.', '<b>Reframe the nerves.</b> Same physical feeling as excitement. You are offering someone two minutes of conversation, not demanding anything. Assume every stranger is a friend you have not met yet — until they show you otherwise.', 'Open on the situation, not on her. "Is that book any good?"', 'Say why you came over inside 20 seconds. Ambiguity is what makes it uncomfortable, not directness.', 'Plan to leave in three minutes.', 'Three seconds. Move before the debate starts — the debate never says go.', 'First one in the first 20 minutes of being out. The first one is a tax.', 'The camera trick works here too, but only where photos are normal — a party, an event, a group thing. Not at a café with a stranger.', 'Log it the same day. One line on what to change.'],
    good: 'Take the first no, warmly, straight away. Short answers, body turned away, phone picked up, headphones back in, nothing asked in return. Two of those, say nice to meet you, and go. The man who leaves cleanly never becomes a story.',
    bad: 'Never at your office or the office gym. Never with staff who cannot walk away, like baristas and servers. Never someone head-down with headphones in a focused setting. Never alone at night in an empty place. Never drunk.',
    milestones: [[5, 'Level 1 running'], [10, 'Level 2, 30 logged'], [14, 'First Instagram from a cold approach'], [24, '80–100 logged, 8–10 handles, 3–4 dates']] },

  { id: 'quests', name: 'Side quests', aim: 'One a week. Plus one big one every two months.',
    when: ['Saturday 11:00–15:00', 'Plan it Wednesday evening, book it Sunday night'],
    where: ['See the Side quests tab for the Bangalore list'],
    how: ['A side quest is something out of the ordinary. Not the gym, not the café, not badminton. Those are your routine; this is the thing you remember.', 'Go alone the first few times. From week 6, bring one person from the badminton group or the run club. Shared novelty builds friendship faster than another dinner.', '<b>Take the camera.</b> A side quest with photos becomes a reason to message four people afterwards.', 'Plan it on Wednesday and book it Sunday, or it becomes another Saturday of scrolling.', '<b>Big quest every two months:</b> a weekend trip. Coorg, Gokarna, Hampi, Chikmagalur, Wayanad. Organise it yourself, invite eight, expect five.'],
    milestones: [[6, '4 side quests done, at least one with someone else'], [12, 'First weekend trip organised'], [24, '20+ logged']] },

  { id: 'places', name: 'Third spaces and connectors', aim: 'Three places in Bangalore where they know your name.',
    when: ['Mon 18:30 — your café', 'Tue 18:30 — your court', 'Sun 07:30 — your run club', 'Thu — trying new places on quiet nights'],
    where: ['One café in Marathahalli or Brookefield. Pick it in week 1 and commit.', 'One badminton venue. Same one.', 'One run club.'],
    how: ['<b>Pick one café and go every Monday.</b> Same table, same time. By week four the staff know your order. By week eight they know your name. That is a third space — somewhere away from home that feels like home, and somewhere you can bring people.', "<b>Learn the staff's names.</b> The barista, the court manager, the juice stall guy, the guy at the gym desk. Costs nothing, changes how it feels to walk in.", '<b>Befriend the manager.</b> Of your café, your court, wherever you end up regularly. It gets you slots when they are full, and it looks good when you bring people.', '<b>Go to new places on quiet nights.</b> Thursday, not Saturday. On a dead night you can actually talk to the staff and the owner. On a busy night you are one of two hundred.', '<b>Connectors are worth fifty people.</b> Run club organisers, whoever runs the badminton group, the person who hosts things. Make a point of talking to them. Offer to help. Raise your hand.', "<b>Build a Bangalore guide.</b> A Google Maps list of your actual favourite spots — cafés, food, courts, weekend trips. Two reasons it is worth it: anyone new in the city wants it, and it gives you something to give away, which is the easiest reason in the world to ask for someone's Instagram and the easiest 48-hour follow-up you will ever send."],
    milestones: [[4, 'Café picked, staff recognise you'], [8, 'Guide has 25 places on it'], [16, 'You are on first-name terms at three places']] },

  { id: 'host', name: 'Hosting', aim: 'From guest to host. First dinner within two weeks of moving in.',
    when: ['Starts week 13, after you have moved and have a base of friends', 'One bigger thing a month after that'],
    where: ['Your flat. This is the reason you are moving.'],
    how: ['<b>Potluck by home state.</b> Everyone brings a dish from where they are from. You supply the room, plates, music. ₹1,500 feeds 15. In a city where everyone is from somewhere else this works every time, and it costs less than one restaurant dinner.', '<b>Organise the thing you would want to be invited to.</b> Nobody organises dinners. Everybody wants to go to one. That gap is your opening, and even people who barely know you will come.', '<b>Invite 1.5× what you want.</b> People drop out. Want 15, invite 22.', '<b>Invite one unusual person.</b> Not just your close friends. The security guard, your barber, someone\'s visiting cousin, someone you met once. The mixed guest list is what makes it memorable instead of another tech gathering.', '<b>Prep two days early, not the day of.</b> Plates, chairs, ice, music. Assume anything you need on the day will not be available.', '<b>Share a public list of who is bringing what.</b> Otherwise you get six biryanis and no dessert.', '<b>Seat people deliberately.</b> Put people together who do not know each other but should. Name cards if it is big.', '<b>Have an "after".</b> A place to move half the group afterwards — a bar, a rooftop, a dessert place, or just the terrace. Keeps the night going and doubles the value.', '<b>Once you can DJ, use it.</b> Decks plus a room is something almost nobody else has.', '<b>Restaurant version, for 20+:</b> book a section, sort the payment rule before anyone arrives (set menu at a set price is the cleanest), and expect to eat the cost for two or three people who leave without paying.'],
    milestones: [[13, 'First potluck done'], [17, 'Second event, bigger'], [24, 'Monthly hosting is a habit']] },

  { id: 'kannada', name: 'Kannada', aim: '20 phrases. This is the highest-value language on your list for the next six months.',
    when: ['5 minutes a day on the morning walk. Use them, do not study them.'],
    where: ['Juice stall, auto drivers, bus conductor, gym desk, café staff, your PG cook.'],
    how: ['Russian is a six-month project with no daily use. Kannada is a two-week project you can use twenty times a day, and in Bangalore it changes how people treat you almost immediately. Do both — this one is nearly free.', 'Start with ten: <b>Namaskara</b> (hello) · <b>Hegiddira?</b> (how are you) · <b>Chennagideeni</b> (I am fine) · <b>Estu?</b> (how much) · <b>Swalpa</b> (a little) · <b>Saaku</b> (enough) · <b>Houdu / Illa</b> (yes / no) · <b>Danyavada</b> (thank you) · <b>Nanage Kannada gottilla, swalpa gottu</b> (I do not know Kannada, I know a little) · <b>Nimma hesaru enu?</b> (what is your name)', 'Say them badly to the same people every morning and let them correct you. The correcting is the lesson, and it is also the conversation.', 'You are not trying to be fluent. You are trying to be the one guy who bothered.'],
    milestones: [[2, 'Ten phrases used on real people'], [8, 'Twenty phrases, small talk with the stall guy'], [24, 'Auto drivers stop quoting you the outsider price']] },

  { id: 'dating', name: 'Dating and photos', aim: 'Real photos by late January, dating live for the last six weeks.',
    when: ['Photo drill: 10 min, twice a week, Mon and Thu before bed', 'Self-timer set: 30 shots, once a month', 'Real shoot: week 19, a Saturday'],
    where: ['Mirror in your room for the drill', 'Shoot: three spots on a Saturday evening, golden hour, a friend with a phone'],
    how: ['Five positions to learn cold: weight on back foot with hands doing something · three-quarter turn · walking shot · leaning with one limb bent · candid laugh.', 'Never square-on with arms hanging. Always bend something. Chin forward and down. Look away in one shot of three.', 'Shoot from chest height. Low angles make tall people loom.', 'Once a month: 30 self-timer shots, pick 3, write down what was different.', 'Week 2: baseline set. It will be bad. It is your before, and it gets you on the apps now.', 'Week 19: the real set. 200 shots, keep six — clear face · full body · doing something · with 1–2 friends · a place with character · something with personality.', 'Your side quests and your camera habit are quietly solving this. By January you will have months of real photos of yourself doing interesting things, which beats any posed shoot.'],
    milestones: [[2, 'Baseline photos, apps live'], [19, 'Real set shot, profiles rebuilt'], [24, 'Dating on good photos']] },

  { id: 'gym', name: 'Gym', aim: '80 kg to about 86 kg, roughly 4–6 kg of it muscle.',
    when: ['Mon, Thu, Fri — 15:30–17:00 at the office, last thing before the bus', 'Tue, Wed — 15:15–16:45, off-peak trip to the office'],
    where: ['Office gym only. City bus both ways, individual tickets, about ₹15–25 a trip.', 'Tue and Wed: leave the PG at 13:00. Off-peak the run is 20–25 minutes instead of 45. Job work at the office 13:45–15:15, lift, leave 16:50 before the crush.'],
    how: ['Five days, Monday to Friday. Weekend off. The Sunday run is the only extra.', 'Split is in the Body tab.', 'One rule: top of the rep range on every set, add 2.5 kg next time.', 'Log every set. Untracked training is why people lift for six months and look the same.', 'Spare t-shirt and wipes in the bag. Change after, shower at home.'],
    warn: 'Five days from tomorrow with no ramp. The first ten days will be rough. Start at the bottom of every rep range and let the weight climb — do not add extra volume in week one.',
    milestones: [[4, 'Every session logged'], [12, '82–83 kg, lifts up'], [24, '~86 kg, visibly different']] },

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

  { id: 'speak', name: 'Talking and stories', aim: 'Never run out of things to say. Ten stories you can tell well.',
    when: ['3 conversations a day, built into the walk, the bus, the gym, the café', '5-minute voice note every night', 'Wed 19:00 — write one story'],
    where: ['Everywhere. Needs no venue, which is why it is the cheapest win on the list.'],
    how: ['<b>Running out of things to say</b> is a hook problem. Every answer has 2–3 hooks. "Moved from Pune last year for work" gives you Pune, moving, work, timing. Pick one and go deeper, or match it with something of your own. Name the hook in your head for two weeks and it goes automatic.', '<b>Awkward pauses</b> are a volume problem. Three conversations a day. After about 300 the first twenty seconds stops feeling like a cliff.', '<b>Boring stories</b> are structure, not material. Write ten things that happened to you. Rework each into 90 seconds: setup, tension, turn, and a line to finish on. Decide the last line before you open your mouth.', '<b>Not articulate</b> — record yourself. One voice note a night, listen back once, note one thing. You cannot fix what you have never heard.', '<b>Not witty</b> — notice how often you have the funny thought and swallow it. That gap is your wit being filtered. Say more of them.', '<b>Go deep early.</b> Share something real in the first hour and the other person will match you. It is the fastest route from stranger to friend, and it is why some people make close friends in weeks.', '<b>For the startup:</b> the 10-second, 30-second and 2-minute version. Test all three at Saturday meetups. If eyes move, it is too long.'],
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
    warn: 'This is the goal to downgrade if something has to give. Longest payoff, least connected to everything else. Kannada will do more for your daily life in Bangalore for a twentieth of the effort.',
    milestones: [[2, 'Cyrillic back'], [12, '300 words, tutor calls running'], [24, 'A1 — you can handle a café in Russian']] },

  { id: 'read', name: 'Reading', aim: '10 books by March.',
    when: ['Bus, Mon/Thu/Fri, 25 min each way', '22:30–23:00 nightly', 'Sat morning when the side quest allows'],
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
    when: ['Flat search starts week 5', 'Move by 1 December', 'First dinner within two weeks of moving'],
    where: ['Zone A and slightly toward Kadubeesanahalli — Marathahalli, AECS Layout, Munnekolala, Doddanekkundi, Kundalahalli. Do not move further from the office; ORR roadworks run October to January.'],
    how: ['Rough month: PG or flat 20–25k · food outside PG 9k · bus tickets and autos 2.5k · social and side quests 8k · skin and grooming 2.5k · clothes 3k · swimming and italki 3.5k · buffer 3k.', 'Bus: individual tickets, ₹15–25 a trip, roughly ₹1,200–1,500 a month.', '<b>Pick the flat on the living room, not the rent.</b> It has to hold 12 people standing. That is the point of moving.', '<b>Ask the flatmate straight out whether he wants people in the house.</b> Someone asleep at 9pm makes hosting impossible and you will resent the flat in a month.', '2BHK in that belt is roughly ₹30–45k, so ₹15–23k each. Add ₹4–6k for food once PG meals go.', 'Keep ₹1.5–2.5 lakh liquid for the deposit.'],
    milestones: [[5, 'Search started'], [11, 'Moved in'], [24, '~₹2.35 lakh saved']] },
];

export const QUEST_IDEAS = `
<div class="field"><div class="k">Half-day</div><div class="v"><ul>
<li>Nandi Hills for sunrise — leave at 4am, back by 10</li>
<li>KR Market or Russell Market at 6am with the camera</li>
<li>Devanahalli Fort, Manchinabele, Hesaraghatta</li>
<li>A Bengaluru FC match at Kanteerava</li>
<li>Bangalore Palace, Tipu's Palace, the Bangalore Fort</li>
<li>A local football or cricket tournament in a village ground off Sarjapur</li>
<li>Whitefield Reads, then walk a part of the city you have never seen</li>
<li>A gig at a small venue — Fandom, Bflat, Windmills</li>
<li>Volunteer a day with a small local NGO. Bring two friends. Give money and a day, not just money.</li>
</ul></div></div>
<div class="field"><div class="k">Full day</div><div class="v"><ul>
<li>Ramanagara or Savandurga — trek and bouldering, 90 min away</li>
<li>Skandagiri night trek</li>
<li>Mysore by train, back the same night</li>
<li>Bheemeshwari or Kanakapura river side</li>
<li>Cycle Turahalli forest at dawn</li>
</ul></div></div>
<div class="field"><div class="k">Big quest<br>every 2 months</div><div class="v"><ul>
<li>Coorg · Gokarna · Hampi · Chikmagalur · Wayanad · Pondicherry</li>
<li>You organise it. Invite eight, expect five. Split costs before you go, not after.</li>
</ul></div></div>
<div class="field"><div class="k">Rules</div><div class="v"><ul>
<li>One a week, no exceptions. Plan Wednesday, book Sunday.</li>
<li>Alone is fine for the first month. From week 6, bring someone.</li>
<li>Take the camera. Photos are your reason to message people afterwards.</li>
</ul></div></div>`;

export const CHECKS: [string, string, string][] = [
  ['gym', 'Gym done', 'Mon–Fri'],
  ['startup', 'Startup block done', 'Before 11am'],
  ['protein', '150g+ protein', ''],
  ['out', 'Got out of the room', 'Mon, Tue, Thu, Fri, Sat'],
  ['record', 'Voice note recorded', '5 min, listen back once'],
  ['sidequest', 'Side quest', 'One a week'],
  ['russian', 'Russian, 20 min', ''],
  ['kannada', 'Used a Kannada line', ''],
  ['read', 'Read', ''],
  ['skin', 'Skin routine, AM + PM', ''],
];

export const COUNTS: [string, string][] = [
  ['convos', 'Conversations'], ['approaches', 'Approaches'], ['ig', 'Instagram exchanges'],
  ['invites', 'Invites sent'], ['followups', 'Follow-ups'], ['pages', 'Pages read'], ['hours', 'Startup hours'],
];

export const WEEK_GOALS: Record<string, number> = {
  convos: 5, approaches: 3, ig: 2, invites: 1, followups: 1, pages: 200, hours: 13,
  gym: 5, out: 5, protein: 6, sidequest: 1,
};

export const PHASES: [number, number, string, string[]][] = [
  [0, 1, "Weeks 1–2 · Get the frame up", [
    'Gym 5 days from tomorrow', 'All five startup blocks', 'Book the dermatologist this week',
    'Protein kit, chair, alarm clock', 'Book four Tuesday Playo slots in a row',
    'Pick your café and go Monday', 'Ten Kannada phrases', 'First side quest this Saturday',
    'Baseline photos and weight', 'Level 0 approaches — 3 conversations a day']],
  [2, 5, "Weeks 3–6 · Social engine on", [
    'Tuesday badminton and Sunday run club live', 'Weekly quota starts', 'Level 1 approaches — 2 a week',
    'Camera habit — photos at everything social', 'Protein system running',
    'DJ and Russian start (week 3)', 'Swimming starts (week 5)', 'Flat search starts (week 5)',
    'Start the Bangalore guide']],
  [6, 11, "Weeks 7–12 · Depth", [
    'Level 2 approaches — 3–5 a week', 'Bring someone on the side quest every week',
    'Style: reference board, tailor, three uniforms', 'Story bank at 10',
    'MVP ships by 15 December', 'Move into the flat by 1 December', 'Start your own group chat']],
  [12, 17, "Weeks 13–18 · Host", [
    'First potluck within two weeks of moving', 'First DJ set at a gathering',
    'First weekend trip you organise', 'Level 3 — asking for Instagram',
    'First users on the MVP', 'Swimming done by week 17']],
  [18, 23, "Weeks 19–24 · Compound and decide", [
    'Real photo set, profiles rebuilt', 'Dating live', 'Monthly hosting is a habit',
    'Dermatologist six-month review', 'Quit analysis — runway, traction, date']],
];

export const STAGES: Record<number, [string, string]> = {
  1: ['Acquaintance', 's1'], 2: ['Textable', 's2'], 3: ['Met 1:1', 's3'], 4: ['In my group', 's4'],
};

export const OUTCOMES: Record<string, [string, string]> = {
  bailed: ['Chickened out', 's1'], short: ['Short', 's1'], good: ['Real conversation', 's3'],
  ig: ['Got Instagram', 's4'], closed: ['Left cleanly', 's2'],
};

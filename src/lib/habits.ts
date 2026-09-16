import { daysBetween, fromIso } from './dates';
import { Habit } from './types';

export function isDue(habit: Habit, today: Date): boolean {
  if (!habit.lastDone) return true;
  const since = daysBetween(fromIso(habit.lastDone), today);
  switch (habit.cadence.kind) {
    case 'everyNDays':
      return since >= habit.cadence.n;
    case 'everyNWeeks':
      return since >= habit.cadence.n * 7;
    case 'weeklyOnDays':
      // A fixed-day cadence: due if today is one of the named days and it
      // hasn't already been done today (avoids re-firing after marking done).
      return habit.cadence.days.includes(today.getDay()) && since >= 1;
  }
}

export function dueHabits(habits: Habit[], today: Date): Habit[] {
  return habits.filter((h) => isDue(h, today));
}

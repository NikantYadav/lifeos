import { START } from './data';

export function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  x.setHours(0, 0, 0, 0);
  return x;
}

export function currentWeekIndex(today: Date): number {
  return Math.max(0, Math.min(23, Math.floor((today.getTime() - START.getTime()) / (7 * 864e5))));
}

export function weekDates(wi: number): string[] {
  const m = mondayOf(new Date(START.getTime() + wi * 7 * 864e5));
  return Array.from({ length: 7 }, (_, i) => iso(new Date(m.getTime() + i * 864e5)));
}

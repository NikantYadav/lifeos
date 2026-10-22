import { Check } from './types';

/** Whether a check is due on a JS getDay() weekday (0 = Sunday). No `days` means daily. */
export function checkDueOn(check: Check, dayOfWeek: number): boolean {
  const days = check[3];
  return !days || days.length === 0 || days.includes(dayOfWeek);
}

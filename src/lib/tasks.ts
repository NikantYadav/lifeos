import { Task } from './types';

export function isOverdue(task: Task, todayWeek: number): boolean {
  return task.status === 'pending' && task.triggerWeek < todayWeek;
}

export function weeksOverdue(task: Task, todayWeek: number): number {
  return Math.max(0, todayWeek - task.triggerWeek);
}

/** Pending tasks whose trigger week has arrived, overdue first, then oldest-created first. */
export function visibleTasks(tasks: Task[], todayWeek: number): Task[] {
  return tasks
    .filter((t) => t.status === 'pending' && t.triggerWeek <= todayWeek)
    .sort((a, b) => {
      const overdueDiff = Number(isOverdue(b, todayWeek)) - Number(isOverdue(a, todayWeek));
      if (overdueDiff !== 0) return overdueDiff;
      return a.createdAt - b.createdAt;
    });
}

/** Done/dropped tasks, most recently resolved first — never deleted, only status-changed. */
export function resolvedTasks(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.status !== 'pending')
    .sort((a, b) => (b.doneAt ?? b.droppedAt ?? '').localeCompare(a.doneAt ?? a.droppedAt ?? ''));
}

import { z } from 'zod';
import { cadenceSchema } from './trackers';

export const createHabitSchema = z
  .object({
    title: z.string().min(1).max(150),
    plan_id: z.string().uuid().optional(),
    cadence: cadenceSchema.optional(),
  })
  .strict();

export const updateHabitSchema = z
  .object({
    title: z.string().min(1).max(150).optional(),
    cadence: cadenceSchema.optional(),
    last_done: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'last_done must be YYYY-MM-DD')
      .nullable()
      .optional(),
    archived: z.boolean().optional(),
  })
  .strict();

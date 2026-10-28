import { z } from 'zod';
export const eventInput = z
  .strictObject({
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().max(300).default(''),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    timezone: z
      .string()
      .min(1)
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }),
    venue: z.strictObject({
      name: z.string().trim().min(1).max(160),
      address: z.string().trim().max(500).default(''),
    }),
  })
  .refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), {
    path: ['endsAt'],
    message: 'End must be later than start.',
  });
export type EventInput = z.infer<typeof eventInput>;
export type EventDto = EventInput & { id: string; version: number };

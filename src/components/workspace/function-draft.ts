import { eventInput } from '@/modules/events/contracts';
import { utcTime } from '@/modules/events/time';

// Read before the fieldset is disabled: disabled controls are absent from FormData.
export function readFunctionDraft(fields: FormData) {
  const zone = String(fields.get('timezone') ?? '');
  const parsed = eventInput.safeParse({
    title: fields.get('title'),
    description: fields.get('description'),
    startsAt: utcTime(String(fields.get('start') ?? ''), zone),
    endsAt: utcTime(String(fields.get('end') ?? ''), zone),
    timezone: zone,
    venue: { name: fields.get('venue'), address: fields.get('address') },
  });
  if (!parsed.success)
    throw new Error(
      parsed.error.issues[0]?.message ?? 'Check the form fields.',
    );
  return parsed.data;
}

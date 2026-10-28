import { describe, it, expect } from 'vitest';
import { readFunctionDraft } from '@/components/workspace/function-draft';
function fields() {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    title: 'Sangeet',
    description: 'Music and family',
    start: '2027-03-13T19:30',
    end: '2027-03-14T01:30',
    timezone: 'Asia/Kolkata',
    venue: 'Grand ballroom',
    address: 'Jaipur',
  }))
    data.set(key, value);
  return data;
}
describe('Function form draft capture', () => {
  it('builds a complete valid request from populated local date fields', () => {
    expect(readFunctionDraft(fields())).toEqual({
      title: 'Sangeet',
      description: 'Music and family',
      startsAt: '2027-03-13T14:00:00.000Z',
      endsAt: '2027-03-13T20:00:00.000Z',
      timezone: 'Asia/Kolkata',
      venue: { name: 'Grand ballroom', address: 'Jaipur' },
    });
  });
  it('keeps the captured payload independent of later control changes', () => {
    const form = fields();
    const draft = readFunctionDraft(form);
    for (const name of [...form.keys()]) form.delete(name);
    expect(draft.title).toBe('Sangeet');
    expect(draft.startsAt).toBe('2027-03-13T14:00:00.000Z');
  });
  it('does not mutate a draft when validation fails', () => {
    const form = fields();
    form.set('end', '2027-03-13T18:00');
    const before = [...form.entries()];
    expect(() => readFunctionDraft(form)).toThrow(
      'End must be later than start.',
    );
    expect([...form.entries()]).toEqual(before);
  });
  it('reports missing times before any submission is possible', () => {
    const form = fields();
    form.delete('start');
    expect(() => readFunctionDraft(form)).toThrow('Enter a date and time.');
  });
});

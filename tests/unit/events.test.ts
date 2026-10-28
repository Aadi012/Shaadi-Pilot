import { describe, it, expect } from 'vitest';
import { eventInput } from '@/modules/events/contracts';
import { utcTime, wallTime } from '@/modules/events/time';
const input = {
  title: 'Sangeet',
  startsAt: '2027-03-13T14:00:00Z',
  endsAt: '2027-03-13T20:00:00Z',
  timezone: 'Asia/Kolkata',
  venue: { name: 'Grand ballroom' },
};
describe('Function validation and local time', () => {
  it('converts Kolkata overnight times without using the browser timezone', () => {
    expect(utcTime('2027-03-14T01:30', 'Asia/Kolkata')).toBe(
      '2027-03-13T20:00:00.000Z',
    );
    expect(wallTime(input.startsAt, input.timezone)).toBe('2027-03-13T19:30');
  });
  it('rejects DST gaps and repeated hours', () => {
    expect(() => utcTime('2027-03-14T02:30', 'America/New_York')).toThrow();
    expect(() => utcTime('2027-11-07T01:30', 'America/New_York')).toThrow();
  });
  it('requires end after start and rejects tenant or publication injection', () => {
    expect(eventInput.safeParse(input).success).toBe(true);
    expect(
      eventInput.safeParse({ ...input, endsAt: input.startsAt }).success,
    ).toBe(false);
    expect(
      eventInput.safeParse({ ...input, weddingId: 'foreign' }).success,
    ).toBe(false);
    expect(eventInput.safeParse({ ...input, isPublished: true }).success).toBe(
      false,
    );
  });
});

export function daysUntilWedding(date: string, timezone: string, now: string) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now));
  const part = (type: string) =>
    parts.find((value) => value.type === type)!.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  return Math.round(
    (Date.parse(date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) /
      86400000,
  );
}
export function formatWeddingDate(date: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date + 'T12:00:00Z'));
}

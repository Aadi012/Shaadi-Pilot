// Convert a wall-clock value using its explicit IANA zone. Reject DST gaps and
// repeated hours rather than guessing which instant an organizer intended.
export function wallTime(instant: string, zone: string) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant));
  return parts.replace(' ', 'T');
}
export function utcTime(value: string, zone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error('Enter a date and time.');
  const rough = Date.parse(value + 'Z');
  const matches = new Set<string>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = rough + hours * 3600000;
    const offset =
      Date.parse(wallTime(new Date(sample).toISOString(), zone) + 'Z') -
      Math.floor(sample / 60000) * 60000;
    const candidate = new Date(rough - offset).toISOString();
    if (wallTime(candidate, zone) === value) matches.add(candidate);
  }
  if (matches.size !== 1)
    throw new Error(
      'This local time is skipped or repeated by a timezone change. Choose an unambiguous time.',
    );
  return [...matches][0];
}

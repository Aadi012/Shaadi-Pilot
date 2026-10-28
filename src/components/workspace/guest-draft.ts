import { guestInput, type GuestInput } from '@/modules/guests/contracts';
export function readGuestDraft(fields: FormData) {
  return guestInput.parse({
    displayName: fields.get('displayName'),
    email: fields.get('email'),
    phone: fields.get('phone'),
    notes: fields.get('notes'),
    selectedEventIds: fields.getAll('selectedEventIds'),
  });
}
// Compare raw values so invalid and whitespace-only edits are not lost. Function
// order is irrelevant; checking then unchecking restores the original draft.
export function guestDraftChanged(
  fields: FormData,
  initial: GuestInput | null,
) {
  for (const key of ['displayName', 'email', 'phone', 'notes'] as const) {
    if (String(fields.get(key) ?? '') !== (initial?.[key] ?? '')) return true;
  }
  return (
    JSON.stringify(fields.getAll('selectedEventIds').map(String).sort()) !==
    JSON.stringify([...(initial?.selectedEventIds ?? [])].sort())
  );
}

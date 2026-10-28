import type { GuestDto } from '@/modules/guests/contracts';
export type GuestPage = {
  guests: GuestDto[];
  summary: { total: number; withFunctions: number };
  nextCursor: string | null;
};
export type GuestListing = GuestPage & { query: string };
// Commit one successful result; a rejected load never changes applied pagination.
export function loadedGuestPage(
  previous: GuestListing,
  page: GuestPage,
  query: string,
  append: boolean,
): GuestListing {
  if (append && previous.query !== query)
    throw new Error('Refresh the guest directory before loading another page.');
  return {
    ...page,
    query,
    guests: append ? [...previous.guests, ...page.guests] : page.guests,
  };
}

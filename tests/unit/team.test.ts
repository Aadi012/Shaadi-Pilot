import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Team } from '@/components/workspace/team';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace() {}, refresh() {} }),
}));
describe('Team membership controls', () => {
  it('offers removal only for another Manager and requires hydration before enabling actions', () => {
    const html = renderToStaticMarkup(
      createElement(Team, {
        wedding: {
          id: 'wedding',
          displayNames: {
            partnerOne: 'Aarav',
            partnerTwo: 'Ananya',
            intro: '',
          },
          weddingDate: '2027-03-14',
          location: 'Jaipur',
          timezone: 'Asia/Kolkata',
          slug: 'aarav-ananya',
          isPublished: false,
          version: 0,
        },
        name: 'Admin organizer',
        userId: 'admin',
        initialMembers: {
          members: [
            {
              id: 'admin',
              name: 'Admin organizer',
              role: 'admin',
              membershipVersion: 0,
            },
            {
              id: 'other-admin',
              name: 'Other Admin',
              role: 'admin',
              membershipVersion: 0,
            },
            {
              id: 'manager',
              name: 'Planning Manager',
              role: 'manager',
              membershipVersion: 1,
            },
          ],
          nextCursor: null,
        },
        initialInvitations: { invitations: [], nextCursor: null },
      }),
    );
    expect(html).toContain('aria-label="Remove Planning Manager"');
    expect(html).not.toContain('aria-label="Remove Admin organizer"');
    expect(html).not.toContain('aria-label="Remove Other Admin"');
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*aria-label="Remove Planning Manager"/,
    );
    expect(html).toContain('Remove this Manager?');
    expect(html).toContain('Keep Manager');
  });
});

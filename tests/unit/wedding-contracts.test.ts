import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createWeddingSchema,
  slugSchema,
  idempotencySchema,
  editWeddingSchema,
} from '@/modules/weddings/contracts';
import {
  daysUntilWedding,
  formatWeddingDate,
} from '@/modules/weddings/calendar';
import { WeddingForm } from '@/components/workspace/wedding-form';
import { WorkspaceShell } from '@/components/workspace/workspace-shell';
import { WeddingSettings } from '@/components/workspace/wedding-settings';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace() {}, refresh() {} }),
}));
const data = {
  displayNames: { partnerOne: ' अनन्या ', partnerTwo: 'Aarav' },
  weddingDate: '2028-02-29',
  location: ' Jaipur ',
  timezone: 'Asia/Kolkata',
  slug: 'aarav-ananya',
};
describe('wedding creation contract', () => {
  it('rejects edits to locked and protected fields', () => {
    const editable = {
      displayNames: data.displayNames,
      weddingDate: data.weddingDate,
      location: data.location,
      timezone: data.timezone,
    };
    expect(editWeddingSchema.safeParse(editable).success).toBe(true);
    for (const field of [
      'slug',
      'weddingId',
      'role',
      'isPublished',
      'theme',
      '__v',
    ])
      expect(
        editWeddingSchema.safeParse({ ...editable, [field]: 'injected' })
          .success,
      ).toBe(false);
  });
  it('normalizes names/location and defaults the optional introduction', () => {
    expect(createWeddingSchema.parse(data)).toMatchObject({
      displayNames: { partnerOne: 'अनन्या', partnerTwo: 'Aarav', intro: '' },
      location: 'Jaipur',
    });
  });
  it('rejects invalid dates and timezones', () => {
    for (const weddingDate of [
      '2027-02-29',
      '2026-02-30',
      '2026-13-01',
      'March 14',
    ])
      expect(
        createWeddingSchema.safeParse({ ...data, weddingDate }).success,
      ).toBe(false);
    expect(
      createWeddingSchema.safeParse({ ...data, timezone: 'Made/Up' }).success,
    ).toBe(false);
  });
  it('rejects caller-supplied tenant, role and publication state', () => {
    for (const field of ['weddingId', 'createdBy', 'role', 'isPublished'])
      expect(
        createWeddingSchema.safeParse({ ...data, [field]: 'injected' }).success,
      ).toBe(false);
  });
  it('bounds slugs, names and introductions', () => {
    for (const slug of [
      'ab',
      'Aarav',
      'a--b',
      '-wedding',
      'wedding-',
      'private/link',
      'a'.repeat(61),
    ])
      expect(slugSchema.safeParse(slug).success).toBe(false);
    expect(
      createWeddingSchema.safeParse({
        ...data,
        displayNames: { partnerOne: 'a'.repeat(101), partnerTwo: 'A' },
      }).success,
    ).toBe(false);
    expect(
      createWeddingSchema.safeParse({
        ...data,
        displayNames: { ...data.displayNames, intro: 'a'.repeat(201) },
      }).success,
    ).toBe(false);
    expect(idempotencySchema.safeParse('arbitrary').success).toBe(false);
  });
});
describe('calendar dates in the wedding timezone', () => {
  it('counts calendar days using wedding-local midnight without UTC shifts', () => {
    expect(
      daysUntilWedding('2027-03-14', 'Asia/Kolkata', '2027-03-13T20:00:00Z'),
    ).toBe(0);
    expect(
      daysUntilWedding(
        '2027-03-14',
        'America/Los_Angeles',
        '2027-03-14T01:00:00Z',
      ),
    ).toBe(1);
    expect(
      daysUntilWedding('2027-03-13', 'Asia/Kolkata', '2027-03-13T20:00:00Z'),
    ).toBe(-1);
  });
  it('formats a calendar date without changing its day', () =>
    expect(formatWeddingDate('2027-03-14')).toContain('14 Mar 2027'));
});
describe('workspace presentation boundaries', () => {
  it('renders settings safely before hydration with a read-only address', () => {
    const html = renderToStaticMarkup(
      createElement(WeddingSettings, {
        wedding: {
          ...createWeddingSchema.parse(data),
          id: 'example',
          isPublished: false,
          version: 0,
        },
        name: 'Organizer',
        role: 'manager',
      }),
    );
    expect(html).toMatch(/<fieldset\b[^>]*\bdisabled=/);
    expect(html).toMatch(/id="wedding-address"[^>]*readOnly/);
    expect(html).not.toContain('>Team<');
    expect(html).toContain('Discard unsaved changes?');
  });
  it('prevents native form submission before hydration', () => {
    const html = renderToStaticMarkup(createElement(WeddingForm));
    expect(html).toMatch(/<fieldset\b[^>]*\bdisabled=/);
    expect(html).toContain('Asia/Kolkata');
  });
  it('hides Team membership navigation from Managers', () => {
    const wedding = {
      id: 'example',
      displayNames: { partnerOne: 'A', partnerTwo: 'B', intro: '' },
      weddingDate: '2027-03-14',
      location: 'Jaipur',
      timezone: 'Asia/Kolkata',
      slug: 'a-and-b',
      isPublished: false,
      version: 0,
    };
    for (const role of ['admin', 'manager'] as const) {
      const html = renderToStaticMarkup(
        createElement(
          WorkspaceShell,
          {
            wedding,
            name: 'Organizer',
            role,
          },
          'Overview',
        ),
      );
      expect(/>Team</.test(html)).toBe(role === 'admin');
      expect(html).not.toContain('Join with Code');
      expect(html).not.toContain('Encrypted');
    }
  });
});

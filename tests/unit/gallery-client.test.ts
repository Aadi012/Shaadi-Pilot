import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { freshPhotoView } from '@/components/workspace/gallery-client';
import { GalleryRemovalDialog } from '@/components/workspace/gallery-removal-dialog';
import { WorkspaceShell } from '@/components/workspace/workspace-shell';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace() {}, refresh() {} }),
}));
afterEach(() => vi.unstubAllGlobals());

describe('Gallery view and removal recovery', () => {
  it('reauthorizes every opening instead of reusing a thumbnail URL', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ data: { weddingId: 'wedding', url: 'preview' } }),
      )
      .mockResolvedValueOnce(
        Response.json({ data: { weddingId: 'wedding', url: 'fresh-open' } }),
      );
    vi.stubGlobal('fetch', fetch);
    expect(await freshPhotoView('photo', 'wedding')).toBe('preview');
    expect(await freshPhotoView('photo', 'wedding')).toBe('fresh-open');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/v1/gallery/photos/photo/view',
      { cache: 'no-store' },
    );
  });
  it('does not open a view belonging to another wedding or a revoked photo', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ data: { weddingId: 'other', url: 'foreign' } }),
        ),
    );
    await expect(freshPhotoView('photo', 'wedding')).rejects.toThrow(
      'Your wedding changed',
    );
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { message: 'Photo not found.', code: 'NOT_FOUND' } },
            { status: 404 },
          ),
        ),
    );
    await expect(freshPhotoView('photo', 'wedding')).rejects.toThrow(
      'Photo not found.',
    );
  });
  it('renders removal errors and refresh guidance inside the dialog and blocks stale retries', () => {
    const props = {
      dialogRef: null,
      name: 'Wedding photo',
      error: 'This photo changed.',
      stale: true,
      busy: false,
      onKeep() {},
      onCancel() {},
      onRefresh() {},
      onRemove() {},
    };
    const html = renderToStaticMarkup(
      createElement(GalleryRemovalDialog, props),
    );
    expect(html).toMatch(
      /<dialog[^>]*>[\s\S]*role="alert"[\s\S]*This photo changed\.[\s\S]*<\/dialog>/,
    );
    expect(html).toContain('Refresh gallery and review');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Remove photo<\/button>/);
    const retry = renderToStaticMarkup(
      createElement(GalleryRemovalDialog, { ...props, stale: false }),
    );
    expect(retry).not.toMatch(
      /<button[^>]*disabled=""[^>]*>Remove photo<\/button>/,
    );
  });
});

describe('Workspace page headers', () => {
  it('uses the active Expenses and Gallery titles rather than the overview title', () => {
    const wedding = {
      id: 'wedding',
      displayNames: { partnerOne: 'A', partnerTwo: 'B', intro: '' },
      weddingDate: '2027-03-14',
      location: 'Jaipur',
      timezone: 'Asia/Kolkata',
      slug: 'a-b',
      isPublished: false,
      version: 0,
    };
    for (const active of ['Expenses', 'Gallery'] as const) {
      const html = renderToStaticMarkup(
        createElement(WorkspaceShell, {
          wedding,
          name: 'Organizer',
          role: 'admin',
          active,
        }),
      );
      expect(html).toContain('<small>' + active + '</small>');
      expect(html).not.toContain('Workspace overview');
    }
  });
});

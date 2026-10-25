import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  redirect: vi.fn(),
  log: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/modules/auth/http.server', () => ({
  currentSession: mocks.session,
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/logging/logger.server', () => ({ logRequest: mocks.log }));
import AuthLayout from '@/app/(auth)/layout';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation(() => {
    throw new Error('redirect');
  });
});
describe('login and signup server boundary', () => {
  it('redirects valid signed-in sessions before showing forms', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'user' } });
    await expect(AuthLayout({ children: 'form' })).rejects.toThrow('redirect');
    expect(mocks.redirect).toHaveBeenCalledWith('/account');
  });
  it('renders forms for anonymous, expired or revoked sessions', async () => {
    mocks.session.mockResolvedValue(null);
    expect(
      renderToStaticMarkup(
        await AuthLayout({ children: createElement('p', null, 'Public form') }),
      ),
    ).toContain('Public form');
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it('fails safely on database errors without leaking provider text or redirecting', async () => {
    mocks.session.mockRejectedValue(new Error('private MongoDB detail'));
    const html = renderToStaticMarkup(
      await AuthLayout({ children: 'Private form' }),
    );
    expect(html).toContain('temporarily unavailable');
    expect(html).not.toContain('Private form');
    expect(html).not.toContain('private MongoDB detail');
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain(
      'private MongoDB detail',
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Repository instructions are maintained in our own AGENTS.md.
  agentRules: false,
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return ['/forgot-password', '/reset-password'].map((source) => ({
      source,
      headers: [
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Cache-Control', value: 'no-store' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      ],
    }));
  },
};

export default nextConfig;

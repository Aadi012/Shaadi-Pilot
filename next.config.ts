import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Repository instructions are maintained in our own AGENTS.md.
  agentRules: false,
  poweredByHeader: false,
  allowedDevOrigins: ['127.0.0.1'],
  reactStrictMode: true,
  async headers() {
    return ['/forgot-password', '/reset-password', '/join'].map((source) => ({
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

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Repository instructions are maintained in our own AGENTS.md.
  agentRules: false,
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;

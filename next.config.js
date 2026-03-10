/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'playwright'],
    instrumentationHook: true,
  },
};

module.exports = nextConfig;

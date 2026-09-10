const backend = process.env.LOCKCOMPUTER_SERVER_URL || 'http://localhost:5071';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      { source: '/auth/:path*', destination: `${backend}/auth/:path*` }
    ];
  }
};

export default nextConfig;

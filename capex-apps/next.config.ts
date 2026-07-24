import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.join(appRoot, '..');

const isProd = process.env.NODE_ENV === 'production';
const disableHmr = process.env.DISABLE_HMR === 'true' || process.env.TUNNEL_MODE === 'true';

/** Dev-only CSP — production CSP with nonce is set in middleware.ts */
const devSecurityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "object-src 'none'",
      "connect-src 'self' https: wss: ws:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  // Monorepo: Turbopack + output tracing share the same root (repo root has tailwindcss).
  turbopack: {
    root: monorepoRoot,
  },
  outputFileTracingRoot: monorepoRoot,
  async headers() {
    if (isProd) return [];
    return [
      {
        source: '/:path*',
        headers: devSecurityHeaders,
      },
    ];
  },
  webpack: (config, { dev, isServer }) => {
    if (dev && disableHmr && !isServer) {
      config.plugins = config.plugins?.filter(
        (plugin) => plugin?.constructor?.name !== 'HotModuleReplacementPlugin',
      );
    }
    return config;
  },
};

export default nextConfig;

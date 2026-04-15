import type { NextConfig } from "next";
import { readFileSync } from "fs";
import { buildContentSecurityPolicy } from "./src/lib/content-security-policy";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: buildContentSecurityPolicy(),
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['resend'],
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
  async headers() {
    return [
      {
        // Allow same-origin framing for the email preview route (used by admin iframe)
        source: '/api/v1/email/preview',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: buildContentSecurityPolicy({ frameAncestors: "'self'" }),
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
      {
        // Exclude email preview (it needs SAMEORIGIN for the admin iframe)
        source: '/((?!api/v1/email/preview).*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

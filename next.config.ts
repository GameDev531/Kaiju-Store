import type { NextConfig } from "next";

/**
 * Security headers are applied at the edge for every response.
 * CSP is intentionally strict: no inline scripts (we ship zero inline <script>),
 * no eval, no third-party frames, and a locked-down form-action.
 */
// Keyed on the deployment, not the build: a locally-served production build
// still needs the dev conveniences that a real deployment must not have.
const isDeployed = process.env.APP_ENV === "production" || process.env.APP_ENV === "staging";
const isProd = isDeployed;

const csp = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts; in production we rely on strict-dynamic
  // via nonce would require middleware rewriting of the document. We instead keep
  // 'unsafe-inline' ONLY for styles and use hashes-free script-src 'self'.
  isProd ? "script-src 'self'" : "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // The app never talks to third-party origins from the browser.
  "connect-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  isProd ? "upgrade-insecure-requests" : "",
]
  .filter(Boolean)
  .join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Uploaded references are served through our own signed route, never remotely optimized.
    remotePatterns: [],
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    // Server Actions are the only mutation surface for HTML forms; keep bodies small.
    serverActions: { bodySizeLimit: "12mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=(), interest-cohort=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          ...(isProd
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
            : []),
        ],
      },
      {
        // Uploaded/derived binary assets must never be sniffed into active content.
        source: "/api/files/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; sandbox" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Cache-Control", value: "private, max-age=60, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;

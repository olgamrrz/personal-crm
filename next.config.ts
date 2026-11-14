import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// CSP without a nonce: inline scripts are allowed ('unsafe-inline'), because Next.js puts inline scripts
// into every page and a nonce would force all pages to render on each request.
// Fonts come from next/font: downloaded at build time and served from our own domain, so 'self' is enough.
// Dev mode needs eval and a websocket for hot reload; production does not.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  // No includeSubDomains and no preload: the landing lives on the same domain
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // Same ban on framing as frame-ancestors, for old browsers
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  // Self-contained server in .next/standalone: the Docker image ships it without node_modules
  output: "standalone",
  // No "x-powered-by: Next.js" header: the app does not name its software
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

export interface SecurityHeader {
  key: string;
  value: string;
}

export interface SecurityHeadersOptions {
  isDev?: boolean;
  clerkPublishableKey?: string;
  convexUrl?: string;
}

function decodeClerkOrigin(publishableKey?: string): string | null {
  if (!publishableKey) return null;
  const match = /^pk_(?:live|test)_([A-Za-z0-9+/=_-]+)$/.exec(
    publishableKey.trim()
  );
  if (!match) return null;
  try {
    const decoded = Buffer.from(match[1], "base64")
      .toString("utf8")
      .replace(/\$$/, "")
      .trim()
      .toLowerCase();
    if (!decoded || !/^[a-z0-9.-]+$/.test(decoded) || !decoded.includes(".")) {
      return null;
    }
    return `https://${decoded}`;
  } catch {
    return null;
  }
}

function parseConvexOrigins(convexUrl?: string): string[] {
  if (!convexUrl) return [];
  try {
    const url = new URL(convexUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return [];
    const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
    return [url.origin, `${wsProtocol}//${url.host}`];
  } catch {
    return [];
  }
}

function unique(values: Array<string | null | undefined | false>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function buildContentSecurityPolicy(
  options: SecurityHeadersOptions = {}
): string {
  const isDev = options.isDev ?? process.env.NODE_ENV === "development";
  const clerkOrigin = decodeClerkOrigin(
    options.clerkPublishableKey ?? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  );
  const convexOrigins = parseConvexOrigins(
    options.convexUrl ?? process.env.NEXT_PUBLIC_CONVEX_URL
  );

  const directives: string[] = [
    "default-src 'self'",
    `script-src ${unique([
      "'self'",
      "'unsafe-inline'",
      isDev && "'unsafe-eval'",
      "https://clerk.trydevin.ai",
      "https://*.clerk.accounts.dev",
      "https://challenges.cloudflare.com",
      "https://static.cloudflareinsights.com",
      clerkOrigin,
    ]).join(" ")}`,
    `style-src ${unique([
      "'self'",
      "'unsafe-inline'",
      "https://api.fontshare.com",
    ]).join(" ")}`,
    `img-src ${unique([
      "'self'",
      "data:",
      "blob:",
      "https://img.clerk.com",
    ]).join(" ")}`,
    `font-src ${unique([
      "'self'",
      "data:",
      "https://cdn.fontshare.com",
    ]).join(" ")}`,
    `connect-src ${unique([
      "'self'",
      "https://clerk.trydevin.ai",
      "https://*.clerk.accounts.dev",
      "https://clerk-telemetry.com",
      "https://*.clerk-telemetry.com",
      "https://challenges.cloudflare.com",
      "https://cloudflareinsights.com",
      "https://*.convex.cloud",
      "wss://*.convex.cloud",
      clerkOrigin,
      ...convexOrigins,
      isDev && "http://localhost:*",
      isDev && "ws://localhost:*",
      isDev && "http://127.0.0.1:*",
      isDev && "ws://127.0.0.1:*",
    ]).join(" ")}`,
    `frame-src ${unique([
      "'self'",
      "https://challenges.cloudflare.com",
      "https://clerk.trydevin.ai",
      "https://*.clerk.accounts.dev",
      clerkOrigin,
    ]).join(" ")}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  if (!isDev) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}

export function buildSecurityHeaders(
  options: SecurityHeadersOptions = {}
): SecurityHeader[] {
  return [
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy(options),
    },
    {
      key: "X-Frame-Options",
      value: "DENY",
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
  ];
}

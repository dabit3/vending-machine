import { describe, expect, test } from "vitest";
import nextConfig from "../next.config";
import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
} from "../lib/security-headers";

function headerMap(headers: Array<{ key: string; value: string }>) {
  return Object.fromEntries(headers.map((h) => [h.key, h.value]));
}

describe("security headers", () => {
  test("sets required security headers on all routes while preserving stricter /sw.js CSP", async () => {
    const rules = await nextConfig.headers!();
    expect(rules.length).toBeGreaterThanOrEqual(2);

    const globalRule = rules[0];
    const swRule = rules[rules.length - 1];
    expect(globalRule.source).toBe("/:path*");
    expect(swRule.source).toBe("/sw.js");

    const globalHeaders = headerMap(globalRule.headers);
    expect(globalHeaders["X-Frame-Options"]).toBe("DENY");
    expect(globalHeaders["X-Content-Type-Options"]).toBe("nosniff");
    expect(globalHeaders["Referrer-Policy"]).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(globalHeaders["Permissions-Policy"]).toBe(
      "camera=(), microphone=(), geolocation=()"
    );
    expect(globalHeaders["Content-Security-Policy"]).toContain(
      "frame-ancestors 'none'"
    );
    expect(globalHeaders["Content-Security-Policy"]).toContain(
      "object-src 'none'"
    );

    const swHeaders = headerMap(swRule.headers);
    expect(swHeaders["Content-Security-Policy"]).toBe(
      "default-src 'self'; script-src 'self'"
    );
    expect(swHeaders["Cache-Control"]).toBe(
      "no-cache, no-store, must-revalidate"
    );
  });

  test("CSP allows Clerk, Convex, Fontshare, and service workers without unsafe-eval in production", () => {
    const csp = buildContentSecurityPolicy({ isDev: false });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("https://clerk.trydevin.ai");
    expect(csp).toContain("https://*.clerk.accounts.dev");
    expect(csp).toContain("https://challenges.cloudflare.com");
    expect(csp).toContain("https://*.convex.cloud");
    expect(csp).toContain("wss://*.convex.cloud");
    expect(csp).toContain("https://api.fontshare.com");
    expect(csp).toContain("https://cdn.fontshare.com");
    expect(csp).toContain("https://img.clerk.com");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  test("CSP includes unsafe-eval and localhost in development and omits upgrade-insecure-requests", () => {
    const csp = buildContentSecurityPolicy({ isDev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("http://localhost:*");
    expect(csp).toContain("ws://localhost:*");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  test("CSP extracts custom Clerk and Convex origins from env values and ignores malformed ones", () => {
    const customKey = `pk_live_${Buffer.from("auth.custom.example$").toString("base64")}`;
    const csp = buildContentSecurityPolicy({
      isDev: false,
      clerkPublishableKey: customKey,
      convexUrl: "https://custom.convex.example",
    });
    expect(csp).toContain("https://auth.custom.example");
    expect(csp).toContain("https://custom.convex.example");
    expect(csp).toContain("wss://custom.convex.example");

    const invalid = buildSecurityHeaders({
      isDev: false,
      clerkPublishableKey: "not-a-valid-key",
      convexUrl: "javascript:alert(1)",
    });
    const invalidCsp = headerMap(invalid)["Content-Security-Policy"];
    expect(invalidCsp).not.toContain("javascript:");
    expect(invalidCsp).not.toContain("not-a-valid-key");
  });
});

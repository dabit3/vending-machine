// Where to send someone after Clerk signs them in or up. `clerkMiddleware`'s
// `auth.protect()` sends signed-out visitors of /admin pages to /sign-in
// with `redirect_url` set to the page they asked for. Only a path on this
// site is honored: absolute URLs are reduced to their path and query, and
// anything that isn't a plain "/..." path (protocol-relative "//host",
// other schemes) is dropped so the parameter can't send people off-site.
export function safeReturnPath(
  raw: string | string[] | undefined
): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  let path: string;
  if (value.startsWith("/")) {
    path = value;
  } else {
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
      path = url.pathname + url.search;
    } catch {
      return undefined;
    }
  }
  if (path.startsWith("//") || /[\\\s]/.test(path)) return undefined;
  // The auth routes themselves (but not an event slug like /sign-invite).
  if (path === "/" || /^\/sign-(?:in|up)(?:[/?]|$)/.test(path)) return undefined;
  return path;
}

const reportedErrors = new WeakSet<object>();

export function reportClientError(
  error: Error & { digest?: string },
  boundary: "route" | "global"
) {
  if (typeof window === "undefined") return;
  if (reportedErrors.has(error)) return;
  reportedErrors.add(error);

  const body = JSON.stringify({
    message: (error.message || "Unexpected application error").slice(0, 500),
    digest: error.digest?.slice(0, 128),
    pathname: window.location.pathname.slice(0, 256),
    boundary,
  });

  try {
    if (typeof navigator.sendBeacon === "function") {
      const sent = navigator.sendBeacon(
        "/api/error-report",
        new Blob([body], { type: "application/json" })
      );
      if (sent) return;
    }
    void fetch("/api/error-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Error reporting must never break the fallback UI.
  }
}

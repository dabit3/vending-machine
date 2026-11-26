import { getAppName } from "./app-name";

export interface ErrorAlertPayload {
  source: "server" | "client";
  message: string;
  digest?: string;
  path?: string;
  method?: string;
  routePath?: string;
  routeType?: string;
  boundary?: "route" | "global";
}

const DEDUPE_WINDOW_MS = 60_000;
const MAX_DEDUPE_ENTRIES = 200;
const WEBHOOK_TIMEOUT_MS = 5_000;

const recentAlerts = new Map<string, number>();

export function resetErrorAlertDedupeForTests() {
  recentAlerts.clear();
}

export function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function parseWebhookUrl(raw?: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function shouldSendWebhook(signature: string, now: number): boolean {
  for (const [key, expiresAt] of recentAlerts) {
    if (expiresAt <= now) recentAlerts.delete(key);
  }
  const existing = recentAlerts.get(signature);
  if (existing !== undefined && existing > now) {
    return false;
  }
  if (recentAlerts.size >= MAX_DEDUPE_ENTRIES) {
    const oldest = recentAlerts.keys().next().value;
    if (oldest !== undefined) recentAlerts.delete(oldest);
  }
  recentAlerts.set(signature, now + DEDUPE_WINDOW_MS);
  return true;
}

function formatAlertText(entry: ErrorAlertPayload): string {
  const location = entry.path || entry.routePath || "(unknown path)";
  const scope =
    entry.source === "client"
      ? `client ${entry.boundary ?? "route"} boundary`
      : entry.routeType
        ? `server ${entry.routeType}`
        : "server";
  const parts = [
    `[${getAppName()}] Runtime error (${scope}) on ${location}: ${entry.message}`,
  ];
  if (entry.digest) {
    parts.push(`digest=${entry.digest}`);
  }
  return parts.join(" | ");
}

export async function sendErrorAlert(
  payload: ErrorAlertPayload,
  options: { webhookUrl?: string; now?: number } = {}
): Promise<{ alerted: boolean }> {
  const message = sanitizeText(payload.message, 500) || "Unknown error";
  const digest = sanitizeText(payload.digest, 128) || undefined;
  const rawPath = sanitizeText(payload.path, 256);
  const path = rawPath ? rawPath.split(/[?#]/, 1)[0] || undefined : undefined;
  const routePath = sanitizeText(payload.routePath, 256) || undefined;
  const routeType = sanitizeText(payload.routeType, 64) || undefined;
  const method = sanitizeText(payload.method, 16) || undefined;

  const entry: ErrorAlertPayload = {
    source: payload.source,
    message,
    ...(digest ? { digest } : {}),
    ...(path ? { path } : {}),
    ...(method ? { method } : {}),
    ...(routePath ? { routePath } : {}),
    ...(routeType ? { routeType } : {}),
    ...(payload.boundary ? { boundary: payload.boundary } : {}),
  };

  console.error(
    JSON.stringify({
      event: "runtime_error",
      app: getAppName(),
      timestamp: new Date(options.now ?? Date.now()).toISOString(),
      ...entry,
    })
  );

  const webhookUrl = parseWebhookUrl(
    options.webhookUrl ?? process.env.ERROR_ALERT_WEBHOOK_URL
  );
  if (!webhookUrl) {
    return { alerted: false };
  }

  const now = options.now ?? Date.now();
  const signature = `${entry.source}:${entry.path ?? entry.routePath ?? ""}:${entry.digest ?? entry.message}`;
  if (!shouldSendWebhook(signature, now)) {
    return { alerted: false };
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: formatAlertText(entry),
        app: getAppName(),
        timestamp: new Date(now).toISOString(),
        ...entry,
      }),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(
        `Error alert webhook returned ${res.status} for ${entry.source} error`
      );
      return { alerted: false };
    }
    return { alerted: true };
  } catch (err) {
    console.error("Failed to send error alert webhook:", err);
    return { alerted: false };
  }
}

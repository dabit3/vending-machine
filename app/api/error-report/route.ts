import { sanitizeText, sendErrorAlert } from "@/lib/error-alerts";

const MAX_BODY_BYTES = 4_096;

function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(req.url).origin;
  } catch {
    return false;
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!isSameOrigin(req)) {
    return new Response("Forbidden", { status: 403 });
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (rawBody.length === 0 || rawBody.length > MAX_BODY_BYTES) {
    return new Response("Bad Request", { status: 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  if (!parsed || typeof parsed !== "object") {
    return new Response("Bad Request", { status: 400 });
  }

  const record = parsed as Record<string, unknown>;
  const message = sanitizeText(record.message, 500);
  if (!message) {
    return new Response("Bad Request", { status: 400 });
  }

  const digest = sanitizeText(record.digest, 128) || undefined;
  const rawPathname = sanitizeText(record.pathname, 256);
  const pathname = rawPathname.startsWith("/") ? rawPathname : undefined;
  const boundary = record.boundary === "global" ? "global" : "route";

  await sendErrorAlert({
    source: "client",
    message,
    digest,
    path: pathname,
    boundary,
  });

  return new Response(null, { status: 204 });
}

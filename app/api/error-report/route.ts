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

async function readBoundedBody(
  req: Request,
  maxBytes: number
): Promise<{ ok: true; text: string } | { ok: false; status: 400 | 413 }> {
  const contentLengthHeader = req.headers.get("content-length");
  if (contentLengthHeader) {
    const declared = Number(contentLengthHeader);
    if (Number.isFinite(declared) && declared > maxBytes) {
      return { ok: false, status: 413 };
    }
  }

  if (!req.body) {
    return { ok: false, status: 400 };
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400 };
  }

  if (totalBytes === 0) {
    return { ok: false, status: 400 };
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(merged) };
}

export async function POST(req: Request): Promise<Response> {
  if (!isSameOrigin(req)) {
    return new Response("Forbidden", { status: 403 });
  }

  const bodyResult = await readBoundedBody(req, MAX_BODY_BYTES);
  if (!bodyResult.ok) {
    return new Response(
      bodyResult.status === 413 ? "Payload Too Large" : "Bad Request",
      { status: bodyResult.status }
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyResult.text);
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

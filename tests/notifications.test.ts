import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");
const adminIdentity = {
  subject: "admin",
  email: "admin@example.com",
  emailVerified: true,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function setupWithRequest() {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert("admins", { email: adminIdentity.email }));
  const admin = t.withIdentity(adminIdentity);
  const event = await admin.mutation(api.events.create, { name: "Summit" });
  const requestId = await t.run((ctx) =>
    ctx.db.insert("accessRequests", {
      eventId: event.id,
      email: "attendee@example.com",
      status: "approved",
    })
  );
  return { t, admin, event, requestId };
}

describe("sendApprovalEmail", () => {
  test("skips cleanly without alerting when RESEND_API_KEY is unset", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("ERROR_ALERT_WEBHOOK_URL", "https://hooks.example.com/alert");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { t, event, requestId } = await setupWithRequest();
    const result = await t.action(internal.notifications.sendApprovalEmail, {
      eventId: event.id,
      requestId,
      email: "attendee@example.com",
      eventName: "Summit",
      eventSlug: event.slug,
      reserved: true,
      alreadyClaimed: false,
    });

    expect(result).toEqual({ sent: false, skipped: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("marks access request as sent when Resend succeeds", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { t, admin, event, requestId } = await setupWithRequest();
    const result = await t.action(internal.notifications.sendApprovalEmail, {
      eventId: event.id,
      requestId,
      email: "attendee@example.com",
      eventName: "Summit",
      eventSlug: event.slug,
      reserved: true,
      alreadyClaimed: false,
    });

    expect(result).toEqual({ sent: true });
    const req = await t.run((ctx) => ctx.db.get(requestId));
    expect(req?.emailStatus).toBe("sent");
    expect(req?.emailError).toBeUndefined();
    const audit = await admin.query(api.auditLog.list, { eventId: event.id });
    expect(audit).toEqual([]);
  });

  test("records audit log, patches access request, and fires webhook on Resend HTTP error", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    vi.stubEnv("ERROR_ALERT_WEBHOOK_URL", "https://hooks.example.com/alert");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { t, admin, event, requestId } = await setupWithRequest();
    const result = await t.action(internal.notifications.sendApprovalEmail, {
      eventId: event.id,
      requestId,
      email: "attendee@example.com",
      eventName: "Summit",
      eventSlug: event.slug,
      reserved: true,
      alreadyClaimed: false,
    });

    expect(result).toEqual({ sent: false, error: "HTTP 429: rate limited" });
    const req = await t.run((ctx) => ctx.db.get(requestId));
    expect(req?.emailStatus).toBe("failed");
    expect(req?.emailError).toBe("HTTP 429: rate limited");

    const audit = await admin.query(api.auditLog.list, { eventId: event.id });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "approval_email_failed",
      subjectEmail: "attendee@example.com",
      details: "HTTP 429: rate limited",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("https://hooks.example.com/alert");
    const webhookBody = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(webhookBody.text).toContain("attendee@example.com");
    expect(webhookBody.text).toContain("HTTP 429: rate limited");
  });

  test("catches network errors from Resend and persists failure", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    vi.stubEnv("ERROR_ALERT_WEBHOOK_URL", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn().mockRejectedValue(new Error("socket hang up"));
    vi.stubGlobal("fetch", fetchMock);

    const { t, admin, event, requestId } = await setupWithRequest();
    const result = await t.action(internal.notifications.sendApprovalEmail, {
      eventId: event.id,
      requestId,
      email: "attendee@example.com",
      eventName: "Summit",
      eventSlug: event.slug,
      reserved: false,
      alreadyClaimed: false,
    });

    expect(result).toEqual({ sent: false, error: "socket hang up" });
    const req = await t.run((ctx) => ctx.db.get(requestId));
    expect(req?.emailStatus).toBe("failed");
    expect(req?.emailError).toBe("socket hang up");

    const audit = await admin.query(api.auditLog.list, { eventId: event.id });
    expect(audit[0]).toMatchObject({
      action: "approval_email_failed",
      subjectEmail: "attendee@example.com",
      details: "socket hang up",
    });
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import AppError from "../app/error";
import GlobalError from "../app/global-error";
import { POST as reportErrorPost } from "../app/api/error-report/route";
import { onRequestError } from "../instrumentation";
import {
  resetErrorAlertDedupeForTests,
  sendErrorAlert,
} from "../lib/error-alerts";

afterEach(() => {
  resetErrorAlertDedupeForTests();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("error boundaries", () => {
  test("app/error.tsx renders recovery UI and optional digest", () => {
    const err = Object.assign(new Error("Boom"), { digest: "digest-123" });
    const html = renderToStaticMarkup(<AppError error={err} retry={() => {}} />);
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Try again");
    expect(html).toContain("Go home");
    expect(html).toContain("Reference: digest-123");
    expect(html).not.toContain("Boom");
  });

  test("app/global-error.tsx renders a self-contained HTML document with recovery actions", () => {
    const err = Object.assign(new Error("Root crash"), { digest: "root-456" });
    const html = renderToStaticMarkup(
      <GlobalError error={err} retry={() => {}} />
    );
    expect(html).toContain("<html");
    expect(html).toContain("<body");
    expect(html).toContain("Something went wrong · Try Devin");
    expect(html).toContain("Try again");
    expect(html).toContain("Go home");
    expect(html).toContain("Reference: root-456");
    expect(html).not.toContain("Root crash");
  });
});

describe("runtime error alerts", () => {
  test("sendErrorAlert logs structured JSON and skips webhook when unconfigured", async () => {
    vi.stubEnv("ERROR_ALERT_WEBHOOK_URL", "");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendErrorAlert({
      source: "server",
      message: "Database timeout",
      digest: "abc",
      path: "/conference",
      routeType: "render",
    });

    expect(res).toEqual({ alerted: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledOnce();
    const logged = JSON.parse(String(errorSpy.mock.calls[0][0]));
    expect(logged).toMatchObject({
      event: "runtime_error",
      source: "server",
      message: "Database timeout",
      digest: "abc",
      path: "/conference",
      routeType: "render",
    });
  });

  test("sendErrorAlert posts to webhook and deduplicates repeated errors within 60s", async () => {
    vi.stubEnv("ERROR_ALERT_WEBHOOK_URL", "https://hooks.example.com/alert");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await sendErrorAlert(
      { source: "server", message: "Boom", digest: "d1", path: "/admin" },
      { now: 1_000 }
    );
    const duplicate = await sendErrorAlert(
      { source: "server", message: "Boom", digest: "d1", path: "/admin" },
      { now: 10_000 }
    );
    const afterWindow = await sendErrorAlert(
      { source: "server", message: "Boom", digest: "d1", path: "/admin" },
      { now: 70_000 }
    );

    expect(first).toEqual({ alerted: true });
    expect(duplicate).toEqual({ alerted: false });
    expect(afterWindow).toEqual({ alerted: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.text).toContain("[Try Devin] Runtime error");
    expect(body.text).toContain("/admin");
    expect(body.text).toContain("digest=d1");
  });

  test("instrumentation onRequestError forwards server errors to sendErrorAlert", async () => {
    vi.stubEnv("ERROR_ALERT_WEBHOOK_URL", "https://hooks.example.com/alert");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const err = Object.assign(new Error("RSC failed"), { digest: "rsc-99" });
    await onRequestError(
      err,
      { path: "/sign-in?__clerk_ticket=secret_token_123#frag", method: "GET", headers: {} },
      {
        routerKind: "App Router",
        routePath: "/sign-in/[[...sign-in]]",
        routeType: "render",
        renderSource: "react-server-components",
        revalidateReason: undefined,
      }
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body).toMatchObject({
      source: "server",
      message: "RSC failed",
      digest: "rsc-99",
      path: "/sign-in",
      method: "GET",
      routePath: "/sign-in/[[...sign-in]]",
      routeType: "render",
    });
    expect(JSON.stringify(body)).not.toContain("secret_token_123");
  });

  test("/api/error-report rejects cross-origin and invalid payloads and logs valid reports", async () => {
    vi.stubEnv("ERROR_ALERT_WEBHOOK_URL", "https://hooks.example.com/alert");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const crossOrigin = await reportErrorPost(
      new Request("https://trydevin.ai/api/error-report", {
        method: "POST",
        headers: {
          Origin: "https://evil.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: "spoofed" }),
      })
    );
    expect(crossOrigin.status).toBe(403);

    const badJson = await reportErrorPost(
      new Request("https://trydevin.ai/api/error-report", {
        method: "POST",
        headers: {
          Origin: "https://trydevin.ai",
          "Content-Type": "application/json",
        },
        body: "not-json",
      })
    );
    expect(badJson.status).toBe(400);

    const ok = await reportErrorPost(
      new Request("https://trydevin.ai/api/error-report", {
        method: "POST",
        headers: {
          Origin: "https://trydevin.ai",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "ChunkLoadError",
          digest: "cli-1",
          pathname: "/my-codes",
          boundary: "route",
        }),
      })
    );
    expect(ok.status).toBe(204);
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body).toMatchObject({
      source: "client",
      message: "ChunkLoadError",
      digest: "cli-1",
      path: "/my-codes",
      boundary: "route",
    });
  });
});

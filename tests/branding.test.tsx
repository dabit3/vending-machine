import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";
import { APP_URL, getAppName, isDevin } from "../lib/app-name";
import SiteFooter from "../components/SiteFooter";

afterEach(() => vi.unstubAllEnvs());

test("uses trydevin.ai as the public site domain", () => {
  expect(APP_URL).toBe("https://trydevin.ai");
  expect(new URL("/sample-event", APP_URL).href).toBe(
    "https://trydevin.ai/sample-event",
  );
});

test.each([undefined, "true", "false"])(
  "uses Try Devin branding when IS_DEVIN is %s",
  (flag) => {
    vi.stubEnv("IS_DEVIN", flag);
    expect(getAppName()).toBe("Try Devin");
    expect(isDevin()).toBe(flag === "true");
    const html = renderToStaticMarkup(<SiteFooter />);
    expect(html).toContain("Try Devin");
    expect(html).not.toContain("Vending Machine");
  },
);

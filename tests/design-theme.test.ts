import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function tokens(selector: string) {
  const block = css.slice(css.indexOf(`${selector} {`)).split("}")[0];
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)].map((match) => [
      match[1],
      match[2].toLowerCase(),
    ]),
  );
}

function luminance(hex: string) {
  const channels = hex.slice(1).match(/../g)!.map((channel) => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("the dark theme uses the new reference's charcoal canvas, rules, and blue accent", () => {
  const dark = tokens(".dark");
  expect(dark.background).toBe("#121212");
  expect(dark.foreground).toBe("#f2f2f2");
  expect(dark.border).toBe("#333333");
  expect(dark.link).toBe("#467bf7");
});

test("the reference fonts replace the previous Geist pairing", () => {
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  expect(layout).toContain("IBM_Plex_Mono");
  expect(layout).toContain("api.fontshare.com");
  expect(css).toContain('"General Sans"');
  expect(css).toContain("--font-ibm-plex-mono");
  expect(css).not.toContain("--font-geist");
});

test("palette and font changes preserve sizing, weights, spacing, and corner radii", () => {
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const button = readFileSync(new URL("../components/ui/button.tsx", import.meta.url), "utf8");
  expect(css).toContain("--radius: 0.625rem;");
  expect(css).toContain("font-size: 10px;\n  font-weight: 500;\n  letter-spacing: 0.18em;");
  expect(layout).toContain('borderRadius: "0.625rem"');
  expect(layout).toContain('defaultTheme="dark"');
  expect(button).toContain("bg-clip-padding font-mono text-sm font-medium whitespace-nowrap");
  expect(button).toContain("h-8 gap-1.5 px-2.5");
  expect(button).toContain('icon: "size-8"');
  expect(css).not.toContain("@utility frame-rails");
  expect(css).not.toContain("@utility page-title");
});

describe.each([":root", ".dark"])("%s theme contrast", (selector) => {
  const theme = tokens(selector);

  test.each(["background", "surface", "card"])(
    "body and secondary text are readable on %s",
    (surface) => {
      for (const text of ["foreground", "muted-foreground", "muted-dim", "link"]) {
        expect(contrast(theme[text], theme[surface])).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  test.each(["primary", "brand", "secondary", "accent", "popover"])(
    "%s text remains readable",
    (role) => {
      expect(contrast(theme[role], theme[`${role}-foreground`])).toBeGreaterThanOrEqual(4.5);
    },
  );

  test("button hover states preserve readable labels", () => {
    expect(contrast(theme["brand-hover"], theme["brand-foreground"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme["surface-hover"], theme["secondary-foreground"])).toBeGreaterThanOrEqual(4.5);
  });

  test("focus indicators contrast with the page and card surfaces", () => {
    for (const surface of ["background", "card"]) {
      expect(contrast(theme.ring, theme[surface])).toBeGreaterThanOrEqual(3);
    }
  });
});

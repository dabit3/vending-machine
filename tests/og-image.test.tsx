import { writeFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { homeCard, OG_SIZE, renderOgImage } from "../lib/og-image";

async function pngOf(response: Response) {
  expect(response.headers.get("content-type")).toBe("image/png");
  const bytes = new Uint8Array(await response.arrayBuffer());
  // PNG signature, then IHDR width/height at offsets 16 and 20.
  expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  const view = new DataView(bytes.buffer);
  expect(view.getUint32(16)).toBe(OG_SIZE.width);
  expect(view.getUint32(20)).toBe(OG_SIZE.height);
  return bytes;
}

test("home card renders a 1200x630 PNG", async () => {
  await pngOf(renderOgImage(homeCard()));
});

test("event card renders with a long name and description", async () => {
  const bytes = await pngOf(
    renderOgImage({
      eyebrow: "Oct 31, 2026",
      title: "AI Engineer World's Fair Hackathon San Francisco 2026",
      subtitle:
        "Free Devin credits for every registered hacker. Sign in with the email you registered with and your code is yours.",
    }),
  );
  if (process.env.OG_DEBUG_OUT) await writeFile(process.env.OG_DEBUG_OUT, bytes);
});

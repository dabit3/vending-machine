import { expect, test } from "vitest";
import { blockExpirySummary, formatCodeExpiry } from "../lib/code-expiry";

const now = Date.UTC(2027, 0, 15, 12);
const jan31 = new Date(2027, 0, 31, 23, 59).getTime();
const mar1 = new Date(2027, 2, 1, 23, 59).getTime();
const jan1 = new Date(2027, 0, 1, 23, 59).getTime();

test("block with no expiry dates", () => {
  expect(blockExpirySummary([undefined, undefined], now)).toEqual({ label: "No expiry", status: "none" });
  expect(blockExpirySummary([], now)).toEqual({ label: "No expiry", status: "none" });
});

test("one shared date shows once", () => {
  expect(blockExpirySummary([jan31, jan31], now)).toEqual({ label: formatCodeExpiry(jan31), status: "active" });
});

test("mixed dates show a range and flag partly expired blocks", () => {
  expect(blockExpirySummary([jan31, mar1], now).label).toBe(`${formatCodeExpiry(jan31)} – ${formatCodeExpiry(mar1)}`);
  expect(blockExpirySummary([jan1, mar1], now).status).toBe("partlyExpired");
});

test("fully expired block and codes that never expire", () => {
  expect(blockExpirySummary([jan1], now).status).toBe("expired");
  expect(blockExpirySummary([jan1, undefined], now).status).toBe("partlyExpired");
  expect(blockExpirySummary([jan31, undefined], now).label).toBe(`${formatCodeExpiry(jan31)} (some never expire)`);
});

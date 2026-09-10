import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ClaimInstructions } from "../components/ClaimInstructions";
import { ClaimInstructionsField } from "../components/ClaimInstructionsField";
import { CLAIM_INSTRUCTION_PRESETS, claimInstructionsMode } from "../lib/claim-instructions";

const note = "If you had a previous Windsurf account and your code does not work, try using a new email address.";

test.each(["pro", "max"] as const)("renders the updated %s preset with a checkout link and two paragraphs", (plan) => {
  const preset = CLAIM_INSTRUCTION_PRESETS[plan];
  expect(preset.text).toBe(`Redeem at checkout for a free Devin ${preset.label} plan at https://app.devin.ai/.\n\n${note}`);
  expect(claimInstructionsMode(preset.text)).toBe(plan);
  const html = renderToStaticMarkup(<ClaimInstructions value={preset.text} />);
  expect(html).toContain('href="https://app.devin.ai/"');
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain(`>${note}</p>`);
  expect(html.match(/<p\b/g)).toHaveLength(2);
});

test.each(["pro", "max"] as const)("recognizes and displays legacy %s presets without rewriting custom instructions", (plan) => {
  const preset = CLAIM_INSTRUCTION_PRESETS[plan];
  const legacy = `Redeem at checkout for a free Devin ${preset.label} plan. ${note}`;
  expect(claimInstructionsMode(legacy)).toBe(plan);
  expect(renderToStaticMarkup(<ClaimInstructions value={legacy} />)).toContain('href="https://app.devin.ai/"');
  const custom = `${legacy} Contact your event host.`;
  expect(claimInstructionsMode(custom)).toBe("custom");
  expect(renderToStaticMarkup(<ClaimInstructions value={custom} />)).not.toContain("<a ");
});

test("supports Markdown links, bare URLs, emphasis, lists, and existing line breaks", () => {
  const html = renderToStaticMarkup(<ClaimInstructions value={"**Redeem** at [checkout](https://app.devin.ai/).\nUse a new email.\n\n- Open https://app.devin.ai/.\n- Enter your code."} />);
  expect(html).toContain("<strong>Redeem</strong>");
  expect(html).toContain(">checkout</a>");
  expect(html.match(/href="https:\/\/app.devin.ai\/"/g)).toHaveLength(2);
  expect(html).toContain("\nUse a new email.");
  expect(html).toContain("<ul");
  expect(html).toContain("<li>Enter your code.</li>");
});

test.each([
  "[bad](javascript:alert%281%29)",
  "[bad](data:text/html,test)",
  "[bad](vbscript:test)",
  "[bad](javascript&#58;alert%281%29)",
  '<script>alert(1)</script><img src="https://example.com/tracker" onerror="alert(1)">',
  "![tracker](https://example.com/tracker)",
])("does not render unsafe links, raw HTML, or external images: %s", (value) => {
  const html = renderToStaticMarkup(<ClaimInstructions value={value} />);
  expect(html).not.toMatch(/href=|<script|<img|onerror=/i);
});

test("previews formatted presets and custom instructions in the shared editor", () => {
  const render = (value: string) => renderToStaticMarkup(<ClaimInstructionsField id="instructions" value={value} onChange={() => {}} description="Read before claiming." />);
  expect(render(CLAIM_INSTRUCTION_PRESETS.pro.text)).toContain('href="https://app.devin.ai/"');
  const html = render("Go to [checkout](https://app.devin.ai/).");
  expect(html).toContain("Markdown");
  expect(html).toContain("Preview");
  expect(html).toContain(">checkout</a>");
});

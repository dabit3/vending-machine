import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ClaimInstructions } from "../components/ClaimInstructions";
import { ClaimInstructionsField } from "../components/ClaimInstructionsField";
import { CLAIM_INSTRUCTION_PRESETS, claimInstructionsMode } from "../lib/claim-instructions";

const cancelNote = "If you already have a Devin subscription, please cancel your subscription first before using the coupon in order to not be charged. Go to Settings -> Plans -> Manage billing -> Cancel subscription.";
const previousSubscriptionNote = [
  "If you already have a Devin subscription, you can redeem your coupon in one of two ways:",
  "1. Create new account in your current org",
  "   - Click on account name in top left corner",
  "   - Click Switch account",
  '   - Click "Create new account"',
  "2. Sign up with a completely new email address",
].join("\n");
const subscriptionNote = [
  "If you already have a Devin subscription, you can redeem your coupon in one of two ways:",
  "1. Create a new account in your current org",
  "   - Click on the account name in top left corner",
  "   - Click Switch account",
  '   - Click "Create new account"',
  "2. Sign up with a completely new email address",
].join("\n");
const subscriptionNoteHtml = [
  "<p>If you already have a Devin subscription, you can redeem your coupon in one of two ways:</p>",
  '<ol class="list-decimal pl-5">',
  "<li>Create a new account in your current org",
  '<ul class="list-disc pl-5">',
  "<li>Click on the account name in top left corner</li>",
  "<li>Click Switch account</li>",
  "<li>Click &quot;Create new account&quot;</li>",
  "</ul>",
  "</li>",
  "<li>Sign up with a completely new email address</li>",
  "</ol>",
].join("\n");
const note = "If you had a previous Windsurf account and your code does not work, try using a new email address.";

test.each(["pro", "max"] as const)("renders the updated %s preset with a checkout link and the two-option subscription note", (plan) => {
  const preset = CLAIM_INSTRUCTION_PRESETS[plan];
  expect(preset.text).toBe(`Redeem at checkout for a free Devin ${preset.label} plan at https://app.devin.ai/.\n\n${subscriptionNote}\n\n${note}`);
  expect(preset.text).not.toContain("cancel your subscription");
  expect(claimInstructionsMode(preset.text)).toBe(plan);
  const html = renderToStaticMarkup(<ClaimInstructions value={preset.text} />);
  expect(html).toContain('href="https://app.devin.ai/"');
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain(`${subscriptionNoteHtml}\n<p>${note}</p>`);
  expect(html).not.toContain("cancel your subscription");
  expect(html).not.toContain("Create new account in your current org");
  expect(html.match(/<p\b/g)).toHaveLength(3);
});

test.each(["pro", "max"] as const)("recognizes and displays legacy %s presets without rewriting custom instructions", (plan) => {
  const preset = CLAIM_INSTRUCTION_PRESETS[plan];
  const legacy = `Redeem at checkout for a free Devin ${preset.label} plan. ${note}`;
  const previous = `Redeem at checkout for a free Devin ${preset.label} plan at https://app.devin.ai/.\n\n${note}`;
  const cancel = `Redeem at checkout for a free Devin ${preset.label} plan at https://app.devin.ai/.\n\n${cancelNote}\n\n${note}`;
  const twoOptions = `Redeem at checkout for a free Devin ${preset.label} plan at https://app.devin.ai/.\n\n${previousSubscriptionNote}\n\n${note}`;
  for (const stored of [legacy, previous, cancel, twoOptions]) {
    expect(claimInstructionsMode(stored)).toBe(plan);
    const html = renderToStaticMarkup(<ClaimInstructions value={stored} />);
    expect(html).toContain('href="https://app.devin.ai/"');
    expect(html).toContain(subscriptionNoteHtml);
    expect(html).not.toContain("cancel your subscription");
    expect(html).not.toContain("Create new account in your current org");
  }
  const custom = `${legacy} Contact your event host.`;
  expect(claimInstructionsMode(custom)).toBe("custom");
  const customHtml = renderToStaticMarkup(<ClaimInstructions value={custom} />);
  expect(customHtml).not.toContain("<a ");
  expect(customHtml).not.toContain(subscriptionNoteHtml);
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

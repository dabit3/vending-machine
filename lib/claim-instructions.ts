const CANCEL_NOTE =
  "If you already have a Devin subscription, please cancel your subscription first before using the coupon in order to not be charged. Go to Settings -> Plans -> Manage billing -> Cancel subscription.";

// Markdown: a numbered list whose first item carries nested bullets.
const EXISTING_SUBSCRIPTION_NOTE = [
  "If you already have a Devin subscription, you can redeem your coupon in one of two ways:",
  "1. Create new account in your current org",
  "   - Click on account name in top left corner",
  "   - Click Switch account",
  '   - Click "Create new account"',
  "2. Sign up with a completely new email address",
].join("\n");

const WINDSURF_NOTE =
  "If you had a previous Windsurf account and your code does not work, try using a new email address.";

function preset(label: string) {
  return {
    label,
    text: `Redeem at checkout for a free Devin ${label} plan at https://app.devin.ai/.\n\n${EXISTING_SUBSCRIPTION_NOTE}\n\n${WINDSURF_NOTE}`,
    // Earlier wordings still stored on events; rendered as `text`.
    legacyTexts: [
      `Redeem at checkout for a free Devin ${label} plan at https://app.devin.ai/.\n\n${CANCEL_NOTE}\n\n${WINDSURF_NOTE}`,
      `Redeem at checkout for a free Devin ${label} plan at https://app.devin.ai/.\n\n${WINDSURF_NOTE}`,
      `Redeem at checkout for a free Devin ${label} plan. ${WINDSURF_NOTE}`,
    ],
  } as const;
}

export const CLAIM_INSTRUCTION_PRESETS = {
  pro: preset("Pro"),
  max: preset("Max"),
} as const;

export type ClaimInstructionPreset = keyof typeof CLAIM_INSTRUCTION_PRESETS;

export type ClaimInstructionsMode = "none" | ClaimInstructionPreset | "custom";

export function claimInstructionsMode(
  instructions: string
): ClaimInstructionsMode {
  if (!instructions.trim()) return "none";
  for (const [key, preset] of Object.entries(CLAIM_INSTRUCTION_PRESETS)) {
    if (
      preset.text === instructions ||
      preset.legacyTexts.some((legacy) => legacy === instructions)
    )
      return key as ClaimInstructionPreset;
  }
  return "custom";
}

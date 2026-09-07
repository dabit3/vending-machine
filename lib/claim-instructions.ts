export const CLAIM_INSTRUCTION_PRESETS = {
  pro: {
    label: "Pro",
    text: "Redeem at checkout for a free Devin Pro plan. If you had a previous Windsurf account and your code does not work, try using a new email address.",
  },
  max: {
    label: "Max",
    text: "Redeem at checkout for a free Devin Max plan. If you had a previous Windsurf account and your code does not work, try using a new email address.",
  },
} as const;

export type ClaimInstructionPreset = keyof typeof CLAIM_INSTRUCTION_PRESETS;

export type ClaimInstructionsMode = "none" | ClaimInstructionPreset | "custom";

export function claimInstructionsMode(
  instructions: string
): ClaimInstructionsMode {
  if (!instructions.trim()) return "none";
  for (const [key, preset] of Object.entries(CLAIM_INSTRUCTION_PRESETS)) {
    if (preset.text === instructions) return key as ClaimInstructionPreset;
  }
  return "custom";
}

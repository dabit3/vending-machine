import { MarkdownText } from "@/components/MarkdownText";
import { CLAIM_INSTRUCTION_PRESETS, claimInstructionsMode } from "@/lib/claim-instructions";

export function ClaimInstructions({
  value,
  id,
  className,
}: {
  value: string;
  id?: string;
  className?: string;
}) {
  const mode = claimInstructionsMode(value);
  const text = mode === "pro" || mode === "max"
    ? CLAIM_INSTRUCTION_PRESETS[mode].text
    : value;
  return <MarkdownText id={id} value={text} className={className} />;
}

import { MarkdownText } from "@/components/MarkdownText";
import { CLAIM_INSTRUCTION_PRESETS, claimInstructionsMode } from "@/lib/claim-instructions";

// Instructions as attendees see them: exact legacy Pro/Max presets show the
// current wording.
export function resolveClaimInstructions(value: string): string {
  const mode = claimInstructionsMode(value);
  return mode === "pro" || mode === "max"
    ? CLAIM_INSTRUCTION_PRESETS[mode].text
    : value;
}

// Pasteable text: Markdown links become "label (url)" and emphasis markers
// are dropped; list numbering and indentation are kept.
export function claimInstructionsCopyText(value: string): string {
  return resolveClaimInstructions(value)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, url: string) =>
      label === url ? url : `${label} (${url})`
    )
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .trim();
}

export function ClaimInstructions({
  value,
  id,
  className,
}: {
  value: string;
  id?: string;
  className?: string;
}) {
  return (
    <MarkdownText
      id={id}
      value={resolveClaimInstructions(value)}
      className={className}
    />
  );
}

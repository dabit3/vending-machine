"use client";

import { useState } from "react";
import {
  CLAIM_INSTRUCTION_PRESETS,
  claimInstructionsMode,
  type ClaimInstructionsMode,
} from "@/lib/claim-instructions";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ClaimInstructions } from "@/components/ClaimInstructions";

const MODES: { value: ClaimInstructionsMode; label: string }[] = [
  { value: "none", label: "None" },
  ...Object.entries(CLAIM_INSTRUCTION_PRESETS).map(([value, preset]) => ({
    value: value as ClaimInstructionsMode,
    label: preset.label,
  })),
  { value: "custom", label: "Custom" },
];

export function ClaimInstructionsField({
  id,
  value,
  onChange,
  description,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  description: string;
  className?: string;
}) {
  const [mode, setMode] = useState<ClaimInstructionsMode>(() =>
    claimInstructionsMode(value)
  );

  function selectMode(next: ClaimInstructionsMode) {
    setMode(next);
    if (next === "none") onChange("");
    else if (next === "custom") {
      if (claimInstructionsMode(value) !== "custom") onChange("");
    } else onChange(CLAIM_INSTRUCTION_PRESETS[next].text);
  }

  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>Redemption instructions</FieldLabel>
      <Tabs
        value={mode}
        onValueChange={(next) => selectMode(next as ClaimInstructionsMode)}
      >
        <TabsList className="w-full" aria-label="Redemption instructions">
          {MODES.map((m) => (
            <TabsTrigger key={m.value} value={m.value}>
              {m.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {mode === "custom" ? (
        <>
          <Textarea
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="How to redeem the code after claiming"
            rows={4}
            className="resize-y"
            aria-describedby={`${id}-markdown-help`}
          />
          <FieldDescription id={`${id}-markdown-help`}>
            Markdown is supported. Use [link text](https://app.devin.ai/) for a link, or paste a URL. Add a blank line between paragraphs.
          </FieldDescription>
          {value.trim() && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Preview</p>
              <ClaimInstructions value={value} className="rounded-md border bg-muted/40 px-3 py-2 text-muted-foreground" />
            </div>
          )}
        </>
      ) : mode !== "none" ? (
        <ClaimInstructions
          id={id}
          value={CLAIM_INSTRUCTION_PRESETS[mode].text}
          className="rounded-md border bg-muted/40 px-3 py-2 text-muted-foreground"
        />
      ) : null}
      <FieldDescription>{description}</FieldDescription>
    </Field>
  );
}

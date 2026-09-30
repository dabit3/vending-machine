"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  CLAIM_INSTRUCTION_PRESETS,
  claimInstructionsMode,
  type ClaimInstructionsMode,
} from "@/lib/claim-instructions";
import { Button } from "@/components/ui/button";
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
  const [customDraft, setCustomDraft] = useState(() =>
    claimInstructionsMode(value) === "custom" ? value : ""
  );
  const [showPreview, setShowPreview] = useState(false);

  function selectMode(next: ClaimInstructionsMode) {
    if (mode === "custom") setCustomDraft(value);
    setMode(next);
    if (next === "none") onChange("");
    else if (next === "custom") onChange(mode === "custom" ? value : customDraft);
    else onChange(CLAIM_INSTRUCTION_PRESETS[next].text);
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
          <div className="flex items-start justify-between gap-3">
            <FieldDescription id={`${id}-markdown-help`}>
              Markdown is supported. Use [link text](https://app.devin.ai/) for a link, or paste a URL. Add a blank line between paragraphs.
            </FieldDescription>
            {value.trim() && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => setShowPreview((v) => !v)}
                aria-expanded={showPreview}
                aria-controls={`${id}-preview`}
              >
                {showPreview ? (
                  <EyeOff data-icon="inline-start" />
                ) : (
                  <Eye data-icon="inline-start" />
                )}
                {showPreview ? "Hide preview" : "Show preview"}
              </Button>
            )}
          </div>
          {value.trim() && showPreview && (
            <ClaimInstructions
              id={`${id}-preview`}
              value={value}
              className="rounded-md border bg-muted/40 px-3 py-2 text-muted-foreground"
            />
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

"use client";

import { MarkdownText } from "@/components/MarkdownText";
import { Field, FieldDescription } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

export function ClaimMessageField({
  id,
  value,
  onChange,
  autoFocus,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const custom = value.trim();
  return (
    <Field className={className}>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="resize-y"
        autoFocus={autoFocus}
        placeholder="You're in. Your code is dispensed as soon as you open the redemption steps."
      />
      <FieldDescription>
        Replaces the default &ldquo;You&apos;re in&rdquo; message shown to
        eligible attendees before claiming. Markdown works.
      </FieldDescription>
      {custom ? (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground">Preview</p>
          <div className="pointer-events-none select-none">
            <MarkdownText
              value={custom}
              className="text-base leading-relaxed text-muted-foreground"
            />
          </div>
        </div>
      ) : null}
    </Field>
  );
}

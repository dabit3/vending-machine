"use client";

import { useState } from "react";
import { Pencil, RotateCcw } from "lucide-react";
import type { AttendeeIdentity } from "@/lib/attendee-identity";
import { SignInHint } from "@/components/SignInHint";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function SignInMessageField({
  id,
  value,
  onChange,
  identity,
  dynamic,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  identity: AttendeeIdentity;
  dynamic: boolean;
  className?: string;
}) {
  const [customizing, setCustomizing] = useState(() => value.trim() !== "");
  const [openedByUser, setOpenedByUser] = useState(false);
  const custom = value.trim();

  function resetToDefault() {
    onChange("");
    setCustomizing(false);
    setOpenedByUser(false);
  }

  return (
    <Field className={className}>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel htmlFor={customizing ? id : undefined}>
          Sign-in message
        </FieldLabel>
        {customizing ? (
          <Button type="button" variant="ghost" size="sm" onClick={resetToDefault}>
            <RotateCcw data-icon="inline-start" />
            Use default
          </Button>
        ) : null}
      </div>
      {customizing ? (
        <>
          <Textarea
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            className="resize-y"
            autoFocus={openedByUser}
            placeholder={
              identity === "x"
                ? "Sign in with the X account you RSVP’d with."
                : "Sign in with the email you RSVP’d with."
            }
          />
          <FieldDescription>
            Replaces the default message above the claim page&apos;s sign-in
            button. Markdown works.
          </FieldDescription>
          {custom ? (
            <PreviewFrame label="Preview">
              <SignInHint identity={identity} message={custom} />
            </PreviewFrame>
          ) : null}
        </>
      ) : (
        <PreviewFrame
          label="Default · shown before attendees sign in"
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setCustomizing(true);
                setOpenedByUser(true);
              }}
            >
              <Pencil data-icon="inline-start" />
              Customize sign-in message
            </Button>
          }
        >
          <SignInHint identity={identity} dynamic={dynamic} />
        </PreviewFrame>
      )}
    </Field>
  );
}

function PreviewFrame({
  label,
  action,
  children,
  className,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-dashed bg-muted/30 p-3",
        className,
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="pointer-events-none select-none">{children}</div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

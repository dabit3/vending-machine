"use client";

import { FileText, ListChecks, Mail, MessageSquareText } from "lucide-react";
import type { AttendeeIdentity } from "@/lib/attendee-identity";
import {
  CLAIM_INSTRUCTION_PRESETS,
  claimInstructionsMode,
} from "@/lib/claim-instructions";
import { ClaimInstructionsField } from "@/components/ClaimInstructionsField";
import { ContactEmailField } from "@/components/ContactEmailField";
import { OptionalSettings } from "@/components/OptionalSettings";
import { SignInMessageField } from "@/components/SignInMessageField";
import { Field, FieldDescription } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function instructionsSummary(instructions: string) {
  const mode = claimInstructionsMode(instructions);
  if (mode === "none") return undefined;
  if (mode === "custom") return "Custom";
  return CLAIM_INSTRUCTION_PRESETS[mode].label;
}

// The optional, attendee-facing event settings shared by the create and
// manage forms: description, redemption instructions, sign-in message and
// contact email.
export function EventOptionalSettings({
  idPrefix,
  description,
  onDescriptionChange,
  instructions,
  onInstructionsChange,
  instructionsDescription,
  signInMessage,
  onSignInMessageChange,
  identity,
  contactEmail,
  onContactEmailChange,
  className,
}: {
  idPrefix: string;
  description: string;
  onDescriptionChange: (value: string) => void;
  instructions: string;
  onInstructionsChange: (value: string) => void;
  instructionsDescription: string;
  signInMessage: string;
  onSignInMessageChange: (value: string) => void;
  identity: AttendeeIdentity;
  contactEmail: string;
  onContactEmailChange: (value: string) => void;
  className?: string;
}) {
  return (
    <section
      className={cn("flex flex-col gap-3", className)}
      aria-labelledby={`${idPrefix}-experience-heading`}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h3 id={`${idPrefix}-experience-heading`} className="text-sm font-medium">
            Attendee experience
          </h3>
          <Badge variant="outline">Optional</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Customize what attendees see before and after claiming a code.
        </p>
      </div>
      <OptionalSettings
        settings={[
          {
            key: "description",
            id: `${idPrefix}-description`,
            title: "Description",
            addLabel: "Add description",
            description: "A welcome and context for your event.",
            icon: FileText,
            set: description !== "",
            onClear: () => onDescriptionChange(""),
            render: (focus) => (
              <Field>
                <Textarea
                  id={`${idPrefix}-description`}
                  value={description}
                  onChange={(e) => onDescriptionChange(e.target.value)}
                  rows={3}
                  className="resize-y"
                  autoFocus={focus}
                  placeholder="A short welcome for your attendees"
                />
                <FieldDescription>
                  Pasted links become clickable; Markdown works too.
                </FieldDescription>
              </Field>
            ),
          },
          {
            key: "instructions",
            id: `${idPrefix}-instructions`,
            title: "Redemption instructions",
            addLabel: "Set redemption instructions",
            description: "Help attendees redeem their codes.",
            icon: ListChecks,
            set: instructions !== "",
            onClear: () => onInstructionsChange(""),
            summary: instructionsSummary(instructions),
            render: () => (
              <ClaimInstructionsField
                id={`${idPrefix}-instructions`}
                value={instructions}
                onChange={onInstructionsChange}
                description={instructionsDescription}
              />
            ),
          },
          {
            key: "signInMessage",
            id: `${idPrefix}-signin-message`,
            title: "Sign-in message",
            addLabel: "Set custom sign-in message",
            description: "A note to show before attendees sign in.",
            icon: MessageSquareText,
            set: signInMessage !== "",
            onClear: () => onSignInMessageChange(""),
            clearLabel: "Use default",
            render: (focus) => (
              <SignInMessageField
                id={`${idPrefix}-signin-message`}
                value={signInMessage}
                onChange={onSignInMessageChange}
                identity={identity}
                autoFocus={focus}
              />
            ),
          },
          {
            key: "contactEmail",
            id: `${idPrefix}-contact-email`,
            title: "Contact / support email",
            addLabel: "Set contact / support email",
            description: "Where attendees can reach you for help.",
            icon: Mail,
            set: contactEmail !== "",
            onClear: () => onContactEmailChange(""),
            render: (focus) => (
              <ContactEmailField
                id={`${idPrefix}-contact-email`}
                value={contactEmail}
                onChange={onContactEmailChange}
                autoFocus={focus}
              />
            ),
          },
        ]}
      />
    </section>
  );
}

"use client";

import { useId } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import type { GenerationInput } from "@/convex/stripeValidation";
import { usd, type StripeForm } from "@/lib/stripe-form";
import {
  STRIPE_BATCH_NAME_MAX_LENGTH,
  STRIPE_CODE_PREFIX_MAX_LENGTH,
  STRIPE_CODE_PREFIX_ERROR,
  normalizeStripeCodePrefix,
  truncateStripeBatchName,
} from "@/lib/stripe-name";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function StripeModeBadge({ live }: { live: boolean }) {
  return (
    <Badge variant={live ? "destructive" : "secondary"}>
      {live ? "Stripe live mode" : "Stripe test mode"}
    </Badge>
  );
}

export function StripeSetupNotice() {
  return (
    <Alert>
      <ShieldCheck />
      <AlertTitle>Stripe setup required</AlertTitle>
      <AlertDescription>
        Set STRIPE_API_KEY in the Convex deployment environment. Use a
        restricted key with write access to Coupons and Promotion Codes. Never
        use a NEXT_PUBLIC_ variable.
      </AlertDescription>
    </Alert>
  );
}

export function StripeGenerationFields({
  value,
  onChange,
  namePlaceholder,
}: {
  value: StripeForm;
  onChange: (value: StripeForm) => void;
  namePlaceholder?: string;
}) {
  const id = useId();
  const set = (field: keyof StripeForm, next: string) =>
    onChange({ ...value, [field]: next });
  const prefix = normalizeStripeCodePrefix(value.prefix);
  return (
    <FieldGroup>
      <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
        <Field>
          <FieldLabel htmlFor={`${id}-name`}>Batch name</FieldLabel>
          <Input
            id={`${id}-name`}
            value={value.name}
            onChange={(e) => set("name", truncateStripeBatchName(e.target.value))}
            required={!namePlaceholder}
            maxLength={STRIPE_BATCH_NAME_MAX_LENGTH}
            placeholder={truncateStripeBatchName(
              namePlaceholder || "Conference credits",
            )}
          />
          <FieldDescription>
            Also used as the code block name when added to an event.
          </FieldDescription>
        </Field>
        <Field data-invalid={prefix === null || undefined}>
          <FieldLabel htmlFor={`${id}-prefix`}>Code prefix</FieldLabel>
          <Input
            id={`${id}-prefix`}
            maxLength={STRIPE_CODE_PREFIX_MAX_LENGTH}
            pattern={`[A-Za-z]{0,${STRIPE_CODE_PREFIX_MAX_LENGTH}}`}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            value={value.prefix}
            onChange={(e) => set("prefix", e.target.value)}
            placeholder="Auto-generated"
            aria-invalid={prefix === null}
            aria-describedby={prefix === null ? `${id}-prefix-error` : `${id}-prefix-description`}
          />
          <FieldDescription id={`${id}-prefix-description`}>
            Optional. Up to {STRIPE_CODE_PREFIX_MAX_LENGTH} letters (A–Z).{" "}
            {prefix
              ? `${prefix}-XXXXXXXXXX`
              : `Leave blank to generate a ${STRIPE_CODE_PREFIX_MAX_LENGTH}-letter prefix.`}
          </FieldDescription>
          {prefix === null && (
            <FieldError id={`${id}-prefix-error`}>{STRIPE_CODE_PREFIX_ERROR}</FieldError>
          )}
        </Field>
      </FieldGroup>
      <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${id}-amount`}>Value per code (USD)</FieldLabel>
          <Input
            id={`${id}-amount`}
            type="number"
            min="0.01"
            max="999999.99"
            step="0.01"
            required
            value={value.amount}
            onChange={(e) => set("amount", e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-quantity`}>Number of codes</FieldLabel>
          <Input
            id={`${id}-quantity`}
            type="number"
            min="1"
            max="500"
            step="1"
            required
            value={value.quantity}
            onChange={(e) => set("quantity", e.target.value)}
          />
          <FieldDescription>1–500 codes per batch.</FieldDescription>
        </Field>
      </FieldGroup>
      <Field>
        <FieldLabel htmlFor={`${id}-expiration`}>Expiration date</FieldLabel>
        <Input
          id={`${id}-expiration`}
          type="date"
          value={value.expiration}
          onChange={(e) => set("expiration", e.target.value)}
        />
        <FieldDescription>
          Optional. End of day in your local time.
        </FieldDescription>
      </Field>
      <p className="text-sm text-muted-foreground">
        Each code can be redeemed once and discounts one invoice. Codes are
        saved automatically.
      </p>
    </FieldGroup>
  );
}

export function ConfirmStripeGeneration({
  input,
  busy,
  error,
  onCancel,
  onConfirm,
  eventName,
}: {
  input: GenerationInput | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  eventName?: string;
}) {
  return (
    <AlertDialog
      open={input !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {input?.expectedLive
              ? "Create live Stripe codes?"
              : "Review your code batch"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {eventName
              ? `Create “${eventName}” and generate its codes in the background.`
              : "The batch will be saved in Code studio. You can leave the page while it runs."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {input && (
          <>
            <StripeModeBadge live={input.expectedLive} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Batch</dt>
              <dd className="break-words">{input.name}</dd>
              <dt className="text-muted-foreground">Code prefix</dt>
              <dd>{input.codePrefix || `Automatic (${STRIPE_CODE_PREFIX_MAX_LENGTH} letters)`}</dd>
              <dt className="text-muted-foreground">Codes</dt>
              <dd>
                {input.quantity} × {usd(input.amountCents)}
              </dd>
              <dt className="text-muted-foreground">Maximum total discount</dt>
              <dd className="font-medium">
                {usd(input.quantity * input.amountCents)}
              </dd>
              <dt className="text-muted-foreground">Expires</dt>
              <dd>
                {input.expiresAt
                  ? new Date(input.expiresAt).toLocaleString()
                  : "No expiration"}
              </dd>
            </dl>
            {input.expectedLive && (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertTitle>These codes have real value</AlertTitle>
                <AlertDescription>
                  They will be active in your live Stripe account. Removing them
                  from this app does not revoke them in Stripe.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Go back</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={onConfirm}>
            {busy && <Spinner data-icon="inline-start" />}
            {busy
              ? "Starting…"
              : input?.expectedLive
                ? "Confirm live generation"
                : "Generate test codes"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

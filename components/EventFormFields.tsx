"use client";

import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  AtSign,
  Building2,
  CalendarDays,
  Link2,
  Lock,
  Mail,
  Plus,
  Users,
  X,
} from "lucide-react";
import { APP_URL } from "@/lib/app-name";
import {
  isPublicEmailDomain,
  parseAllowedDomains,
} from "@/lib/allowed-domains";
import {
  ATTENDEE_IDENTITIES,
  type AttendeeIdentity,
} from "@/lib/attendee-identity";
import { formatEventDate } from "@/lib/event-date";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OptionalSettings } from "@/components/OptionalSettings";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const APP_HOST = new URL(APP_URL).host;

function parseDate(value: string): Date | undefined {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function toDateValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  disablePast = false,
  after,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disablePast?: boolean;
  // YYYY-MM-DD; only later days can be picked.
  after?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDate(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const afterDate = after ? parseDate(after) : undefined;
  const firstAllowed = afterDate
    ? new Date(afterDate.getFullYear(), afterDate.getMonth(), afterDate.getDate() + 1)
    : undefined;
  const minDate =
    firstAllowed && (!disablePast || firstAllowed > today)
      ? firstAllowed
      : disablePast
        ? today
        : undefined;

  return (
    <div className={cn("relative flex w-full", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              className={cn(
                "w-full justify-start font-sans font-normal",
                value && "pr-8",
                !selected && "text-muted-foreground"
              )}
            />
          }
        >
          <CalendarDays data-icon="inline-start" />
          {selected ? formatEventDate(value) : placeholder}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? minDate}
            captionLayout="dropdown"
            startMonth={new Date(
              Math.min(
                today.getFullYear() - (disablePast ? 0 : 10),
                selected?.getFullYear() ?? Infinity
              ),
              0
            )}
            endMonth={new Date(
              Math.max(today.getFullYear() + 25, selected?.getFullYear() ?? -Infinity),
              11
            )}
            disabled={minDate ? { before: minDate } : undefined}
            onSelect={(date) => {
              onChange(date ? toDateValue(date) : "");
              setOpen(false);
            }}
          />
          <div className="flex items-center justify-between gap-2 border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={minDate !== undefined && minDate > today}
              onClick={() => {
                onChange(toDateValue(today));
                setOpen(false);
              }}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!value}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Clear date"
          className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
          onClick={() => onChange("")}
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}

// Event date with an optional end date for multi-day events. Values are
// YYYY-MM-DD strings; "" means unset.
export function EventDatesField({
  id,
  startDate,
  endDate,
  onChange,
  placeholder,
  description,
  className,
}: {
  id: string;
  startDate: string;
  endDate: string;
  onChange: (dates: { startDate: string; endDate: string }) => void;
  placeholder?: string;
  description?: ReactNode;
  className?: string;
}) {
  const [addingEnd, setAddingEnd] = useState(false);
  const multiDay = Boolean(startDate) && (addingEnd || Boolean(endDate));

  return (
    <Field className={className}>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <FieldLabel htmlFor={id}>
          {multiDay ? "Event dates" : "Event date"}
        </FieldLabel>
        {startDate ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
            onClick={() => {
              if (multiDay) {
                setAddingEnd(false);
                onChange({ startDate, endDate: "" });
              } else {
                setAddingEnd(true);
              }
            }}
          >
            {multiDay ? "Single day" : (
              <>
                <Plus data-icon="inline-start" />
                End date
              </>
            )}
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <DatePicker
          id={id}
          value={startDate}
          onChange={(next) => {
            if (!next) setAddingEnd(false);
            onChange({
              startDate: next,
              endDate: next && endDate > next ? endDate : "",
            });
          }}
          placeholder={multiDay ? "Start date" : placeholder}
          disablePast
        />
        {multiDay ? (
          <DatePicker
            id={`${id}-end`}
            value={endDate}
            onChange={(next) => onChange({ startDate, endDate: next })}
            placeholder="End date"
            after={startDate}
          />
        ) : null}
      </div>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

export function SlugInput({
  id,
  value,
  onChange,
  placeholder,
  required,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <InputGroup>
      <InputGroupAddon>
        <InputGroupText>{APP_HOST}/</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        id={id}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-0.5 font-mono"
      />
    </InputGroup>
  );
}

const IDENTITY_ICONS: Record<AttendeeIdentity, typeof Mail> = {
  email: Mail,
  x: AtSign,
};

export function IdentityPicker({
  id,
  value,
  onChange,
  description,
}: {
  id: string;
  value: AttendeeIdentity;
  onChange: (value: AttendeeIdentity) => void;
  description: string;
}) {
  return (
    <Field>
      <FieldLabel id={`${id}-label`}>Identify attendees by</FieldLabel>
      <ToggleGroup
        id={id}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        className="grid w-full grid-cols-2 sm:w-96"
        value={[value]}
        onValueChange={(next) => {
          if (next[0] === "email" || next[0] === "x") onChange(next[0]);
        }}
      >
        {ATTENDEE_IDENTITIES.map((option) => {
          const Icon = IDENTITY_ICONS[option.value];
          return (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              variant="outline"
              className="gap-2 aria-pressed:border-primary/40 aria-pressed:bg-primary/5 dark:aria-pressed:bg-primary/10"
            >
              <Icon />
              {option.label}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
      <FieldDescription id={`${id}-description`}>{description}</FieldDescription>
    </Field>
  );
}

// With two code blocks: whether each attendee gets a code from both, or
// picks one.
export function ClaimModeToggle({
  id,
  value,
  onChange,
  disabled,
  className,
}: {
  id: string;
  value: "one" | "all";
  onChange: (value: "one" | "all") => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Field className={className}>
      <FieldLabel id={`${id}-label`}>Each attendee gets</FieldLabel>
      <ToggleGroup
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        value={[value]}
        disabled={disabled}
        onValueChange={(next) => {
          if (next[0] === "one" || next[0] === "all") onChange(next[0]);
        }}
      >
        <ToggleGroupItem value="all" variant="outline">
          Both codes
        </ToggleGroupItem>
        <ToggleGroupItem value="one" variant="outline">
          Their choice of one
        </ToggleGroupItem>
      </ToggleGroup>
      <FieldDescription id={`${id}-description`}>
        {value === "all"
          ? "One claim dispenses a code from each block. If one block runs out, attendees still get the other and can come back for the rest."
          : "Attendees pick one of the two blocks on the claim page and get a single code."}
      </FieldDescription>
    </Field>
  );
}

export function WalkUpReviewToggle({
  id,
  checked,
  onChange,
  className,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  return (
    <FieldLabel htmlFor={id} className={cn("cursor-pointer", className)}>
      <Field orientation="horizontal">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(next) => onChange(next === true)}
        />
        <FieldContent>
          <FieldTitle>Walk-up adds skip organizer approval</FieldTitle>
          {checked ? (
            <FieldDescription>
              Attendees added on the walk-up page who signed up for a previous
              event become eligible right away instead of waiting under
              Flagged for review. Uploaded lists are still reviewed.
            </FieldDescription>
          ) : null}
        </FieldContent>
      </Field>
    </FieldLabel>
  );
}

export type ClaimAccessMode = "list" | "domain" | "dynamic";

export function ClaimAccessPicker({
  id,
  value,
  onChange,
  identity,
  className,
}: {
  id: string;
  value: ClaimAccessMode;
  onChange: (value: ClaimAccessMode) => void;
  identity: AttendeeIdentity;
  className?: string;
}) {
  const byHandle = identity === "x";
  return (
    <Field className={className}>
      <FieldLabel id={`${id}-label`}>Who can claim</FieldLabel>
      <ToggleGroup
        id={id}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        className={cn(
          "grid w-full grid-cols-1",
          byHandle ? "sm:grid-cols-2 sm:w-96" : "sm:grid-cols-3"
        )}
        value={[value]}
        onValueChange={(next) => {
          const picked = next[0];
          if (
            picked === "list" ||
            picked === "dynamic" ||
            (picked === "domain" && !byHandle)
          ) {
            onChange(picked);
          }
        }}
      >
        <ToggleGroupItem
          value="list"
          variant="outline"
          className="gap-2 aria-pressed:border-primary/40 aria-pressed:bg-primary/5 dark:aria-pressed:bg-primary/10"
        >
          <Users />
          Participant list
        </ToggleGroupItem>
        {!byHandle ? (
          <ToggleGroupItem
            value="domain"
            variant="outline"
            className="gap-2 aria-pressed:border-primary/40 aria-pressed:bg-primary/5 dark:aria-pressed:bg-primary/10"
          >
            <Building2 />
            Company domain
          </ToggleGroupItem>
        ) : null}
        <ToggleGroupItem
          value="dynamic"
          variant="outline"
          className="gap-2 aria-pressed:border-primary/40 aria-pressed:bg-primary/5 dark:aria-pressed:bg-primary/10"
        >
          <Link2 />
          Anyone (dynamic)
        </ToggleGroupItem>
      </ToggleGroup>
      <FieldDescription id={`${id}-description`}>
        {value === "domain"
          ? "No participant list needed. Any employee who signs in with a verified work email on an allowed domain gets one code."
          : value === "dynamic"
            ? `No participant list needed. Anyone who signs in from the claim URL or QR code gets one code per ${byHandle ? "X account" : "email address"}.`
            : byHandle
              ? "Only the X handles you add to this event can claim."
              : "Only the email addresses you add to this event can claim."}
      </FieldDescription>
    </Field>
  );
}

export function AdminNoteField({
  id,
  value,
  onChange,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <section
      className={cn("flex flex-col gap-3", className)}
      aria-labelledby={`${id}-heading`}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h3 id={`${id}-heading`} className="text-sm font-medium">
            Internal notes
          </h3>
          <Badge variant="outline">Admins only</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Private to admins in the admin panel — never shown to attendees.
        </p>
      </div>
      <OptionalSettings
        className="sm:grid-cols-1"
        settings={[
          {
            key: "adminNote",
            id,
            title: "Admin note",
            addLabel: "Add admin note",
            description:
              "Why and how this event was created (e.g. partner request, Slack thread, code source).",
            icon: Lock,
            set: value !== "",
            onClear: () => onChange(""),
            render: (focus) => (
              <Field>
                <Textarea
                  id={id}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  rows={3}
                  className="resize-y"
                  autoFocus={focus}
                  placeholder="Why and how this event was created (e.g. partner request, Slack thread, code source)..."
                />
                <FieldDescription>
                  Private to admins in the admin panel — never shown to
                  attendees. Pasted links become clickable; Markdown works too.
                </FieldDescription>
              </Field>
            ),
          },
        ]}
      />
    </section>
  );
}

export function AllowedDomainsField({
  id,
  value,
  onChange,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const { domains, invalid } = parseAllowedDomains(value);
  const publicDomains = domains.filter(isPublicEmailDomain);
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>Allowed email domains</FieldLabel>
      <Input
        id={id}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="acme.com, acme.io"
        aria-invalid={invalid.length > 0 || undefined}
        aria-describedby={`${id}-description`}
      />
      <FieldDescription id={`${id}-description`}>
        Enter one or more company domains separated by commas (for example,{" "}
        <span className="font-mono">acme.com</span>). Only verified emails on
        these domains can claim.
      </FieldDescription>
      {domains.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-1" aria-label="Parsed allowed domains">
          {domains.map((domain) => (
            <Badge key={domain} variant="secondary" className="font-mono text-xs">
              @{domain}
            </Badge>
          ))}
        </div>
      ) : null}
      {invalid.length > 0 ? (
        <FieldError>
          {invalid.some((token) => token.includes("@") && !token.startsWith("@"))
            ? `Enter a domain like acme.com, not a full email address: ${invalid.join(", ")}`
            : `Not a valid domain: ${invalid.join(", ")}`}
        </FieldError>
      ) : null}
      {publicDomains.length > 0 ? (
        <Alert className="border-amber-500/40">
          <AlertTriangle className="text-amber-500" aria-hidden />
          <AlertDescription>
            {publicDomains.map((d) => `@${d}`).join(", ")}{" "}
            {publicDomains.length === 1 ? "is a public email provider" : "are public email providers"}{" "}
            — anyone with an address there will be able to claim a code.
          </AlertDescription>
        </Alert>
      ) : null}
    </Field>
  );
}

export function DynamicToggle({
  id,
  checked,
  onChange,
  identity,
  className,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  identity: AttendeeIdentity;
  className?: string;
}) {
  return (
    <FieldLabel htmlFor={id} className={cn("cursor-pointer", className)}>
      <Field orientation="horizontal">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(next) => onChange(next === true)}
        />
        <FieldContent>
          <FieldTitle>Dynamic: anyone can claim</FieldTitle>
          {checked ? (
            <FieldDescription>
              No participant list needed. Anyone who signs in from the claim
              URL or QR code gets one code per{" "}
              {identity === "x" ? "X account" : "email address"}.
            </FieldDescription>
          ) : null}
        </FieldContent>
      </Field>
    </FieldLabel>
  );
}

"use client";

import { useState } from "react";
import { AtSign, CalendarDays, Mail, X } from "lucide-react";
import { APP_URL } from "@/lib/app-name";
import {
  ATTENDEE_IDENTITIES,
  type AttendeeIdentity,
} from "@/lib/attendee-identity";
import { formatEventDate } from "@/lib/event-date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
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
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disablePast?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDate(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
            defaultMonth={selected}
            captionLayout="dropdown"
            startMonth={new Date(
              Math.min(today.getFullYear() - 10, selected?.getFullYear() ?? Infinity),
              0
            )}
            endMonth={new Date(
              Math.max(today.getFullYear() + 25, selected?.getFullYear() ?? -Infinity),
              11
            )}
            disabled={disablePast ? { before: today } : undefined}
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
          <FieldDescription>
            No participant list needed. Anyone who signs in from the claim URL
            or QR code gets a code, and their{" "}
            {identity === "x" ? "X handle" : "email"} is recorded so each{" "}
            {identity === "x" ? "account" : "address"} can only claim once.
          </FieldDescription>
        </FieldContent>
      </Field>
    </FieldLabel>
  );
}

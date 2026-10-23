"use client";

import { useState, type ReactNode } from "react";
import { Plus, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";

export type OptionalSetting = {
  key: string;
  // id of the setting's main control, for the panel label.
  id: string;
  title: string;
  // Button text while the setting is collapsed, e.g. "Set contact email".
  addLabel: string;
  icon: LucideIcon;
  // A setting with a value stays expanded until it is cleared.
  set: boolean;
  onClear: () => void;
  clearLabel?: string;
  // Short state shown next to the title, e.g. the chosen preset.
  summary?: ReactNode;
  // `focus` is true when the admin just expanded the setting.
  render: (focus: boolean) => ReactNode;
};

// Optional form settings stay out of the way until needed: each shows as a
// small "+ Add …" button, and expands into a panel once clicked or when it
// already has a value.
export function OptionalSettings({
  settings,
  className,
}: {
  settings: OptionalSetting[];
  className?: string;
}) {
  const [opened, setOpened] = useState<string[]>(() =>
    settings.filter((s) => s.set).map((s) => s.key),
  );
  const [focused, setFocused] = useState<string[]>([]);
  // A setting that gains a value elsewhere joins the open set, and stays open
  // while the admin edits it down to empty; only its Remove button closes it.
  const newlySet = settings.filter((s) => s.set && !opened.includes(s.key));
  if (newlySet.length > 0) {
    setOpened([...opened, ...newlySet.map((s) => s.key)]);
  }
  const expanded = settings.filter((s) => s.set || opened.includes(s.key));
  const collapsed = settings.filter((s) => !expanded.includes(s));

  function close(key: string) {
    setOpened((prev) => prev.filter((k) => k !== key));
    setFocused((prev) => prev.filter((k) => k !== key));
  }
  function open(key: string) {
    setOpened((prev) => [...prev, key]);
    setFocused((prev) => [...prev, key]);
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {expanded.map((s) => (
        <Field key={s.key} className="rounded-lg border p-4">
          <div className="flex min-h-6 items-center justify-between gap-3">
            <FieldLabel htmlFor={s.id} className="min-w-0">
              <span className="truncate">{s.title}</span>
              {s.summary !== undefined ? (
                <span className="truncate font-normal text-muted-foreground">
                  · {s.summary}
                </span>
              ) : null}
            </FieldLabel>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              onClick={() => {
                s.onClear();
                close(s.key);
              }}
            >
              <X data-icon="inline-start" />
              {s.clearLabel ?? "Remove"}
            </Button>
          </div>
          {s.render(focused.includes(s.key))}
        </Field>
      ))}
      {collapsed.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {collapsed.map((s) => {
            const Icon = s.icon;
            return (
              <Button
                key={s.key}
                type="button"
                variant="outline"
                size="sm"
                className="text-muted-foreground"
                onClick={() => open(s.key)}
              >
                <Plus data-icon="inline-start" />
                <Icon data-icon="inline-start" />
                {s.addLabel}
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

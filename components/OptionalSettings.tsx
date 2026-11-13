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
  description: string;
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

// Settings expand in place, keeping their order as values are added or cleared.
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

  function close(key: string) {
    setOpened((prev) => prev.filter((k) => k !== key));
    setFocused((prev) => prev.filter((k) => k !== key));
  }
  function open(key: string) {
    setOpened((prev) => [...prev, key]);
    setFocused((prev) => [...prev, key]);
  }

  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", className)}>
      {settings.map((s) => {
        const Icon = s.icon;
        const expanded = s.set || opened.includes(s.key);
        const panelId = `${s.id}-panel`;
        return (
          <div key={s.key} className={cn("min-w-0", expanded && "sm:col-span-2")}>
            {expanded ? (
              <Field className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <FieldLabel htmlFor={s.id} className="min-w-0 flex-wrap">
                      {s.title}
                      {s.summary !== undefined ? (
                        <span className="font-normal text-muted-foreground">
                          · {s.summary}
                        </span>
                      ) : null}
                    </FieldLabel>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    aria-label={`${s.clearLabel ?? "Remove"} ${s.title.toLowerCase()}`}
                    onClick={() => {
                      s.onClear();
                      close(s.key);
                    }}
                  >
                    <X data-icon="inline-start" />
                    {s.clearLabel ?? "Remove"}
                  </Button>
                </div>
                <div id={panelId} className="pt-2">
                  {s.render(focused.includes(s.key))}
                </div>
              </Field>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="h-auto w-full min-w-0 justify-start gap-3 rounded-xl p-4 text-left whitespace-normal"
                aria-label={s.addLabel}
                aria-expanded={false}
                aria-controls={panelId}
                onClick={() => open(s.key)}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span>{s.title}</span>
                  <span className="font-sans text-xs font-normal text-muted-foreground">
                    {s.description}
                  </span>
                </span>
                <Plus
                  data-icon="inline-end"
                  className="text-muted-foreground"
                  aria-hidden
                />
              </Button>
            )}
            {!expanded ? <div id={panelId} hidden /> : null}
          </div>
        );
      })}
    </div>
  );
}

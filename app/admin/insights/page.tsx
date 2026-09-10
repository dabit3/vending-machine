"use client";

import { useState } from "react";
import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { BarChart3, CalendarDays } from "lucide-react";
import { api } from "@/convex/_generated/api";
import SystemAdminGate from "@/components/SystemAdminGate";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGES = [
  { label: "Last 90 days", days: 90 },
  { label: "Last 180 days", days: 180 },
  { label: "Last 12 months", days: 365 },
];

type Insights = FunctionReturnType<typeof api.events.history>;

export default function InsightsPage() {
  const { isAuthenticated } = useConvexAuth();
  const [days, setDays] = useState(90);
  const history = useQuery(
    api.events.history,
    isAuthenticated ? { days } : "skip",
  );

  return (
    <SystemAdminGate>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-heading text-3xl font-semibold tracking-[-0.02em]">
              Event history
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Claim activity and event performance across your recent events.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Range
            <NativeSelect
              value={String(days)}
              onChange={(event) => setDays(Number(event.target.value))}
              className="w-40"
            >
              {RANGES.map((option) => (
                <NativeSelectOption key={option.days} value={String(option.days)}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        </div>

        {history === undefined ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard
                label="Claims in range"
                value={history.daily.reduce((sum, day) => sum + day.count, 0)}
                hint="Dispensed codes"
              />
              <StatCard
                label="Active events"
                value={
                  history.events.filter(
                    (event) =>
                      event.claimed > 0 ||
                      event.anchor >= history.since ||
                      event.requests > 0,
                  ).length
                }
                hint="With activity in view"
              />
              <StatCard
                label="Attendees"
                value={history.totals.attendees}
                hint="Unique claimants, all time"
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-muted-foreground" />
                  Claim calendar
                </CardTitle>
                <CardDescription>
                  Daily dispensed-code volume. Darker days saw more claims.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ClaimCalendar history={history} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="size-4 text-muted-foreground" />
                  Event performance
                </CardTitle>
                <CardDescription>
                  Each point is an event. Higher means more of its codes were
                  claimed; larger points had more attendees.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EventScatter history={history} />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </SystemAdminGate>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-mono text-3xl tabular-nums">
          {value.toLocaleString("en-US")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-dim">{hint}</p>
      </CardContent>
    </Card>
  );
}

function ClaimCalendar({ history }: { history: Insights }) {
  const counts = new Map(history.daily.map((day) => [day.date, day.count]));
  const max = Math.max(1, ...history.daily.map((day) => day.count));
  const totalDays = Math.max(
    1,
    Math.ceil((history.until - history.since) / DAY_MS),
  );
  const days = Array.from({ length: totalDays }, (_, index) => {
    const day = new Date(history.since + index * DAY_MS);
    const iso = day.toISOString().slice(0, 10);
    const count = counts.get(iso) ?? 0;
    const level =
      count === 0 ? 0 : Math.max(1, Math.ceil((count / max) * 4));
    return { iso, count, level, label: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
  });
  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-max gap-1"
        style={{
          gridTemplateRows: "repeat(7, minmax(0, 1fr))",
          gridAutoFlow: "column",
        }}
      >
        {days.map((day) => (
          <div
            key={day.iso}
            title={`${day.label} — ${day.count} claim${day.count === 1 ? "" : "s"}`}
            className={cn(
              "size-3 rounded-[3px] border border-border/60",
              day.level === 0 && "bg-muted/50",
              day.level === 1 && "bg-foreground/15",
              day.level === 2 && "bg-foreground/35",
              day.level === 3 && "bg-foreground/65",
              day.level === 4 && "bg-foreground",
            )}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[0.7rem] text-muted-dim">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className={cn(
              "size-3 rounded-[3px] border border-border/60",
              level === 0 && "bg-muted/50",
              level === 1 && "bg-foreground/15",
              level === 2 && "bg-foreground/35",
              level === 3 && "bg-foreground/65",
              level === 4 && "bg-foreground",
            )}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

function EventScatter({ history }: { history: Insights }) {
  const points = history.events.filter((event) => event.codes > 0);
  if (points.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No claimable events yet.
      </p>
    );
  }
  const width = 720;
  const height = 280;
  const pad = { left: 34, right: 16, top: 12, bottom: 28 };
  const minX = Math.min(...points.map((point) => point.anchor));
  const maxX = Math.max(...points.map((point) => point.anchor));
  const span = Math.max(1, maxX - minX);
  const maxAttendees = Math.max(1, ...points.map((point) => point.attendees));
  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-[720px]"
        role="img"
        aria-label="Event performance scatterplot"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = pad.top + (1 - tick) * (height - pad.top - pad.bottom);
          return (
            <g key={tick}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                className="stroke-border"
                strokeDasharray="3 5"
              />
              <text
                x={pad.left - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-muted-dim text-[0.65rem]"
              >
                {Math.round(tick * 100)}%
              </text>
            </g>
          );
        })}
        <text
          x={pad.left}
          y={height - 8}
          className="fill-muted-dim text-[0.65rem]"
        >
          {new Date(minX).toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
          })}
        </text>
        <text
          x={width - pad.right}
          y={height - 8}
          textAnchor="end"
          className="fill-muted-dim text-[0.65rem]"
        >
          {new Date(maxX).toLocaleDateString("en-US", {
            month: "short",
            year: "numeric",
          })}
        </text>
        {points.map((point) => {
          const x =
            pad.left +
            ((point.anchor - minX) / span) * (width - pad.left - pad.right);
          const y =
            pad.top + (1 - point.claimRate) * (height - pad.top - pad.bottom);
          const radius = 4 + (point.attendees / maxAttendees) * 12;
          return (
            <g key={point.eventId}>
              <circle
                cx={x}
                cy={y}
                r={radius}
                className="fill-foreground/15 stroke-foreground/50"
              >
                <title>{`${point.name} — ${point.claimed}/${point.codes} codes claimed`}</title>
              </circle>
              <circle cx={x} cy={y} r={2.5} className="fill-foreground" />
            </g>
          );
        })}
      </svg>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {points
          .slice(-6)
          .reverse()
          .map((point) => (
            <div
              key={point.eventId}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                {point.slug ? (
                  <Link
                    href={`/admin/events/${point.eventId}`}
                    className="truncate font-medium hover:underline"
                  >
                    {point.name}
                  </Link>
                ) : (
                  <span className="truncate font-medium">{point.name}</span>
                )}
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">
                    {Math.round(point.claimRate * 100)}% claimed
                  </Badge>
                  {point.requests > 0 ? (
                    <Badge variant="outline">
                      {point.approved}/{point.requests} requests approved
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className="shrink-0 text-right font-mono text-xs text-muted-dim tabular-nums">
                {point.claimed}/{point.codes}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

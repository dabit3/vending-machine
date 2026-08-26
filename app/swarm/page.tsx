"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Agent {
  _id: string;
  sessionId: string;
  name: string;
  level: number;
  parentSessionId?: string;
  role: string;
  status: string;
  task?: string;
  detail?: string;
  eventsStocked?: number;
  pagesQAd?: number;
  updatedAt: number;
}

const STATUS_STYLES: Record<string, string> = {
  spawning: "bg-amber-500 animate-pulse",
  working: "bg-blue-500 animate-pulse",
  done: "bg-emerald-500",
  failed: "bg-red-500",
};

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        STATUS_STYLES[status] ?? "bg-muted-foreground",
      )}
      aria-label={status}
    />
  );
}

function AgentRow({ agent, depth }: { agent: Agent; depth: number }) {
  return (
    <li
      className="flex items-center gap-3 border-b border-border px-2 py-3 text-sm"
      style={{ paddingLeft: `${depth * 24 + 8}px` }}
    >
      <StatusDot status={agent.status} />
      <span className="font-medium">{agent.name}</span>
      <Badge variant="secondary">L{agent.level}</Badge>
      <span className="text-muted-foreground">{agent.role}</span>
      {agent.task ? (
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">
          {agent.task}
        </span>
      ) : null}
      <span className="ml-auto flex shrink-0 items-center gap-3 font-mono text-xs text-muted-dim tabular-nums">
        {agent.eventsStocked ? <span>{agent.eventsStocked} stocked</span> : null}
        {agent.pagesQAd ? <span>{agent.pagesQAd} QA&apos;d</span> : null}
        <span>{agent.status}</span>
      </span>
    </li>
  );
}

function Tree({
  agents,
  parent,
  depth,
}: {
  agents: Agent[];
  parent: string | undefined;
  depth: number;
}) {
  const children = agents.filter((a) => (a.parentSessionId ?? "") === (parent ?? ""));
  if (children.length === 0) return null;
  return (
    <>
      {children.map((agent) => (
        <div key={agent._id}>
          <ul>
            <AgentRow agent={agent} depth={depth} />
          </ul>
          <Tree agents={agents} parent={agent.sessionId} depth={depth + 1} />
        </div>
      ))}
    </>
  );
}

export default function SwarmPage() {
  const board = useQuery(api.swarm.board);
  const agents = (board?.agents ?? []) as Agent[];

  const knownIds = new Set(agents.map((a) => a.sessionId));
  const roots = agents.filter(
    (a) => !a.parentSessionId || !knownIds.has(a.parentSessionId),
  );
  const nonRoots = new Set(roots.map((r) => r.sessionId));
  const counts = {
    total: agents.length,
    done: agents.filter((a) => a.status === "done").length,
    working: agents.filter(
      (a) => a.status === "working" || a.status === "spawning",
    ).length,
    failed: agents.filter((a) => a.status === "failed").length,
    stocked: agents.reduce((n, a) => n + (a.eventsStocked ?? 0), 0),
    qad: agents.reduce((n, a) => n + (a.pagesQAd ?? 0), 0),
  };
  const levels = new Map<number, number>();
  for (const a of agents) levels.set(a.level, (levels.get(a.level) ?? 0) + 1);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6">
          <p className="eyebrow text-muted-foreground">Live swarm dashboard</p>
          <h1 className="mt-4 font-heading text-4xl font-semibold tracking-tight">
            Swarm
          </h1>

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-6">
            {(
              [
                ["Agents", counts.total],
                ["Active", counts.working],
                ["Done", counts.done],
                ["Failed", counts.failed],
                ["Events stocked", counts.stocked],
                ["Pages QA'd", counts.qad],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="border border-border p-4">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="mt-1 font-mono text-2xl tabular-nums">
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {[...levels.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([level, count]) => (
                <Badge key={level} variant="secondary">
                  Level {level}: {count}
                </Badge>
              ))}
          </div>

          <h2 className="mt-12 text-sm font-medium text-muted-foreground">
            Agent tree
          </h2>
          {board === undefined ? (
            <div className="mt-4 border-t border-border">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="border-b border-border px-2 py-3">
                  <Skeleton className="h-4 w-2/3 rounded-sm" />
                </div>
              ))}
            </div>
          ) : agents.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No swarm agents have reported yet.
            </p>
          ) : (
            <div className="mt-4 border-t border-border">
              {roots.map((root) => (
                <div key={root._id}>
                  <ul>
                    <AgentRow agent={root} depth={0} />
                  </ul>
                  {nonRoots.has(root.sessionId) ? (
                    <Tree
                      agents={agents}
                      parent={root.sessionId}
                      depth={1}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          )}

          <h2 className="mt-12 text-sm font-medium text-muted-foreground">
            Stocked events
          </h2>
          {board === undefined ? null : board.events.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No events stocked yet.
            </p>
          ) : (
            <ul className="mt-4 border-t border-border">
              {board.events.map((event) => (
                <li
                  key={event._id}
                  className="flex items-center gap-4 border-b border-border px-2 py-3 text-sm"
                >
                  <a href={`/${event.slug}`} className="font-medium underline-offset-4 hover:underline">
                    {event.name}
                  </a>
                  <span className="font-mono text-xs text-muted-dim">
                    /{event.slug}
                  </span>
                  <span className="ml-auto font-mono text-xs text-muted-dim tabular-nums">
                    {event.codeCount} codes
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

// Claim windows are stored as epoch ms and entered via <input type="datetime-local">,
// which works in the admin's local timezone.
export function timestampToLocalInput(ts?: number): string {
  if (ts === undefined) return "";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localInputToTimestamp(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const ms = new Date(trimmed).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

export type ClaimWindowStatus = "before" | "open" | "closed";

export function claimWindowStatus(
  now: number,
  claimStart?: number,
  claimEnd?: number
): ClaimWindowStatus {
  if (claimStart !== undefined && now < claimStart) return "before";
  if (claimEnd !== undefined && now > claimEnd) return "closed";
  return "open";
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  return `${minutes}m ${pad(seconds)}s`;
}

export function formatClaimTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

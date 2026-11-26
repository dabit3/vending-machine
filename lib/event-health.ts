export type StockStatus = "ok" | "low" | "empty" | "none";

export interface EventHealthStats {
  totalCodes: number;
  claimedCodes: number;
  remainingCodes: number;
  pendingRequests: number;
  flaggedCount: number;
  stripeClaimedCodes: number;
  stripeRedeemedCodes: number;
  stripeSyncedCodes: number;
  stripeRedemptionSyncedAt?: number;
}

// Remaining-code thresholds for low-stock alerts on active events:
// - 0 remaining (when the event has codes) -> "empty"
// - <= 10% remaining, or <= 5 remaining when at least half the pool is used -> "low"
//   (capping the absolute floor at half the pool avoids flagging brand-new
//   small pools like 5/5 as low stock).
const LOW_STOCK_COUNT = 5;
const LOW_STOCK_RATIO = 0.1;

export function getStockStatus(
  stats: Pick<EventHealthStats, "totalCodes" | "remainingCodes">,
): StockStatus {
  if (stats.totalCodes <= 0) return "none";
  if (stats.remainingCodes <= 0) return "empty";
  if (
    stats.remainingCodes / stats.totalCodes <= LOW_STOCK_RATIO ||
    stats.remainingCodes <= Math.min(LOW_STOCK_COUNT, Math.floor(stats.totalCodes / 2))
  ) {
    return "low";
  }
  return "ok";
}

export function eventNeedsAttention(
  stats: EventHealthStats | undefined,
  isActive: boolean,
): boolean {
  if (!stats) return false;
  if (stats.pendingRequests > 0 || stats.flaggedCount > 0) return true;
  if (!isActive) return false;
  const stock = getStockStatus(stats);
  return stock === "empty" || stock === "low";
}

export interface DashboardAlertSummary {
  outOfStockCount: number;
  lowStockCount: number;
  pendingRequestsTotal: number;
  pendingRequestsEvents: number;
  flaggedTotal: number;
  flaggedEvents: number;
  attentionEventIds: Set<string>;
}

export function summarizeDashboardAlerts(
  events: { _id: string; isActive: boolean; stats?: EventHealthStats }[],
): DashboardAlertSummary {
  let outOfStockCount = 0;
  let lowStockCount = 0;
  let pendingRequestsTotal = 0;
  let pendingRequestsEvents = 0;
  let flaggedTotal = 0;
  let flaggedEvents = 0;
  const attentionEventIds = new Set<string>();

  for (const event of events) {
    const stats = event.stats;
    if (!stats) continue;
    let flaggedForAttention = false;

    if (event.isActive) {
      const stock = getStockStatus(stats);
      if (stock === "empty") {
        outOfStockCount++;
        flaggedForAttention = true;
      } else if (stock === "low") {
        lowStockCount++;
        flaggedForAttention = true;
      }
    }

    if (stats.pendingRequests > 0) {
      pendingRequestsTotal += stats.pendingRequests;
      pendingRequestsEvents++;
      flaggedForAttention = true;
    }

    if (stats.flaggedCount > 0) {
      flaggedTotal += stats.flaggedCount;
      flaggedEvents++;
      flaggedForAttention = true;
    }

    if (flaggedForAttention) {
      attentionEventIds.add(event._id);
    }
  }

  return {
    outOfStockCount,
    lowStockCount,
    pendingRequestsTotal,
    pendingRequestsEvents,
    flaggedTotal,
    flaggedEvents,
    attentionEventIds,
  };
}

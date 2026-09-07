import type { FilterBuilder } from "convex/server";
import type { DataModel } from "./_generated/dataModel";

export function notExpired(q: FilterBuilder<DataModel["codes"]>) {
  return q.or(
    q.eq(q.field("expiresAt"), undefined),
    q.gt(q.field("expiresAt"), Date.now()),
  );
}

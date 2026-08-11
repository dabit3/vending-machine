import { internalMutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

export const removeLegacyEventUrl = internalMutation({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("events").collect();
    let cleaned = 0;

    for (const event of events) {
      if (!Object.prototype.hasOwnProperty.call(event, "eventUrl")) {
        continue;
      }

      await ctx.db.patch(
        event._id,
        { eventUrl: undefined } as unknown as Partial<Doc<"events">>,
      );
      cleaned++;
    }

    return { cleaned };
  },
});

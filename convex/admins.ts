import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";

async function adminEmailStatus(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return { email: null, isAdmin: false };
  const email = identity.email?.trim().toLowerCase();
  const anyAdmin = await ctx.db.query("admins").first();
  // Bootstrap: while the admin list is empty, any signed-in user is an admin.
  if (!anyAdmin) return { email, isAdmin: true };
  if (!email) return { email: null, isAdmin: false };
  const match = await ctx.db
    .query("admins")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  return { email, isAdmin: match !== null };
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  const { isAdmin } = await adminEmailStatus(ctx);
  if (!isAdmin) {
    throw new Error("Not an admin");
  }
  return identity;
}

export const isAdmin = query({
  args: {},
  handler: async (ctx) => {
    const { isAdmin } = await adminEmailStatus(ctx);
    return isAdmin;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const { email } = await adminEmailStatus(ctx);
    const admins = await ctx.db.query("admins").collect();
    return admins.map((admin) => ({
      _id: admin._id,
      email: admin.email,
      isSelf: admin.email === email,
    }));
  },
});

export const add = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const email = args.email.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      throw new Error("Enter a valid email address");
    }
    const anyAdmin = await ctx.db.query("admins").first();
    if (!anyAdmin) {
      const { email: callerEmail } = await adminEmailStatus(ctx);
      if (email !== callerEmail) {
        throw new Error(
          "The admin list is empty — add your own email first so you don't lock yourself out"
        );
      }
    }
    const existing = await ctx.db
      .query("admins")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) throw new Error(`${email} is already an admin`);
    await ctx.db.insert("admins", { email });
  },
});

export const remove = mutation({
  args: { id: v.id("admins") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const admin = await ctx.db.get(args.id);
    if (!admin) return;
    const admins = await ctx.db.query("admins").collect();
    if (admins.length === 1) {
      throw new Error(
        "Cannot remove the last admin — an empty list would let any signed-in user administer events"
      );
    }
    await ctx.db.delete(args.id);
  },
});

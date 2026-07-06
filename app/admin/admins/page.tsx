"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export default function AdminsPage() {
  const admins = useQuery(api.admins.list);
  const addAdmin = useMutation(api.admins.add);
  const removeAdmin = useMutation(api.admins.remove);

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await addAdmin({ email });
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add admin");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: Id<"admins">, isSelf: boolean) {
    if (
      isSelf &&
      !confirm("Remove yourself? You will immediately lose admin access.")
    ) {
      return;
    }
    setError(null);
    try {
      await removeAdmin({ id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove admin");
    }
  }

  return (
    <div>
      <div className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight">Admins</h1>
        <p className="mt-1 text-sm text-muted">
          Only these emails can access the admin dashboard and manage events.
        </p>
      </div>

      {admins !== undefined && admins.length === 0 ? (
        <div className="mb-6 rounded-lg border border-dashed border-border-strong p-4 text-sm text-muted">
          The admin list is empty, so <strong>any signed-in user</strong>{" "}
          currently has admin access. Add your own email to lock it down.
        </div>
      ) : null}

      <form onSubmit={handleAdd} className="mb-10 flex gap-3">
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@example.com"
          className="w-full max-w-sm rounded-md border border-border-strong bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-dim focus:border-foreground"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Adding..." : "Add admin"}
        </button>
      </form>

      {error ? <p className="mb-6 text-sm text-muted">{error}</p> : null}

      {admins === undefined ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg border border-border bg-surface"
            />
          ))}
        </div>
      ) : (
        <ul className="space-y-3">
          {admins.map((admin) => (
            <li
              key={admin._id}
              className="group flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3"
            >
              <span className="flex items-center gap-3">
                <span className="font-mono text-sm">{admin.email}</span>
                {admin.isSelf ? (
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                    you
                  </span>
                ) : null}
              </span>
              <button
                onClick={() => handleRemove(admin._id, admin.isSelf)}
                className="text-xs text-muted-dim opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

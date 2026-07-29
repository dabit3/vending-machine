"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import AdminForm from "@/components/admin/AdminForm";
import AdminList from "@/components/admin/AdminList";

export default function AdminsPage() {
  const access = useQuery(api.admins.accessLevel);
  const admins = useQuery(api.admins.list, access?.isGlobalAdmin ? {} : "skip");
  const addAdmin = useMutation(api.admins.add);
  const removeAdmin = useMutation(api.admins.remove);

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await addAdmin({ email });
      toast.success(`${email.trim().toLowerCase()} is now an admin`);
      setEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add admin");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id: Id<"admins">) {
    try {
      await removeAdmin({ id });
      toast.success("Admin removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove admin");
    }
  }

  if (access && !access.isGlobalAdmin) {
    return (
      <div className="mx-auto max-w-2xl">
        <Alert>
          <ShieldAlert />
          <AlertTitle>Global admins only</AlertTitle>
          <AlertDescription>
            This page manages the global admin list. You have event-level
            access — head back to your events.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-10">
        <p className="eyebrow flex items-center gap-2 text-muted-foreground">
          <span className="inline-block size-1.5 rounded-full bg-brand" />
          Access control
        </p>
        <h1 className="mt-3 font-heading text-3xl font-semibold tracking-[-0.02em]">
          Admins
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only these emails can access the control room and manage events.
        </p>
      </div>

      {admins !== undefined && admins.length === 0 ? (
        <Alert variant="destructive" className="mb-8">
          <ShieldAlert />
          <AlertTitle>The admin list is empty</AlertTitle>
          <AlertDescription>
            Any signed-in user currently has admin access. Add your own email
            to lock it down.
          </AlertDescription>
        </Alert>
      ) : null}

      <AdminForm
        email={email}
        submitting={submitting}
        onEmailChange={setEmail}
        onSubmit={handleAdd}
      />
      <AdminList admins={admins} onRemove={handleRemove} />
    </div>
  );
}

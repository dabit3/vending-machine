"use client";

import { useState } from "react";
import { ShieldAlert, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminsPage() {
  const admins = useQuery(api.admins.list);
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

      <form onSubmit={handleAdd} className="mb-10">
        <Field>
          <FieldLabel htmlFor="admin-email">Add an admin</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="admin-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              className="font-mono text-sm"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="submit"
                variant="brand"
                size="xs"
                disabled={submitting}
              >
                <UserPlus data-icon="inline-start" />
                {submitting ? "Adding..." : "Add"}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>
      </form>

      {admins === undefined ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 rounded-md" />
          <Skeleton className="h-12 rounded-md" />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {admins.map((admin) => (
            <li
              key={admin._id}
              className="group flex min-h-12 items-center justify-between gap-3 px-4 py-2"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="truncate font-mono text-sm">{admin.email}</span>
                {admin.isSelf ? (
                  <Badge
                    variant="outline"
                    className="eyebrow shrink-0 border-brand/40 text-brand"
                  >
                    You
                  </Badge>
                ) : null}
              </span>
              {admin.isSelf ? (
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Remove ${admin.email}`}
                        className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      />
                    }
                  >
                    <X />
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove yourself?</AlertDialogTitle>
                      <AlertDialogDescription>
                        You will immediately lose admin access, and only another
                        admin can add you back.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() => handleRemove(admin._id)}
                      >
                        Remove me
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${admin.email}`}
                  onClick={() => handleRemove(admin._id)}
                  className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <X />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

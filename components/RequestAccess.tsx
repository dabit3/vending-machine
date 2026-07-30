"use client";

import { useState } from "react";
import { CheckCircle2, Hourglass, MailQuestion, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

// Shown on the claim page for signed-in attendees: surfaces the status of
// their access request, or lets them submit one if they're not whitelisted.
export default function RequestAccess({ slug }: { slug: string }) {
  const myRequest = useQuery(api.accessRequests.mine, { slug });
  const request = useMutation(api.accessRequests.request);
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await request({ slug, message: message || undefined });
      if (res.ok) {
        toast.success("Access request submitted");
        setShowForm(false);
        setMessage("");
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (myRequest === undefined) return null;

  if (myRequest?.status === "pending") {
    return (
      <Alert>
        <Hourglass />
        <AlertTitle>Access request pending</AlertTitle>
        <AlertDescription>
          Submitted {new Date(myRequest.requestedAt).toLocaleString()}. You&apos;ll
          get an email if it&apos;s approved.
        </AlertDescription>
      </Alert>
    );
  }

  if (myRequest?.status === "approved") {
    return (
      <Alert>
        <CheckCircle2 />
        <AlertTitle>Access request approved</AlertTitle>
        <AlertDescription>
          You&apos;re on the list — dispense your code above.
        </AlertDescription>
      </Alert>
    );
  }

  if (myRequest?.status === "denied" && !showForm) {
    return (
      <Alert variant="destructive">
        <XCircle />
        <AlertTitle>Access request denied</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          {myRequest.decidedAt
            ? `Decided ${new Date(myRequest.decidedAt).toLocaleString()}.`
            : null}
          <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
            Request again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!showForm) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-dashed border-border-strong p-4">
        <p className="text-sm text-muted-foreground">
          Not on the list? Ask the organizers for access.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setShowForm(true)}
        >
          <MailQuestion data-icon="inline-start" />
          Request access
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-md border border-dashed border-border-strong p-4"
    >
      <p className="text-sm text-muted-foreground">
        Send the organizers a request — you&apos;ll get an email if it&apos;s approved.
      </p>
      <Textarea
        aria-label="Optional note for the organizers"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="Optional note (e.g. who registered you, company)"
        className="resize-y text-sm"
      />
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          variant="brand"
          size="sm"
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? (
            <>
              <Spinner data-icon="inline-start" />
              Sending...
            </>
          ) : (
            "Send request"
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowForm(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

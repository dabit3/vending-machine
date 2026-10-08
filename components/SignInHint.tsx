import { AtSign, Mail } from "lucide-react";
import type { AttendeeIdentity } from "@/lib/attendee-identity";
import { MarkdownText } from "@/components/MarkdownText";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const hintSpacing = "gap-1 px-3 py-3.5";

// The hint above the claim page's sign-in button: the event's custom
// message when set, otherwise the default copy for its identity mode.
export function SignInHint({
  identity,
  dynamic,
  message,
}: {
  identity: AttendeeIdentity;
  dynamic?: boolean;
  message?: string;
}) {
  const byHandle = identity === "x";
  if (message) {
    return (
      <Alert className={hintSpacing}>
        {byHandle ? <AtSign /> : <Mail />}
        <AlertDescription>
          <MarkdownText value={message} />
        </AlertDescription>
      </Alert>
    );
  }
  if (dynamic) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        {byHandle
          ? "Sign in with X to claim your code, one per X account."
          : "Sign in to claim your code, one per verified email address."}
      </p>
    );
  }
  return byHandle ? (
    <Alert className={hintSpacing}>
      <AtSign />
      <AlertTitle>
        Sign in with the X account you registered for this event with
      </AlertTitle>
      <AlertDescription>
        Codes are only dispensed to the X handles your organizer added. Choose
        &ldquo;Continue with X&rdquo; when signing in.
      </AlertDescription>
    </Alert>
  ) : (
    <Alert className={hintSpacing}>
      <Mail />
      <AlertTitle>Sign in with the email you used for this event</AlertTitle>
      <AlertDescription>
        Codes are only dispensed to the addresses your organizer added. A
        different email won&apos;t be on the list, even if it&apos;s yours.
      </AlertDescription>
    </Alert>
  );
}

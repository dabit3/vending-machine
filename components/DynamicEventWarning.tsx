import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

// Shown while the Dynamic checkbox is ticked on the event forms.
export function DynamicEventWarning({ className }: { className?: string }) {
  return (
    <Alert className={cn("border-amber-500/40", className)}>
      <AlertTriangle className="text-amber-500" aria-hidden />
      <AlertTitle>Warning: anyone with the link can take a code</AlertTitle>
      <AlertDescription>
        <p>
          Dynamic events skip the eligible-email list: every unique signed-in
          email that opens the claim URL receives one code until the pool runs
          out. Only share the link where you want codes handed out.
        </p>
        <p>
          Not recommended – only use if you do not have the list of attendee
          emails.
        </p>
      </AlertDescription>
    </Alert>
  );
}

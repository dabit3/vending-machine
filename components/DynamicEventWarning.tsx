import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

// Shown while the Dynamic checkbox is ticked on the event forms.
export function DynamicEventWarning({ className }: { className?: string }) {
  return (
    <Alert className={cn("border-amber-500/40", className)}>
      <AlertTriangle className="text-amber-500" aria-hidden />
      <AlertTitle>Anyone with the link can take a code</AlertTitle>
      <AlertDescription>
        Dynamic events skip the eligible-email list: every signed-in email that
        opens the claim URL or scans the QR code receives one code until the
        pool runs out. Only share the link or QR code where you want codes
        handed out.
      </AlertDescription>
    </Alert>
  );
}

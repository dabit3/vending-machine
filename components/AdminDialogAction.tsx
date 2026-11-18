"use client";

import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { AlertDialogAction } from "@/components/ui/alert-dialog";

export function AdminDialogAction(props: React.ComponentProps<typeof AlertDialogAction>) {
  return <AlertDialogPrimitive.Close render={<AlertDialogAction {...props} />} />;
}

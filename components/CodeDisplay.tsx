import { CardContent } from "@/components/ui/card";

export function CodeDisplay({
  code,
  label = "Credit code",
}: {
  code: string;
  label?: string;
}) {
  return (
    <CardContent className="flex-1">
      <div className="rounded-lg border border-dashed border-border-strong bg-background px-5 py-6 text-center">
        <div className="eyebrow text-muted-dim">{label}</div>
        <div className="mt-3 break-all font-mono text-2xl font-medium tracking-[0.08em] select-all">
          {code}
        </div>
      </div>
    </CardContent>
  );
}

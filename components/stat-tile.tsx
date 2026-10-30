import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export function StatTile({
  label,
  value,
  hint,
  negative = false,
}: {
  label: string;
  value: string;
  hint?: string;
  negative?: boolean;
}) {
  return (
    <Card className="p-4 print:break-inside-avoid print:shadow-none">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold", negative ? "text-red-600" : "text-gray-900")}>
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-gray-400">{hint}</p> : null}
    </Card>
  );
}

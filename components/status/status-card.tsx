import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

/** Centered message for not-found and error screens. */
export function StatusCard({
  icon: Icon,
  title,
  children,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <Card className="mx-auto mt-10 max-w-md p-6 text-center">
      <Icon className="mx-auto size-8 text-gray-400" aria-hidden />
      <h1 className="mt-3 text-lg font-semibold text-gray-900">{title}</h1>
      <div className="mt-1 text-sm text-gray-600">{children}</div>
      <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div>
    </Card>
  );
}

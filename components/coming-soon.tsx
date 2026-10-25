import { Card } from "@/components/ui/card";

/** Placeholder for screens built in later phases. */
export function ComingSoon({ phase, items }: { phase: number; items: string[] }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-gold-600">Built in Phase {phase}</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-600">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Card>
  );
}

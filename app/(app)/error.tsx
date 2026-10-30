"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { StatusCard } from "@/components/status/status-card";
import { Button, buttonClasses } from "@/components/ui/button";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;

  return (
    <StatusCard
      icon={TriangleAlert}
      title="Something went wrong"
      actions={
        <>
          <Button onClick={() => retry()}>Try again</Button>
          <Link href="/" className={buttonClasses({ variant: "secondary" })}>
            Go to the home page
          </Link>
        </>
      }
    >
      <p>
        This screen could not load. Nothing was saved halfway: a sale, payment or stock change is
        either saved in full or not at all.
      </p>
      {digest ? <p className="mt-2 text-xs text-gray-400">Error code: {digest}</p> : null}
    </StatusCard>
  );
}

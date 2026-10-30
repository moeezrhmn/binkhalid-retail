import Link from "next/link";
import { SearchX } from "lucide-react";
import { StatusCard } from "@/components/status/status-card";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <StatusCard
      icon={SearchX}
      title="Not found"
      actions={
        <Link href="/" className={buttonClasses()}>
          Go to the home page
        </Link>
      }
    >
      This page, bill or record does not exist. It may have been deleted, or the link is wrong.
    </StatusCard>
  );
}

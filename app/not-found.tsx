import Link from "next/link";
import { SearchX } from "lucide-react";
import { StatusCard } from "@/components/status/status-card";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="px-4">
      <StatusCard
        icon={SearchX}
        title="Page not found"
        actions={
          <Link href="/" className={buttonClasses()}>
            Go to the home page
          </Link>
        }
      >
        Check the address, or go back to the home page.
      </StatusCard>
    </div>
  );
}

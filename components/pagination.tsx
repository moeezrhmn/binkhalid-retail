import Link from "next/link";
import { cn } from "@/lib/cn";

/** Previous / next links that keep the current search params. */
export function Pagination({
  page,
  pageCount,
  params,
}: {
  page: number;
  pageCount: number;
  params: Record<string, string | undefined>;
}) {
  if (pageCount <= 1) return null;

  const href = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    search.set("page", String(target));
    return `?${search.toString()}`;
  };
  const link = "rounded-lg border border-gray-300 px-3 py-1.5 text-sm";

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4 pt-4 text-sm">
      <span className="text-gray-500">
        Page {page} of {pageCount}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={cn(link, "hover:bg-gray-50")}>
            Previous
          </Link>
        ) : null}
        {page < pageCount ? (
          <Link href={href(page + 1)} className={cn(link, "hover:bg-gray-50")}>
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CompanyPagination({
  page,
  pageCount,
  search,
}: {
  page: number;
  pageCount: number;
  search: string;
}) {
  if (pageCount <= 1) return null;

  function href(target: number) {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `/companies?${qs}` : "/companies";
  }

  return (
    <nav className="flex items-center justify-between gap-3" aria-label="Companies pagination">
      <Link
        href={href(Math.max(1, page - 1))}
        aria-disabled={page <= 1}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          page <= 1 && "pointer-events-none opacity-50",
        )}
      >
        Previous
      </Link>
      <p className="text-muted-foreground text-sm">
        Page {page} of {pageCount}
      </p>
      <Link
        href={href(Math.min(pageCount, page + 1))}
        aria-disabled={page >= pageCount}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          page >= pageCount && "pointer-events-none opacity-50",
        )}
      >
        Next
      </Link>
    </nav>
  );
}

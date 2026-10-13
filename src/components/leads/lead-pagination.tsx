import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { leadListHref } from "@/lib/leads/list-href";
import type { LeadPurpose } from "@/lib/leads/validation";

export function LeadPagination({
  page,
  pageCount,
  term,
  purpose,
  unread = false,
}: {
  page: number;
  pageCount: number;
  term: string;
  purpose: LeadPurpose | null;
  unread?: boolean;
}) {
  if (pageCount <= 1) return null;

  const disabled = "pointer-events-none opacity-50";

  return (
    <nav className="flex items-center justify-between gap-4 pt-4" aria-label="Lead pages">
      <Link
        href={leadListHref({ term, page: page - 1, purpose, unread })}
        aria-disabled={page <= 1}
        tabIndex={page <= 1 ? -1 : undefined}
        className={`${buttonVariants({ variant: "outline", size: "sm" })} ${page <= 1 ? disabled : ""}`}
      >
        Previous
      </Link>

      <p className="text-muted-foreground text-sm">
        Page {page} of {pageCount}
      </p>

      <Link
        href={leadListHref({ term, page: page + 1, purpose, unread })}
        aria-disabled={page >= pageCount}
        tabIndex={page >= pageCount ? -1 : undefined}
        className={`${buttonVariants({ variant: "outline", size: "sm" })} ${page >= pageCount ? disabled : ""}`}
      >
        Next
      </Link>
    </nav>
  );
}

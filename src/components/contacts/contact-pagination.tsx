import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

function pageHref(page: number, term: string) {
  const params = new URLSearchParams();
  if (term) params.set("q", term);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/contacts?${query}` : "/contacts";
}

export function ContactPagination({
  page,
  pageCount,
  term,
}: {
  page: number;
  pageCount: number;
  term: string;
}) {
  if (pageCount <= 1) return null;

  const disabled = "pointer-events-none opacity-50";

  return (
    <nav className="flex items-center justify-between gap-4 pt-4" aria-label="Contact pages">
      <Link
        href={pageHref(page - 1, term)}
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
        href={pageHref(page + 1, term)}
        aria-disabled={page >= pageCount}
        tabIndex={page >= pageCount ? -1 : undefined}
        className={`${buttonVariants({ variant: "outline", size: "sm" })} ${page >= pageCount ? disabled : ""}`}
      >
        Next
      </Link>
    </nav>
  );
}

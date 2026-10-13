import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { campaignListHref } from "@/lib/campaigns/list-href";
import type { CampaignPurpose } from "@/lib/campaigns/validation";

export function CampaignPagination({
  page,
  pageCount,
  term,
  purpose,
}: {
  page: number;
  pageCount: number;
  term: string;
  purpose: CampaignPurpose | null;
}) {
  if (pageCount <= 1) return null;

  const disabled = "pointer-events-none opacity-50";

  return (
    <nav className="flex items-center justify-between gap-4 pt-4" aria-label="Campaign pages">
      <Link
        href={campaignListHref({ term, purpose, page: page - 1 })}
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
        href={campaignListHref({ term, purpose, page: page + 1 })}
        aria-disabled={page >= pageCount}
        tabIndex={page >= pageCount ? -1 : undefined}
        className={`${buttonVariants({ variant: "outline", size: "sm" })} ${page >= pageCount ? disabled : ""}`}
      >
        Next
      </Link>
    </nav>
  );
}

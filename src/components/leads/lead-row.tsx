import Link from "next/link";

import type { Lead } from "@/lib/leads/queries";
import { LEAD_PURPOSE_LABELS, statusLabel } from "@/lib/leads/validation";

export function LeadRow({ lead }: { lead: Lead }) {
  const unread = lead.viewedAt == null;

  return (
    <li className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          {unread ? (
            <span
              className="bg-sky-500 size-2 shrink-0 rounded-full"
              title="Unread"
              aria-hidden
            />
          ) : null}
          <Link
            href={`/leads/${lead.id}`}
            className={`truncate underline-offset-4 hover:underline ${unread ? "font-semibold" : "font-medium"}`}
          >
            {lead.contactName}
            {unread ? <span className="sr-only"> (unread)</span> : null}
          </Link>
          {unread ? (
            <span className="bg-sky-500/15 text-sky-700 dark:text-sky-300 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
              New
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground truncate text-sm">
          {LEAD_PURPOSE_LABELS[lead.purpose]} · {statusLabel(lead.status)}
        </p>
      </div>
    </li>
  );
}

import Link from "next/link";

import { formatOccurredAt } from "@/lib/calls/format";
import type { CallRecord } from "@/lib/calls/queries";
import { CALL_OUTCOME_LABELS } from "@/lib/calls/validation";

export function CallRow({ record }: { record: CallRecord }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <Link
          href={`/calls/${record.id}`}
          className="truncate font-medium underline-offset-4 hover:underline"
        >
          {record.contactName}
        </Link>
        <p className="text-muted-foreground truncate text-sm">
          {CALL_OUTCOME_LABELS[record.outcome]} · {formatOccurredAt(record.occurredAt)}
        </p>
      </div>
    </li>
  );
}

import { CallRow } from "@/components/calls/call-row";
import type { CallRecord } from "@/lib/calls/queries";

export function CallHistoryList({
  records,
  empty,
}: {
  records: CallRecord[];
  empty: string;
}) {
  if (records.length === 0) {
    return <p className="text-muted-foreground text-sm">{empty}</p>;
  }

  return (
    <ul className="divide-border divide-y">
      {records.map((record) => (
        <CallRow key={record.id} record={record} />
      ))}
    </ul>
  );
}

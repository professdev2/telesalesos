import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { CallDetailForm } from "@/components/calls/call-detail-form";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatOccurredAt } from "@/lib/calls/format";
import { getCallRecordById } from "@/lib/calls/queries";
import { CALL_OUTCOME_LABELS } from "@/lib/calls/validation";
import { listLeadsForSelect } from "@/lib/leads/queries";
import { requireActiveMembership } from "@/lib/org/active-org";

export const metadata: Metadata = {
  title: "Call | TelesalesOS",
};

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const [membership, { id }, leads] = await Promise.all([
    requireActiveMembership(),
    params,
    listLeadsForSelect(),
  ]);
  const record = await getCallRecordById(id);

  if (!record) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={record.contactName}
        description={`Logged attempt in ${membership.organizationName}.`}
      />

      <Link href="/calls" className={buttonVariants({ variant: "outline", size: "sm" })}>
        Back to calls
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
          <CardDescription>
            Outcome {CALL_OUTCOME_LABELS[record.outcome]}. Attempted{" "}
            {formatOccurredAt(record.occurredAt)}. The organization comes from your session and
            cannot be changed here. There is no delete control — correct a mistake by editing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4 text-sm">
            Contact{" "}
            <Link
              href={`/contacts/${record.contactId}`}
              className="text-foreground underline-offset-4 hover:underline"
            >
              {record.contactName}
            </Link>
            {record.leadId ? (
              <>
                {" "}
                · Lead{" "}
                <Link
                  href={`/leads/${record.leadId}`}
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  open lead
                </Link>
              </>
            ) : null}
          </p>
          <CallDetailForm record={record} leads={leads} />
        </CardContent>
      </Card>
    </div>
  );
}

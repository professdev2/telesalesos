import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getRetentionQueueLeads,
  normalizeRetentionQueue,
  type RetentionQueue,
} from "@/lib/leads/queries";
import { statusLabel } from "@/lib/leads/validation";
import { requireActiveMembership } from "@/lib/org/active-org";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Retention | TelesalesOS",
};

const QUEUES: { id: RetentionQueue; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending issue" },
  { id: "payment", label: "Payment problems" },
  { id: "at_risk", label: "At risk" },
  { id: "lapsed", label: "Lapsed / cancelled" },
];

export default async function RetentionPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string | string[] }>;
}) {
  const [membership, params] = await Promise.all([
    requireActiveMembership(),
    searchParams,
  ]);
  const queue = normalizeRetentionQueue(
    typeof params.queue === "string" ? params.queue : undefined,
  );
  const leads = await getRetentionQueueLeads(queue);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Retention"
        description={`Policy conservation queues for ${membership.organizationName}.`}
      />

      <Card>
        <CardHeader className="gap-4">
          <div>
            <CardTitle className="text-base">Work queues</CardTitle>
            <CardDescription>
              Retention leads only. Open a row to edit stages, dispositions, and policy fields.
              Kanban is on{" "}
              <Link
                href="/leads?purpose=retention&view=board"
                className="text-foreground underline-offset-4 hover:underline"
              >
                Leads → Retention board
              </Link>
              .
            </CardDescription>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Retention queues">
            {QUEUES.map((item) => (
              <Link
                key={item.id}
                href={item.id === "all" ? "/retention" : `/retention?queue=${item.id}`}
                aria-current={item.id === queue ? "page" : undefined}
                className={buttonVariants({
                  variant: item.id === queue ? "default" : "outline",
                  size: "sm",
                })}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </CardHeader>
        <CardContent>
          {leads.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No retention leads in this queue. Create a Retention lead from Leads, or switch
              queue.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground pb-3 text-sm">
                {leads.length} {leads.length === 1 ? "lead" : "leads"}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="text-muted-foreground border-b">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Client</th>
                      <th className="py-2 pr-3 font-medium">Carrier</th>
                      <th className="py-2 pr-3 font-medium">Premium</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 font-medium">Days past due</th>
                      <th className="py-2 pr-3 font-medium">Grace end</th>
                      <th className="py-2 font-medium">Next follow-up</th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {leads.map((lead) => (
                      <tr key={lead.id}>
                        <td className="py-2 pr-3">
                          <Link
                            href={`/leads/${lead.id}`}
                            className={cn(
                              "font-medium underline-offset-4 hover:underline",
                            )}
                          >
                            {lead.contactName}
                          </Link>
                        </td>
                        <td className="text-muted-foreground py-2 pr-3">
                          {String(lead.extra.carrier ?? "—")}
                        </td>
                        <td className="text-muted-foreground py-2 pr-3">
                          {lead.extra.premium !== undefined
                            ? String(lead.extra.premium)
                            : "—"}
                        </td>
                        <td className="py-2 pr-3">{statusLabel(lead.status)}</td>
                        <td className="text-muted-foreground py-2 pr-3">
                          {lead.extra.days_past_due !== undefined
                            ? String(lead.extra.days_past_due)
                            : "—"}
                        </td>
                        <td className="text-muted-foreground py-2 pr-3">
                          {String(lead.extra.grace_end ?? "—")}
                        </td>
                        <td className="text-muted-foreground py-2">
                          {String(lead.extra.next_follow_up ?? "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

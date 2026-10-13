import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { CallForm } from "@/components/calls/call-form";
import { CallHistoryList } from "@/components/calls/call-history-list";
import { LeadDetailForm } from "@/components/leads/lead-detail-form";
import { OrderForm } from "@/components/orders/order-form";
import { OrderRow } from "@/components/orders/order-row";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hasAtLeastRole } from "@/lib/auth/dal";
import { listCallRecordsForLead } from "@/lib/calls/queries";
import { availablePurposes } from "@/lib/crm/pipelines";
import { markLeadViewed } from "@/lib/leads/actions";
import { getLeadById } from "@/lib/leads/queries";
import { LEAD_PURPOSE_LABELS, statusLabel } from "@/lib/leads/validation";
import {
  listOrdersForLeadWithFallback,
  summarizeOrders,
} from "@/lib/orders/queries";
import { formatMoney } from "@/lib/orders/validation";
import { requireActiveMembership } from "@/lib/org/active-org";

export const metadata: Metadata = {
  title: "Lead | TelesalesOS",
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const [membership, { id }] = await Promise.all([requireActiveMembership(), params]);
  const [lead, records] = await Promise.all([
    getLeadById(id),
    listCallRecordsForLead(id),
  ]);

  if (!lead) {
    notFound();
  }

  if (lead.viewedAt == null) {
    await markLeadViewed(lead.id);
  }

  const purposes = availablePurposes(membership.powerbridgeEnabled);
  const showOrders =
    membership.powerbridgeEnabled && lead.purpose === "powerbridge";
  const orders = showOrders
    ? await listOrdersForLeadWithFallback(lead.id, lead.companyId)
    : [];
  const orderTotals = summarizeOrders(orders);
  const canDelete = hasAtLeastRole(membership.role, "admin");

  return (
    <div className="space-y-6">
      <PageHeader
        title={lead.contactName}
        description={`${LEAD_PURPOSE_LABELS[lead.purpose]} lead in ${membership.organizationName}.`}
      />

      {showOrders && orderTotals.orderCount > 0 ? (
        <dl className="grid gap-3 sm:grid-cols-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Orders</dt>
            <dd className="text-lg font-medium">{orderTotals.orderCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Lifetime collected</dt>
            <dd className="text-lg font-medium">
              {formatMoney(orderTotals.lifetimeRevenue)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Lifetime profit</dt>
            <dd className="text-lg font-medium">
              {formatMoney(orderTotals.lifetimeProfit)}
            </dd>
          </div>
        </dl>
      ) : null}

      <Link href="/leads" className={buttonVariants({ variant: "outline", size: "sm" })}>
        Back to leads
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
          <CardDescription>
            {LEAD_PURPOSE_LABELS[lead.purpose]} · {statusLabel(lead.status)}. Added{" "}
            {new Date(lead.createdAt).toLocaleDateString()}. The organization comes from your
            session and cannot be changed here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4 text-sm">
            Contact{" "}
            <Link
              href={`/contacts/${lead.contactId}`}
              className="text-foreground underline-offset-4 hover:underline"
            >
              {lead.contactName}
            </Link>
            {lead.companyId && lead.companyName ? (
              <>
                {" · "}
                Company{" "}
                <Link
                  href={`/companies/${lead.companyId}`}
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  {lead.companyName}
                </Link>
              </>
            ) : null}
            {lead.archivedAt ? " · Archived" : ""}
          </p>
          <LeadDetailForm
            key={`${lead.id}|${lead.purpose}|${lead.status}|${JSON.stringify(lead.extra)}`}
            lead={lead}
            purposes={purposes}
            showCompany={membership.powerbridgeEnabled}
            canDelete={canDelete}
          />
        </CardContent>
      </Card>

      {showOrders ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Orders</CardTitle>
            <CardDescription>
              Purchases on this deal. Each reorder is a new order — profit history is kept.
              Profit = Collected − Our cost.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!lead.companyId ? (
              <p className="text-muted-foreground text-sm">
                Link a company on this lead before adding orders.
              </p>
            ) : (
              <OrderForm
                companyId={lead.companyId}
                leadId={lead.id}
                prefills={{
                  contactId: lead.contactId,
                  contactName: lead.contactName,
                  vertical: asString(lead.extra.vertical),
                  imo: asString(lead.extra.imo),
                  leadType: asString(lead.extra.product_lead_type),
                  states: asString(lead.extra.states_needed),
                }}
              />
            )}

            {orders.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No orders yet. Add the first purchase above.
              </p>
            ) : (
              <ul>
                {orders.map((order) => (
                  <OrderRow key={order.id} order={order} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attempts</CardTitle>
          <CardDescription>
            Logged attempts for this opportunity. Saving an attempt does not change the status
            above.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <CallForm
            leads={[]}
            defaultContactId={lead.contactId}
            defaultLeadId={lead.id}
          />
          <CallHistoryList records={records} empty="No attempts logged for this lead yet." />
        </CardContent>
      </Card>
    </div>
  );
}

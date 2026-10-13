import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { CompanyDetailForm } from "@/components/companies/company-detail-form";
import { OrderForm } from "@/components/orders/order-form";
import { OrderRow } from "@/components/orders/order-row";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getCompanyById,
  listCompanyContacts,
  listCompanyLeads,
} from "@/lib/companies/queries";
import { statusLabel } from "@/lib/leads/validation";
import { listOrdersForCompany, summarizeOrders } from "@/lib/orders/queries";
import { formatMoney } from "@/lib/orders/validation";
import { requireActiveMembership } from "@/lib/org/active-org";

export const metadata: Metadata = {
  title: "Company | TelesalesOS",
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, membership] = await Promise.all([params, requireActiveMembership()]);

  if (!membership.powerbridgeEnabled) {
    notFound();
  }

  const company = await getCompanyById(id);
  if (!company) {
    notFound();
  }

  const [leads, contacts, orders] = await Promise.all([
    listCompanyLeads(company.id),
    listCompanyContacts(company.id),
    listOrdersForCompany(company.id),
  ]);
  const totals = summarizeOrders(orders);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href="/companies"
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          ← Companies
        </Link>
        <PageHeader title={company.name} description="PowerBridge account" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company details</CardTitle>
          <CardDescription>Account fields for PowerBridge B2B.</CardDescription>
        </CardHeader>
        <CardContent>
          <CompanyDetailForm company={company} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">People</CardTitle>
          <CardDescription>
            Contacts at this account. Link them from the contact form.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No people linked yet. Open a contact and choose this company.
            </p>
          ) : (
            <ul className="divide-y">
              {contacts.map((person) => (
                <li
                  key={person.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2"
                >
                  <Link
                    href={`/contacts/${person.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {person.fullName}
                  </Link>
                  <span className="text-muted-foreground text-sm">
                    {[person.email, person.phone].filter(Boolean).join(" · ") || "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Opportunities</CardTitle>
          <CardDescription>
            Open leads linked to this company. Clone from a lead detail to open another deal
            without duplicating the account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leads.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No open opportunities yet. Link a PowerBridge lead to this company.
            </p>
          ) : (
            <ul className="divide-y">
              {leads.map((lead) => (
                <li key={lead.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <Link
                    href={`/leads/${lead.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {lead.contactName}
                  </Link>
                  <span className="text-muted-foreground text-sm">
                    {statusLabel(lead.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Orders</CardTitle>
          <CardDescription>
            Each purchase is a new order — never duplicate the company. Profit = Collected − Our
            cost.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {totals.orderCount > 0 ? (
            <dl className="grid gap-3 sm:grid-cols-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Orders</dt>
                <dd className="font-medium">{totals.orderCount}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Lifetime revenue</dt>
                <dd className="font-medium">{formatMoney(totals.lifetimeRevenue)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Lifetime profit</dt>
                <dd className="font-medium">{formatMoney(totals.lifetimeProfit)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Leads purchased</dt>
                <dd className="font-medium">{totals.totalLeads}</dd>
              </div>
            </dl>
          ) : null}

          <OrderForm companyId={company.id} />

          {orders.length === 0 ? (
            <p className="text-muted-foreground text-sm">No orders yet. Add the first purchase above.</p>
          ) : (
            <ul>
              {orders.map((order) => (
                <OrderRow key={order.id} order={order} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

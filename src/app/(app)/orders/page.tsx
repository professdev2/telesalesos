import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { OrdersFilters } from "@/components/orders/orders-filters";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  listOrdersFiltered,
  summarizeOrders,
  type OrderListFilters,
} from "@/lib/orders/queries";
import {
  deliveryStatusLabel,
  formatMoney,
  paymentStatusLabel,
} from "@/lib/orders/validation";
import { requireActiveMembership } from "@/lib/org/active-org";

export const metadata: Metadata = {
  title: "Orders | TelesalesOS",
};

function firstString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const membership = await requireActiveMembership();
  if (!membership.powerbridgeEnabled) {
    notFound();
  }

  const params = await searchParams;
  const filters: OrderListFilters = {
    dateFrom: firstString(params.dateFrom) || undefined,
    dateTo: firstString(params.dateTo) || undefined,
    leadProvider: firstString(params.leadProvider) || undefined,
    vertical: firstString(params.vertical) || undefined,
    paymentStatus: firstString(params.paymentStatus) || undefined,
    paidProvider: (firstString(params.paidProvider) as "yes" | "no" | "") || "",
    delivered: (firstString(params.delivered) as "yes" | "no" | "") || "",
  };

  const orders = await listOrdersFiltered(filters);
  const totals = summarizeOrders(orders);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description={`PowerBridge purchases for ${membership.organizationName}. Each reorder is a new row.`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>
            Narrow by date, provider, vertical, customer paid, provider payment, and delivery.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrdersFilters
            dateFrom={filters.dateFrom ?? ""}
            dateTo={filters.dateTo ?? ""}
            leadProvider={filters.leadProvider ?? ""}
            vertical={filters.vertical ?? ""}
            paymentStatus={filters.paymentStatus ?? ""}
            paidProvider={filters.paidProvider ?? ""}
            delivered={filters.delivered ?? ""}
          />
        </CardContent>
      </Card>

      <dl className="grid gap-3 sm:grid-cols-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Orders</dt>
          <dd className="text-lg font-medium">{totals.orderCount}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Collected</dt>
          <dd className="text-lg font-medium">{formatMoney(totals.lifetimeRevenue)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Our cost</dt>
          <dd className="text-lg font-medium">{formatMoney(totals.lifetimeCost)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Profit</dt>
          <dd className="text-lg font-medium">{formatMoney(totals.lifetimeProfit)}</dd>
        </div>
      </dl>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All orders</CardTitle>
          <CardDescription>Newest first. Open a row to edit.</CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No orders match these filters. Add purchases from a company or PowerBridge lead.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Company</th>
                    <th className="py-2 pr-3 font-medium">Provider</th>
                    <th className="py-2 pr-3 font-medium">Qty</th>
                    <th className="py-2 pr-3 font-medium">Collected</th>
                    <th className="py-2 pr-3 font-medium">Our cost</th>
                    <th className="py-2 pr-3 font-medium">Profit</th>
                    <th className="py-2 pr-3 font-medium">Paid</th>
                    <th className="py-2 font-medium">Delivered</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b last:border-b-0">
                      <td className="py-2.5 pr-3">
                        <Link
                          href={`/orders/${order.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {order.orderDate}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-3">
                        {order.companyId ? (
                          <Link
                            href={`/companies/${order.companyId}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {order.companyName ?? "—"}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2.5 pr-3">{order.leadProvider ?? "—"}</td>
                      <td className="py-2.5 pr-3">{order.quantity ?? "—"}</td>
                      <td className="py-2.5 pr-3">{formatMoney(order.collected)}</td>
                      <td className="py-2.5 pr-3">{formatMoney(order.ourCost)}</td>
                      <td className="py-2.5 pr-3">{formatMoney(order.grossProfit)}</td>
                      <td className="py-2.5 pr-3">
                        {paymentStatusLabel(order.paymentStatus)}
                        {order.paidProvider ? " · Prov. paid" : ""}
                      </td>
                      <td className="py-2.5">
                        {deliveryStatusLabel(order.deliveryStatus)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

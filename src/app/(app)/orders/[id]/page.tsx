import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { OrderDetailForm } from "@/components/orders/order-detail-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getOrderById } from "@/lib/orders/queries";
import { requireActiveMembership } from "@/lib/org/active-org";

export const metadata: Metadata = {
  title: "Order | TelesalesOS",
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

  const order = await getOrderById(id);
  if (!order) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href={`/companies/${order.companyId}`}
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          ← {order.companyName ?? "Company"}
        </Link>
        <PageHeader
          title={
            order.invoiceNumber
              ? `Order ${order.orderDate} · ${order.invoiceNumber}`
              : `Order ${order.orderDate}`
          }
          description="Purchase under this PowerBridge account. Reorders are new orders."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Order details</CardTitle>
          <CardDescription>
            Profit = Collected − Our cost (blank Our cost counts as $0). Save to refresh totals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrderDetailForm order={order} />
        </CardContent>
      </Card>
    </div>
  );
}

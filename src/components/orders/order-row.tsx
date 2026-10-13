import Link from "next/link";

import type { Order } from "@/lib/orders/queries";
import {
  formatMargin,
  formatMoney,
  paymentStatusLabel,
} from "@/lib/orders/validation";

export function OrderRow({ order }: { order: Order }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 border-b py-3 last:border-b-0">
      <div className="min-w-0">
        <Link
          href={`/orders/${order.id}`}
          className="font-medium underline-offset-4 hover:underline"
        >
          {order.orderDate}
          {order.vertical ? ` · ${order.vertical}` : ""}
          {order.leadType ? ` · ${order.leadType}` : ""}
        </Link>
        <p className="text-muted-foreground mt-0.5 text-sm">
          {[
            order.invoiceNumber ? `#${order.invoiceNumber}` : null,
            order.contactName,
            order.quantity != null ? `Qty ${order.quantity}` : null,
            paymentStatusLabel(order.paymentStatus),
          ]
            .filter(Boolean)
            .join(" · ") || "No details"}
        </p>
      </div>
      <div className="text-right text-sm">
        <p>{formatMoney(order.collected)}</p>
        <p className="text-muted-foreground">
          Profit {formatMoney(order.grossProfit)} · {formatMargin(order.grossMarginPct)}
        </p>
      </div>
    </li>
  );
}

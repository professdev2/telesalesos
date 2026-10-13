import "server-only";

import {
  listOrdersFiltered,
  type Order,
} from "@/lib/orders/queries";
import { invoiceTotal } from "@/lib/orders/validation";

export type ScoreRow = {
  key: string;
  label: string;
  orders: number;
  collected: number;
  ourCost: number;
  profit: number;
  marginPct: number | null;
};

export type QueueRow = {
  id: string;
  companyName: string;
  orderDate: string;
  amount: number | null;
  detail: string;
};

export type PowerbridgeDashboardStats = {
  orderCount: number;
  collected: number;
  ourCost: number;
  profit: number;
  marginPct: number | null;
  openRisk: number;
  arOutstanding: number;
  owedProviders: number;
  undeliveredCount: number;
  collectQueue: QueueRow[];
  providerQueue: QueueRow[];
  deliverQueue: QueueRow[];
  byProvider: ScoreRow[];
  byVertical: ScoreRow[];
};

function suggestedInvoice(order: Order): number | null {
  return invoiceTotal(order.quantity, order.costPerRecord);
}

function customerOutstanding(order: Order): number {
  const invoice = suggestedInvoice(order);
  const collected = order.collected ?? 0;
  const status = order.paymentStatus;
  if (status === "paid" || status === "refunded") return 0;
  if (status === "partial") {
    if (invoice != null) return Math.max(0, invoice - collected);
    return 0;
  }
  // pending / null
  if (invoice != null) return Math.max(0, invoice - collected);
  return collected > 0 ? 0 : 0;
}

function groupScores(
  orders: Order[],
  keyOf: (order: Order) => string | null,
): ScoreRow[] {
  const map = new Map<string, ScoreRow>();
  for (const order of orders) {
    const raw = keyOf(order)?.trim() || "—";
    const row = map.get(raw) ?? {
      key: raw,
      label: raw,
      orders: 0,
      collected: 0,
      ourCost: 0,
      profit: 0,
      marginPct: null,
    };
    row.orders += 1;
    row.collected += order.collected ?? 0;
    row.ourCost += order.ourCost ?? 0;
    row.profit += order.grossProfit ?? 0;
    map.set(raw, row);
  }
  return [...map.values()]
    .map((row) => ({
      ...row,
      marginPct:
        row.collected > 0
          ? Math.round(((row.profit / row.collected) * 100) * 10) / 10
          : null,
    }))
    .sort((a, b) => b.collected - a.collected);
}

export async function getPowerbridgeDashboardStats(range: {
  dateFrom?: string;
  dateTo?: string;
}): Promise<PowerbridgeDashboardStats> {
  const orders = await listOrdersFiltered({
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
  });

  let collected = 0;
  let ourCost = 0;
  let profit = 0;
  let arOutstanding = 0;
  let owedProviders = 0;
  let undeliveredCount = 0;

  const collectQueue: QueueRow[] = [];
  const providerQueue: QueueRow[] = [];
  const deliverQueue: QueueRow[] = [];

  for (const order of orders) {
    collected += order.collected ?? 0;
    ourCost += order.ourCost ?? 0;
    profit += order.grossProfit ?? 0;

    const outstanding = customerOutstanding(order);
    if (outstanding > 0 || order.paymentStatus === "pending" || order.paymentStatus == null) {
      if (order.paymentStatus !== "paid" && order.paymentStatus !== "refunded") {
        arOutstanding += outstanding > 0 ? outstanding : suggestedInvoice(order) ?? 0;
        collectQueue.push({
          id: order.id,
          companyName: order.companyName ?? "Company",
          orderDate: order.orderDate,
          amount: outstanding > 0 ? outstanding : suggestedInvoice(order),
          detail: order.paymentStatus === "partial" ? "Partial" : "Unpaid",
        });
      }
    }

    if (!order.paidProvider) {
      const owed = order.ourCost ?? 0;
      owedProviders += owed;
      providerQueue.push({
        id: order.id,
        companyName: order.companyName ?? "Company",
        orderDate: order.orderDate,
        amount: order.ourCost,
        detail: order.leadProvider ?? "Provider unset",
      });
    }

    if (order.deliveryStatus !== "delivered" && order.deliveryStatus !== "cancelled") {
      undeliveredCount += 1;
      deliverQueue.push({
        id: order.id,
        companyName: order.companyName ?? "Company",
        orderDate: order.orderDate,
        amount: order.collected,
        detail: order.deliveryStatus === "partial" ? "Partial" : "Not delivered",
      });
    }
  }

  const openRisk = arOutstanding + owedProviders;

  return {
    orderCount: orders.length,
    collected,
    ourCost,
    profit,
    marginPct:
      collected > 0 ? Math.round(((profit / collected) * 100) * 10) / 10 : null,
    openRisk,
    arOutstanding,
    owedProviders,
    undeliveredCount,
    collectQueue: collectQueue.slice(0, 8),
    providerQueue: providerQueue.slice(0, 8),
    deliverQueue: deliverQueue.slice(0, 8),
    byProvider: groupScores(orders, (o) => o.leadProvider),
    byVertical: groupScores(orders, (o) => o.vertical),
  };
}

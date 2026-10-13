import "server-only";

import { cache } from "react";

import { requireActiveMembership } from "@/lib/org/active-org";
import { createClient } from "@/lib/supabase/server";
import type {
  OrderDeliveryStatus,
  OrderPaymentStatus,
} from "@/lib/orders/validation";

export type Order = {
  id: string;
  companyId: string;
  companyName: string | null;
  leadId: string | null;
  contactId: string | null;
  contactName: string | null;
  orderDate: string;
  vertical: string | null;
  imo: string | null;
  leadType: string | null;
  ageRange: string | null;
  leadProvider: string | null;
  quantity: number | null;
  costPerRecord: number | null;
  extraFreeLeads: number | null;
  states: string | null;
  invoiceNumber: string | null;
  collected: number | null;
  ourCost: number | null;
  grossProfit: number | null;
  grossMarginPct: number | null;
  paymentMethod: string | null;
  paymentStatus: OrderPaymentStatus | null;
  paymentTerms: string | null;
  paidProvider: boolean;
  deliveryStatus: OrderDeliveryStatus | null;
  deliveryDate: string | null;
  notes: string | null;
  createdAt: string;
};

export type CompanyOrderTotals = {
  orderCount: number;
  lifetimeRevenue: number;
  lifetimeCost: number;
  lifetimeProfit: number;
  totalLeads: number;
};

export type OrderListFilters = {
  dateFrom?: string;
  dateTo?: string;
  leadProvider?: string;
  vertical?: string;
  paymentStatus?: string;
  paidProvider?: "yes" | "no" | "";
  delivered?: "yes" | "no" | "";
};

const ORDER_COLUMNS =
  "id, company_id, lead_id, contact_id, order_date, vertical, imo, lead_type, age_range, lead_provider, quantity, cost_per_record, extra_free_leads, states, invoice_number, collected, our_cost, gross_profit, gross_margin_pct, payment_method, payment_status, payment_terms, paid_provider, delivery_status, delivery_date, notes, created_at, companies(name), contacts(full_name)";

type OrderRow = {
  id: string;
  company_id: string;
  lead_id: string | null;
  contact_id: string | null;
  order_date: string;
  vertical: string | null;
  imo: string | null;
  lead_type: string | null;
  age_range: string | null;
  lead_provider: string | null;
  quantity: number | null;
  cost_per_record: number | string | null;
  extra_free_leads: number | null;
  states: string | null;
  invoice_number: string | null;
  collected: number | string | null;
  our_cost: number | string | null;
  gross_profit: number | string | null;
  gross_margin_pct: number | string | null;
  payment_method: string | null;
  payment_status: string | null;
  payment_terms: string | null;
  paid_provider: boolean;
  delivery_status: string | null;
  delivery_date: string | null;
  notes: string | null;
  created_at: string;
  companies: { name: string } | { name: string }[] | null;
  contacts: { full_name: string } | { full_name: string }[] | null;
};

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapPaymentStatus(value: string | null): OrderPaymentStatus | null {
  if (
    value === "pending" ||
    value === "paid" ||
    value === "partial" ||
    value === "refunded"
  ) {
    return value;
  }
  return null;
}

function mapDeliveryStatus(value: string | null): OrderDeliveryStatus | null {
  if (
    value === "pending" ||
    value === "delivered" ||
    value === "partial" ||
    value === "cancelled"
  ) {
    return value;
  }
  return null;
}

function mapOrder(row: OrderRow): Order {
  const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
  const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: company?.name ?? null,
    leadId: row.lead_id,
    contactId: row.contact_id,
    contactName: contact?.full_name ?? null,
    orderDate: row.order_date.slice(0, 10),
    vertical: row.vertical,
    imo: row.imo,
    leadType: row.lead_type,
    ageRange: row.age_range,
    leadProvider: row.lead_provider,
    quantity: row.quantity,
    costPerRecord: toNumber(row.cost_per_record),
    extraFreeLeads: row.extra_free_leads,
    states: row.states,
    invoiceNumber: row.invoice_number,
    collected: toNumber(row.collected),
    ourCost: toNumber(row.our_cost),
    grossProfit: toNumber(row.gross_profit),
    grossMarginPct: toNumber(row.gross_margin_pct),
    paymentMethod: row.payment_method,
    paymentStatus: mapPaymentStatus(row.payment_status),
    paymentTerms: row.payment_terms,
    paidProvider: row.paid_provider === true,
    deliveryStatus: mapDeliveryStatus(row.delivery_status),
    deliveryDate: row.delivery_date ? row.delivery_date.slice(0, 10) : null,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export const getOrderById = cache(async (id: string): Promise<Order | null> => {
  const membership = await requireActiveMembership();
  if (!membership.powerbridgeEnabled) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (error || !data) return null;
  return mapOrder(data as OrderRow);
});

export const listOrdersForCompany = cache(async (companyId: string): Promise<Order[]> => {
  const membership = await requireActiveMembership();
  if (!membership.powerbridgeEnabled) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("organization_id", membership.organizationId)
    .eq("company_id", companyId)
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) return [];
  return (data as OrderRow[]).map(mapOrder);
});

export const listOrdersForLead = cache(async (leadId: string): Promise<Order[]> => {
  const membership = await requireActiveMembership();
  if (!membership.powerbridgeEnabled) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("organization_id", membership.organizationId)
    .eq("lead_id", leadId)
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) return [];
  return (data as OrderRow[]).map(mapOrder);
});

/**
 * Orders for a deal: prefer lead-linked rows; if none, fall back to company orders
 * so older purchases still roll up on the deal page.
 */
export const listOrdersForLeadWithFallback = cache(
  async (leadId: string, companyId: string | null): Promise<Order[]> => {
    const byLead = await listOrdersForLead(leadId);
    if (byLead.length > 0 || !companyId) return byLead;
    return listOrdersForCompany(companyId);
  },
);

export async function listOrdersFiltered(
  filters: OrderListFilters,
): Promise<Order[]> {
  const membership = await requireActiveMembership();
  if (!membership.powerbridgeEnabled) return [];

  const supabase = await createClient();
  let query = supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("organization_id", membership.organizationId)
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.dateFrom) {
    query = query.gte("order_date", filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte("order_date", filters.dateTo);
  }
  if (filters.leadProvider?.trim()) {
    query = query.eq("lead_provider", filters.leadProvider.trim());
  }
  if (filters.vertical?.trim()) {
    query = query.eq("vertical", filters.vertical.trim());
  }
  if (
    filters.paymentStatus === "pending" ||
    filters.paymentStatus === "partial" ||
    filters.paymentStatus === "paid" ||
    filters.paymentStatus === "refunded"
  ) {
    query = query.eq("payment_status", filters.paymentStatus);
  }
  if (filters.paidProvider === "yes") {
    query = query.eq("paid_provider", true);
  } else if (filters.paidProvider === "no") {
    query = query.eq("paid_provider", false);
  }
  if (filters.delivered === "yes") {
    query = query.eq("delivery_status", "delivered");
  } else if (filters.delivered === "no") {
    query = query.neq("delivery_status", "delivered");
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return (data as OrderRow[]).map(mapOrder);
}

export function summarizeOrders(orders: Order[]): CompanyOrderTotals {
  let lifetimeRevenue = 0;
  let lifetimeCost = 0;
  let lifetimeProfit = 0;
  let totalLeads = 0;

  for (const order of orders) {
    if (order.collected != null) lifetimeRevenue += order.collected;
    if (order.ourCost != null) lifetimeCost += order.ourCost;
    if (order.grossProfit != null) lifetimeProfit += order.grossProfit;
    if (order.quantity != null) totalLeads += order.quantity;
    if (order.extraFreeLeads != null) totalLeads += order.extraFreeLeads;
  }

  return {
    orderCount: orders.length,
    lifetimeRevenue,
    lifetimeCost,
    lifetimeProfit,
    totalLeads,
  };
}

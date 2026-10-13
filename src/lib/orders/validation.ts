import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  value === "" || value === null || value === undefined ? undefined : value;

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === "" ? undefined : value));

/** Accept "0.05", ".05", "5", "5.00" — normalize leading-dot decimals. */
function normalizeDecimalInput(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (/^\.\d+$/.test(trimmed)) return `0${trimmed}`;
  return trimmed;
}

const optionalMoney = z.preprocess(
  (value) => normalizeDecimalInput(emptyToUndefined(value)),
  z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount.")
    .optional()
    .transform((value) => (value === undefined ? undefined : value)),
);

const optionalInt = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .regex(/^\d+$/, "Enter a whole number.")
    .optional()
    .transform((value) => (value === undefined ? undefined : Number(value))),
);

const optionalCpr = z.preprocess(
  (value) => normalizeDecimalInput(emptyToUndefined(value)),
  z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/, "Enter a valid cost per record.")
    .optional()
    .transform((value) => (value === undefined ? undefined : value)),
);

/** DB values; UI labels map pending → Unpaid (Jake: Customer Paid). */
export const ORDER_PAYMENT_STATUSES = [
  "pending",
  "partial",
  "paid",
  "refunded",
] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

export const ORDER_DELIVERY_STATUSES = [
  "pending",
  "delivered",
  "partial",
  "cancelled",
] as const;
export type OrderDeliveryStatus = (typeof ORDER_DELIVERY_STATUSES)[number];

export const ORDER_PAYMENT_METHODS = [
  "ACH",
  "Wire",
  "Card",
  "Zelle",
  "Check",
  "Other",
] as const;
export type OrderPaymentMethod = (typeof ORDER_PAYMENT_METHODS)[number];

export const ORDER_PAYMENT_TERMS = [
  "Prepaid",
  "Net 7",
  "Net 15",
  "Net 30",
] as const;
export type OrderPaymentTerms = (typeof ORDER_PAYMENT_TERMS)[number];

/** Fixed list for dashboard reporting (PowerBridge site verticals). */
export const ORDER_VERTICALS = [
  "ACA / health insurance",
  "Auto insurance",
  "Call center / BPO",
  "Credit repair",
  "Debt settlement",
  "Final expense",
  "Home security",
  "Home services",
  "Home warranty",
  "Legal — MVA & mass tort",
  "MCA / business funding",
  "Medicare",
  "Mortgage",
  "Solar",
  "Tax settlement",
  "Other",
] as const;
export type OrderVertical = (typeof ORDER_VERTICALS)[number];

/** Jake providers + Other for dashboard scorecards. */
export const ORDER_LEAD_PROVIDERS = [
  "USMG",
  "Klover Data",
  "Loyola Media",
  "Other",
] as const;
export type OrderLeadProvider = (typeof ORDER_LEAD_PROVIDERS)[number];

/** Lead age buckets for dashboard reporting. */
export const ORDER_AGE_RANGES = [
  "0-30",
  "30-60",
  "60-90",
  "90+",
  "Mix",
] as const;
export type OrderAgeRange = (typeof ORDER_AGE_RANGES)[number];

const optionalCompanyOrContactId = z
  .string()
  .optional()
  .transform((value) => (value === "" || value == null ? undefined : value))
  .pipe(z.uuid("Choose a valid record.").optional());

export const orderSchema = z.object({
  companyId: z.uuid("Choose a company."),
  leadId: optionalCompanyOrContactId,
  contactId: optionalCompanyOrContactId,
  orderDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid order date."),
  /** Prefer ORDER_VERTICALS; free text kept for legacy rows. */
  vertical: optionalTrimmed(80),
  imo: optionalTrimmed(160),
  leadType: optionalTrimmed(80),
  /** Prefer ORDER_AGE_RANGES; free text kept for legacy rows. */
  ageRange: optionalTrimmed(80),
  /** Prefer ORDER_LEAD_PROVIDERS; free text kept for legacy rows. */
  leadProvider: optionalTrimmed(160),
  quantity: optionalInt,
  costPerRecord: optionalCpr,
  extraFreeLeads: optionalInt,
  states: optionalTrimmed(500),
  /** Manual invoice # from QuickBooks / PDF (no PandaDoc). */
  invoiceNumber: optionalTrimmed(80),
  collected: optionalMoney,
  ourCost: optionalMoney,
  /** Prefer ORDER_PAYMENT_METHODS; free text kept for legacy rows. */
  paymentMethod: optionalTrimmed(80),
  paymentStatus: z.preprocess(
    emptyToUndefined,
    z.enum(ORDER_PAYMENT_STATUSES).optional(),
  ),
  /** Prefer ORDER_PAYMENT_TERMS; free text kept for legacy rows. */
  paymentTerms: optionalTrimmed(120),
  paidProvider: z.boolean().default(false),
  deliveryStatus: z.preprocess(
    emptyToUndefined,
    z.enum(ORDER_DELIVERY_STATUSES).optional(),
  ),
  deliveryDate: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === "" ? undefined : value))
    .pipe(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid delivery date.")
        .optional(),
    ),
  notes: optionalTrimmed(2000),
});

export const orderUpdateSchema = orderSchema.extend({
  id: z.uuid("This order reference is invalid. Reload the page."),
});

/** Jake label: Customer Paid — Unpaid / Partial / Paid. */
export function paymentStatusLabel(status: string | null | undefined): string {
  if (status === "pending") return "Unpaid";
  if (status === "paid") return "Paid";
  if (status === "partial") return "Partial";
  if (status === "refunded") return "Refunded";
  return "—";
}

export function deliveryStatusLabel(status: string | null | undefined): string {
  if (status === "pending") return "Not delivered";
  if (status === "delivered") return "Delivered";
  if (status === "partial") return "Partial";
  if (status === "cancelled") return "Cancelled";
  return "—";
}

export function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function formatMargin(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

/** Suggested invoice total = Quantity × Cost Per Record (extra free leads not billed). */
export function invoiceTotal(
  quantity: number | null | undefined,
  costPerRecord: number | null | undefined,
): number | null {
  if (quantity == null || costPerRecord == null) return null;
  if (!Number.isFinite(quantity) || !Number.isFinite(costPerRecord)) return null;
  return Math.round(quantity * costPerRecord * 100) / 100;
}

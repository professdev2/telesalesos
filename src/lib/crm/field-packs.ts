import { z } from "zod";

import type { PipelinePurpose } from "@/lib/crm/pipelines";

const emptyToUndefined = (value: unknown) =>
  value === "" || value === null || value === undefined ? undefined : value;

const optionalString = (max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.string().trim().max(max).optional(),
  );

const optionalNumber = z.preprocess((value) => {
  const cleaned = emptyToUndefined(value);
  if (cleaned === undefined) return undefined;
  if (typeof cleaned === "number") return cleaned;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : cleaned;
}, z.number().finite().optional());

const optionalDate = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.")
    .optional(),
);

const yn = z.preprocess(
  emptyToUndefined,
  z.enum(["yes", "no", "unknown"]).optional(),
);

export const salesFieldPackSchema = z.object({
  coverage_amount: optionalNumber,
  monthly_budget: optionalNumber,
  tobacco: yn,
  recommended_carrier: optionalString(120),
  quote_amount: optionalNumber,
  monthly_premium: optionalNumber,
  carrier: optionalString(120),
  product: optionalString(120),
  face_amount: optionalNumber,
  application_number: optionalString(80),
  policy_number: optionalString(80),
  application_status: optionalString(80),
  assigned_agent: optionalString(120),
  next_follow_up: optionalDate,
});

export const recruitingFieldPackSchema = z.object({
  recruit_source: optionalString(120),
  recruiter: optionalString(120),
  licensed: yn,
  resident_state: optionalString(2),
  npn: optionalString(40),
  life_licensed: yn,
  health_licensed: yn,
  exam_passed: yn,
  contracting_status: optionalString(80),
  training_completed: yn,
  ready_to_sell: yn,
  first_sale_date: optionalDate,
});

export const powerbridgeFieldPackSchema = z.object({
  company_name: optionalString(160),
  job_title: optionalString(120),
  imo: optionalString(160),
  vertical: optionalString(80),
  product_lead_type: optionalString(80),
  states_needed: optionalString(200),
  target_cpl: optionalNumber,
  quoted_cpl: optionalNumber,
  opportunity_value: optionalNumber,
  estimated_monthly_revenue: optionalNumber,
  sample_sent: yn,
  pricing_sent: yn,
  priority: z.preprocess(
    emptyToUndefined,
    z.enum(["hot", "warm", "cold"]).optional(),
  ),
  next_follow_up: optionalDate,
});

export const agentfuelFieldPackSchema = z.object({
  apply_source: optionalString(120),
  licensed: yn,
  resident_state: optionalString(80),
  monthly_amount: optionalNumber,
  payment_status: z.preprocess(
    emptyToUndefined,
    z.enum(["unpaid", "paid", "past_due", "canceled"]).optional(),
  ),
  enrolled_at: optionalDate,
  paid_at: optionalDate,
  paid_through: optionalDate,
  cutoff_at: optionalDate,
  telesalesos_access: yn,
  emberdial_access: yn,
  leads_included: yn,
});

export const retentionFieldPackSchema = z.object({
  carrier: optionalString(120),
  product: optionalString(120),
  policy_number: optionalString(80),
  premium: optionalNumber,
  policy_status: optionalString(80),
  draft_day: optionalNumber,
  last_failed_payment: optionalDate,
  days_past_due: optionalNumber,
  grace_end: optionalDate,
  retention_owner: optionalString(120),
  next_follow_up: optionalDate,
  save_outcome: optionalString(120),
});

export const FIELD_PACK_SCHEMAS = {
  sales: salesFieldPackSchema,
  recruiting: recruitingFieldPackSchema,
  powerbridge: powerbridgeFieldPackSchema,
  retention: retentionFieldPackSchema,
  agentfuel: agentfuelFieldPackSchema,
} as const;

export type FieldPack = Record<string, string | number | undefined>;

export function parseFieldPack(
  purpose: PipelinePurpose,
  raw: unknown,
): { ok: true; data: FieldPack } | { ok: false; error: z.ZodError } {
  const schema = FIELD_PACK_SCHEMAS[purpose];
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) return { ok: false, error: parsed.error };
  const data: FieldPack = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) data[key] = value as string | number;
  }
  return { ok: true, data };
}

/** Read FormData keys prefixed with `extra.` into a plain object. */
export function extraFromFormData(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("extra.") || typeof value !== "string") continue;
    out[key.slice("extra.".length)] = value;
  }
  return out;
}

export function extraToFormDefaults(extra: Record<string, unknown> | null | undefined) {
  const out: Record<string, string> = {};
  if (!extra || typeof extra !== "object") return out;
  for (const [key, value] of Object.entries(extra)) {
    if (value === null || value === undefined) continue;
    out[key] = String(value);
  }
  return out;
}

export type FieldDef = {
  key: string;
  label: string;
  kind: "text" | "number" | "date" | "yn" | "select";
  options?: { value: string; label: string }[];
};

const YN_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unknown", label: "Unknown" },
];

export const FIELD_PACK_DEFS: Record<PipelinePurpose, FieldDef[]> = {
  sales: [
    { key: "coverage_amount", label: "Coverage amount", kind: "number" },
    { key: "monthly_budget", label: "Monthly budget", kind: "number" },
    { key: "tobacco", label: "Tobacco", kind: "yn", options: YN_OPTIONS },
    { key: "recommended_carrier", label: "Recommended carrier", kind: "text" },
    { key: "quote_amount", label: "Quote amount", kind: "number" },
    { key: "monthly_premium", label: "Monthly premium", kind: "number" },
    { key: "carrier", label: "Carrier", kind: "text" },
    { key: "product", label: "Product", kind: "text" },
    { key: "face_amount", label: "Face amount", kind: "number" },
    { key: "application_number", label: "Application #", kind: "text" },
    { key: "policy_number", label: "Policy #", kind: "text" },
    { key: "application_status", label: "Application status", kind: "text" },
    { key: "assigned_agent", label: "Assigned agent", kind: "text" },
    { key: "next_follow_up", label: "Next follow-up", kind: "date" },
  ],
  recruiting: [
    { key: "recruit_source", label: "Recruit source", kind: "text" },
    { key: "recruiter", label: "Recruiter", kind: "text" },
    { key: "licensed", label: "Licensed", kind: "yn", options: YN_OPTIONS },
    { key: "resident_state", label: "Resident state", kind: "text" },
    { key: "npn", label: "NPN", kind: "text" },
    { key: "life_licensed", label: "Life licensed", kind: "yn", options: YN_OPTIONS },
    { key: "health_licensed", label: "Health licensed", kind: "yn", options: YN_OPTIONS },
    { key: "exam_passed", label: "Exam passed", kind: "yn", options: YN_OPTIONS },
    { key: "contracting_status", label: "Contracting status", kind: "text" },
    { key: "training_completed", label: "Training completed", kind: "yn", options: YN_OPTIONS },
    { key: "ready_to_sell", label: "Ready to sell", kind: "yn", options: YN_OPTIONS },
    { key: "first_sale_date", label: "First sale date", kind: "date" },
  ],
  powerbridge: [
    { key: "company_name", label: "Company name", kind: "text" },
    { key: "job_title", label: "Job title", kind: "text" },
    { key: "imo", label: "IMO / agency / parent", kind: "text" },
    { key: "vertical", label: "Vertical", kind: "text" },
    { key: "product_lead_type", label: "Product / lead type", kind: "text" },
    { key: "states_needed", label: "States needed", kind: "text" },
    { key: "target_cpl", label: "Target CPL", kind: "number" },
    { key: "quoted_cpl", label: "Quoted CPL", kind: "number" },
    { key: "opportunity_value", label: "Opportunity value", kind: "number" },
    {
      key: "estimated_monthly_revenue",
      label: "Est. monthly revenue",
      kind: "number",
    },
    { key: "sample_sent", label: "Sample sent", kind: "yn", options: YN_OPTIONS },
    { key: "pricing_sent", label: "Pricing sent", kind: "yn", options: YN_OPTIONS },
    {
      key: "priority",
      label: "Priority",
      kind: "select",
      options: [
        { value: "hot", label: "Hot" },
        { value: "warm", label: "Warm" },
        { value: "cold", label: "Cold" },
      ],
    },
    { key: "next_follow_up", label: "Next follow-up", kind: "date" },
  ],
  retention: [
    { key: "carrier", label: "Carrier", kind: "text" },
    { key: "product", label: "Product", kind: "text" },
    { key: "policy_number", label: "Policy #", kind: "text" },
    { key: "premium", label: "Premium", kind: "number" },
    { key: "policy_status", label: "Policy status", kind: "text" },
    { key: "draft_day", label: "Draft day", kind: "number" },
    { key: "last_failed_payment", label: "Last failed payment", kind: "date" },
    { key: "days_past_due", label: "Days past due", kind: "number" },
    { key: "grace_end", label: "Grace end", kind: "date" },
    { key: "retention_owner", label: "Retention owner", kind: "text" },
    { key: "next_follow_up", label: "Next follow-up", kind: "date" },
    { key: "save_outcome", label: "Save outcome", kind: "text" },
  ],
  agentfuel: [
    { key: "apply_source", label: "Apply source", kind: "text" },
    { key: "licensed", label: "Licensed", kind: "yn", options: YN_OPTIONS },
    { key: "resident_state", label: "City / state", kind: "text" },
    { key: "monthly_amount", label: "Monthly amount ($)", kind: "number" },
    {
      key: "payment_status",
      label: "Payment status",
      kind: "select",
      options: [
        { value: "unpaid", label: "Unpaid" },
        { value: "paid", label: "Paid" },
        { value: "past_due", label: "Past due" },
        { value: "canceled", label: "Canceled" },
      ],
    },
    { key: "enrolled_at", label: "Enrolled on", kind: "date" },
    { key: "paid_at", label: "Last paid on", kind: "date" },
    { key: "paid_through", label: "Paid through", kind: "date" },
    { key: "cutoff_at", label: "Cut off on", kind: "date" },
    {
      key: "telesalesos_access",
      label: "TelesalesOS access",
      kind: "yn",
      options: YN_OPTIONS,
    },
    {
      key: "emberdial_access",
      label: "Emberdial access",
      kind: "yn",
      options: YN_OPTIONS,
    },
    {
      key: "leads_included",
      label: "Leads included",
      kind: "yn",
      options: YN_OPTIONS,
    },
  ],
};

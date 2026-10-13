/**
 * Shared CRM pipeline kinds and per-purpose lead stages.
 * PowerBridge stages follow Jake 25 Sep simplified list (plan/powerbridge-media-crm.md).
 */

export const PIPELINE_PURPOSES = [
  "sales",
  "recruiting",
  "powerbridge",
  "retention",
  "agentfuel",
] as const;

export type PipelinePurpose = (typeof PIPELINE_PURPOSES)[number];

export const PIPELINE_PURPOSE_LABELS: Record<PipelinePurpose, string> = {
  sales: "Insurance Telesales",
  recruiting: "Recruiting",
  powerbridge: "PowerBridge",
  retention: "Retention",
  agentfuel: "AgentFuel",
};

const PIPELINE_PURPOSE_SET = new Set<string>(PIPELINE_PURPOSES);

export function isPipelinePurpose(value: string): value is PipelinePurpose {
  return PIPELINE_PURPOSE_SET.has(value);
}

export function normalizePipelinePurposeFilter(
  raw: string | undefined,
): PipelinePurpose | null {
  return raw && isPipelinePurpose(raw) ? raw : null;
}

export function availablePurposes(powerbridgeEnabled: boolean): PipelinePurpose[] {
  return PIPELINE_PURPOSES.filter(
    (purpose) => purpose !== "powerbridge" || powerbridgeEnabled,
  );
}

export function assertPurposeAllowed(
  purpose: PipelinePurpose,
  powerbridgeEnabled: boolean,
): string | null {
  if (purpose === "powerbridge" && !powerbridgeEnabled) {
    return "PowerBridge is not enabled for this organization.";
  }
  return null;
}

export const SALES_BOARD_STAGES = [
  "new",
  "attempted",
  "contacted",
  "appointment_scheduled",
  "needs_analysis",
  "quoted",
  "application_started",
  "submitted",
  "pending_carrier",
  "approved",
  "placed",
  "nurture",
] as const;

export const SALES_CLOSED_STAGES = [
  "not_interested",
  "unreachable",
  "dnc",
  "declined",
  "chargeback",
] as const;

export const RECRUITING_BOARD_STAGES = [
  "new",
  "attempted",
  "contacted",
  "interview_scheduled",
  "interviewed",
  "qualified",
  "pre_licensing",
  "exam_scheduled",
  "licensed",
  "contracting_started",
  "contracting_pending",
  "contracted",
  "training",
  "ready_to_sell",
  "active",
] as const;

export const RECRUITING_CLOSED_STAGES = [
  "not_interested",
  "lost",
  "inactive",
] as const;

export const RETENTION_BOARD_STAGES = [
  "pending",
  "requirements_needed",
  "issued",
  "payment_monitoring",
  "payment_failed",
  "grace_period",
  "conservation",
  "payment_arranged",
  "reinstatement_pending",
  "saved",
  "lapsed",
] as const;

export const RETENTION_CLOSED_STAGES = ["cancelled", "unable_to_save"] as const;

export const POWERBRIDGE_BOARD_STAGES = [
  "new_prospect",
  "attempting_contact",
  "contacted",
  "qualified",
  "pricing_sample_sent",
  "test_order_verbal",
  "payment_pending",
  "closed_won",
  "active_buyer",
  "paused_nurture",
] as const;

export const POWERBRIDGE_CLOSED_STAGES = ["closed_lost"] as const;

export const AGENTFUEL_BOARD_STAGES = [
  "new",
  "attempted",
  "contacted",
  "enrolled",
  "paid",
  "past_due",
] as const;

export const AGENTFUEL_CLOSED_STAGES = [
  "cut_off",
  "not_interested",
  "declined",
  "withdrawn",
] as const;

export const PIPELINE_BOARD_STAGES = {
  sales: SALES_BOARD_STAGES,
  recruiting: RECRUITING_BOARD_STAGES,
  retention: RETENTION_BOARD_STAGES,
  powerbridge: POWERBRIDGE_BOARD_STAGES,
  agentfuel: AGENTFUEL_BOARD_STAGES,
} as const;

export const PIPELINE_CLOSED_STAGES = {
  sales: SALES_CLOSED_STAGES,
  recruiting: RECRUITING_CLOSED_STAGES,
  retention: RETENTION_CLOSED_STAGES,
  powerbridge: POWERBRIDGE_CLOSED_STAGES,
  agentfuel: AGENTFUEL_CLOSED_STAGES,
} as const;

export const PIPELINE_DEFAULT_STATUS: Record<PipelinePurpose, string> = {
  sales: "new",
  recruiting: "new",
  retention: "pending",
  powerbridge: "new_prospect",
  agentfuel: "new",
};

const ALL_STATUS_SET = new Set<string>([
  ...SALES_BOARD_STAGES,
  ...SALES_CLOSED_STAGES,
  ...RECRUITING_BOARD_STAGES,
  ...RECRUITING_CLOSED_STAGES,
  ...RETENTION_BOARD_STAGES,
  ...RETENTION_CLOSED_STAGES,
  ...POWERBRIDGE_BOARD_STAGES,
  ...POWERBRIDGE_CLOSED_STAGES,
  ...AGENTFUEL_BOARD_STAGES,
  ...AGENTFUEL_CLOSED_STAGES,
]);

export type LeadStatus = string;

export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "New",
  attempted: "Attempting contact",
  contacted: "Contacted",
  appointment_scheduled: "Appointment / callback",
  needs_analysis: "Needs analysis",
  quoted: "Quoting",
  application_started: "Application started",
  submitted: "Application submitted",
  pending_carrier: "Pending carrier",
  approved: "Approved",
  placed: "Placed / in force",
  nurture: "Nurture",
  not_interested: "Not interested",
  unreachable: "Unreachable",
  dnc: "DNC",
  declined: "Declined",
  chargeback: "Chargeback / cancelled",
  interview_scheduled: "Interview scheduled",
  interviewed: "Interviewed",
  qualified: "Qualified",
  pre_licensing: "Pre-licensing",
  exam_scheduled: "Exam scheduled",
  licensed: "Licensed",
  contracting_started: "Contracting started",
  contracting_pending: "Contracting pending",
  contracted: "Contracted",
  training: "Training",
  ready_to_sell: "Ready to sell",
  active: "Active producer",
  lost: "Lost",
  inactive: "Inactive / terminated",
  pending: "Pending issue",
  requirements_needed: "Requirements needed",
  issued: "Issued",
  payment_monitoring: "Payment monitoring",
  payment_failed: "Payment failed",
  grace_period: "Grace period",
  conservation: "Conservation attempt",
  payment_arranged: "Payment arranged",
  reinstatement_pending: "Reinstatement pending",
  saved: "Saved / reinstated",
  lapsed: "Lapsed",
  cancelled: "Cancelled",
  unable_to_save: "Unable to save",
  new_prospect: "New prospect",
  attempting_contact: "Attempting contact",
  pricing_sample_sent: "Pricing / sample sent",
  test_order_verbal: "Test order / verbal commit",
  payment_pending: "Payment pending",
  closed_won: "Closed won / customer",
  active_buyer: "Active buyer",
  paused_nurture: "Paused / nurture",
  closed_lost: "Closed lost",
  enrolled: "Enrolled",
  paid: "Paid / active",
  past_due: "Past due — cut off soon",
  cut_off: "Cut off",
  withdrawn: "Withdrawn",
};

export function statusesForPurpose(purpose: PipelinePurpose): readonly string[] {
  return [...PIPELINE_BOARD_STAGES[purpose], ...PIPELINE_CLOSED_STAGES[purpose]];
}

export function boardStagesForPurpose(purpose: PipelinePurpose): readonly string[] {
  return PIPELINE_BOARD_STAGES[purpose];
}

export function isStatusForPurpose(
  purpose: PipelinePurpose,
  status: string,
): boolean {
  return statusesForPurpose(purpose).includes(status);
}

export function isLeadStatus(value: string): value is LeadStatus {
  return ALL_STATUS_SET.has(value);
}

export function normalizeLeadStatus(value: string): LeadStatus | null {
  if (isLeadStatus(value)) return value;
  if (value === "working") return "attempted";
  return null;
}

/** Remap pre–25 Sep PowerBridge stage slugs after purpose is known. */
export function remapLegacyPowerbridgeStatus(status: string): string {
  switch (status) {
    case "target":
      return "new_prospect";
    case "prospecting":
      return "attempting_contact";
    case "proposal":
      return "pricing_sample_sent";
    case "negotiation":
      return "test_order_verbal";
    case "won":
      return "closed_won";
    case "active":
      return "active_buyer";
    case "lost":
      return "closed_lost";
    default:
      return status;
  }
}

export function statusLabel(status: string): string {
  return LEAD_STATUS_LABELS[status] ?? status;
}

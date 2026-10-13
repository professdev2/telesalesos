import type { PipelinePurpose } from "@/lib/crm/pipelines";

export const SALES_DISPOSITIONS = [
  "no_answer",
  "callback",
  "not_interested",
  "already_covered",
  "cant_afford",
  "uninsurable",
  "sold",
  "bad_lead",
  "wrong_number",
  "deceased",
] as const;

export const RECRUITING_DISPOSITIONS = [
  "not_interested",
  "not_qualified",
  "no_show",
  "ghosted",
  "failed_exam",
  "declined_offer",
] as const;

export const RETENTION_DISPOSITIONS = [
  "no_answer",
  "left_vm",
  "sms_sent",
  "spoke_with_client",
  "updating_banking",
  "payment_promised",
  "carrier_called",
  "saved",
  "reinstated",
  "wants_cancellation",
  "unable_to_reach",
] as const;

export const AGENTFUEL_DISPOSITIONS = [
  "no_answer",
  "callback",
  "not_interested",
  "not_qualified",
  "no_show",
  "ghosted",
  "enrolled",
  "paid",
  "past_due",
  "canceled",
  "cut_off",
] as const;

export const POWERBRIDGE_DISPOSITIONS = [
  "no_answer",
  "left_voicemail",
  "email_sent",
  "text_sent",
  "linkedin_message",
  "spoke_interested",
  "spoke_follow_up",
  "pricing_requested",
  "pricing_sent",
  "sample_requested",
  "sample_sent",
  "ready_to_order",
  "invoice_sent",
  "call_back_later",
  "already_has_provider",
  "price_too_high",
  "no_current_need",
  "not_interested",
  "bad_contact",
] as const;

export const PIPELINE_DISPOSITIONS = {
  sales: SALES_DISPOSITIONS,
  recruiting: RECRUITING_DISPOSITIONS,
  retention: RETENTION_DISPOSITIONS,
  powerbridge: POWERBRIDGE_DISPOSITIONS,
  agentfuel: AGENTFUEL_DISPOSITIONS,
} as const;

export const DISPOSITION_LABELS: Record<string, string> = {
  no_answer: "No answer",
  callback: "Callback",
  not_interested: "Not interested",
  already_covered: "Already covered",
  cant_afford: "Can't afford",
  uninsurable: "Uninsurable",
  sold: "Sold",
  bad_lead: "Bad lead",
  wrong_number: "Wrong number",
  deceased: "Deceased",
  not_qualified: "Not qualified",
  no_show: "No show",
  ghosted: "Ghosted",
  failed_exam: "Failed exam",
  declined_offer: "Declined offer",
  left_vm: "Left voicemail",
  sms_sent: "SMS sent",
  spoke_with_client: "Spoke with client",
  updating_banking: "Updating banking",
  payment_promised: "Payment promised",
  carrier_called: "Carrier called",
  saved: "Saved",
  reinstated: "Reinstated",
  wants_cancellation: "Wants cancellation",
  unable_to_reach: "Unable to reach",
  left_voicemail: "Left voicemail",
  email_sent: "Email sent",
  text_sent: "Text sent",
  linkedin_message: "LinkedIn message",
  spoke_interested: "Spoke — interested",
  spoke_follow_up: "Spoke — follow up",
  pricing_requested: "Pricing requested",
  pricing_sent: "Pricing sent",
  sample_requested: "Sample requested",
  sample_sent: "Sample sent",
  ready_to_order: "Ready to order",
  invoice_sent: "Invoice sent",
  call_back_later: "Call back later",
  already_has_provider: "Already has provider",
  price_too_high: "Price too high",
  no_current_need: "No current need",
  bad_contact: "Bad contact",
  enrolled: "Enrolled",
  paid: "Paid",
  past_due: "Past due",
  canceled: "Canceled / stopped paying",
  cut_off: "Cut off",
};

export function dispositionsForPurpose(
  purpose: PipelinePurpose,
): readonly string[] {
  return PIPELINE_DISPOSITIONS[purpose];
}

export function isDispositionForPurpose(
  purpose: PipelinePurpose,
  disposition: string | null | undefined,
): boolean {
  if (!disposition) return true;
  return dispositionsForPurpose(purpose).includes(disposition);
}

export function dispositionLabel(value: string): string {
  return DISPOSITION_LABELS[value] ?? value;
}

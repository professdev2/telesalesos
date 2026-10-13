import { z } from "zod";

export const CALL_OUTCOMES = [
  "connected",
  "no_answer",
  "voicemail",
  "busy",
  "wrong_number",
  "disconnected",
  "callback_requested",
  "not_interested",
  "dnc",
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  connected: "Connected",
  no_answer: "No answer",
  voicemail: "Voicemail",
  busy: "Busy",
  wrong_number: "Wrong number",
  disconnected: "Disconnected",
  callback_requested: "Callback requested",
  not_interested: "Not interested",
  dnc: "DNC",
};

const CALL_OUTCOME_SET = new Set<string>(CALL_OUTCOMES);

export function isCallOutcome(value: string): value is CallOutcome {
  return CALL_OUTCOME_SET.has(value);
}

const notesField = z
  .string()
  .trim()
  .max(2000, "Notes must be 2000 characters or fewer.")
  .optional()
  .transform((value) => (value === "" ? undefined : value));

const optionalLeadId = z
  .string()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined))
  .pipe(z.uuid("Choose a valid lead.").optional());

const durationField = z
  .string()
  .optional()
  .transform((value) => {
    if (value === undefined || value.trim() === "") return undefined;
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : Number.NaN;
  })
  .pipe(
    z
      .number()
      .int()
      .min(0, "Duration cannot be negative.")
      .max(14400, "Duration must be 4 hours or less.")
      .optional(),
  );

const occurredAtField = z
  .string()
  .optional()
  .transform((value) => {
    if (!value || value.trim() === "") return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "invalid" : date.toISOString();
  })
  .superRefine((value, ctx) => {
    if (value === "invalid") {
      ctx.addIssue({ code: "custom", message: "Choose a valid date and time." });
      return;
    }
    if (!value) return;
    const date = new Date(value);
    const max = Date.now() + 24 * 60 * 60 * 1000;
    if (date.getTime() > max) {
      ctx.addIssue({ code: "custom", message: "The attempt time cannot be more than a day in the future." });
    }
  });

/**
 * Call-record fields describe one attempt. `organization_id` is absent — the
 * owning tenant comes from the session, never the form.
 */
export const callRecordSchema = z.object({
  contactId: z.uuid("Choose a contact."),
  leadId: optionalLeadId,
  outcome: z.enum(CALL_OUTCOMES).default("no_answer"),
  notes: notesField,
  occurredAt: occurredAtField,
  durationSeconds: durationField,
});

export const callRecordUpdateSchema = z.object({
  id: z.uuid("This call reference is invalid. Reload the page."),
  leadId: optionalLeadId,
  outcome: z.enum(CALL_OUTCOMES),
  notes: notesField,
  occurredAt: occurredAtField,
  durationSeconds: durationField,
});

export type CallRecordInput = z.infer<typeof callRecordSchema>;

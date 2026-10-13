import { z } from "zod";

import { isDispositionForPurpose } from "@/lib/crm/dispositions";
import {
  PIPELINE_DEFAULT_STATUS,
  PIPELINE_PURPOSES,
  isPipelinePurpose,
  isStatusForPurpose,
  normalizeLeadStatus,
  remapLegacyPowerbridgeStatus,
  statusLabel,
  statusesForPurpose,
  type LeadStatus,
  type PipelinePurpose,
} from "@/lib/crm/pipelines";

export {
  PIPELINE_PURPOSE_LABELS as LEAD_PURPOSE_LABELS,
  PIPELINE_PURPOSES as LEAD_PURPOSES,
  LEAD_STATUS_LABELS,
  boardStagesForPurpose,
  isLeadStatus,
  isPipelinePurpose as isLeadPurpose,
  normalizeLeadStatus,
  normalizePipelinePurposeFilter as normalizeLeadPurposeFilter,
  statusLabel,
  statusesForPurpose,
  type LeadStatus,
  type PipelinePurpose as LeadPurpose,
} from "@/lib/crm/pipelines";

/** @deprecated Prefer statusesForPurpose(purpose). */
export const LEAD_STATUSES = statusesForPurpose("sales");

const optionalCompanyId = z
  .string()
  .optional()
  .transform((value) => (value === "" || value == null ? undefined : value))
  .pipe(z.uuid("Choose a company.").optional());

export const leadSchema = z
  .object({
    contactId: z.uuid("Choose a contact."),
    companyId: optionalCompanyId,
    purpose: z.enum(PIPELINE_PURPOSES).default("sales"),
    status: z.string().min(1, "Choose a stage."),
    disposition: z
      .string()
      .trim()
      .max(64)
      .optional()
      .transform((value) => (value === "" ? undefined : value)),
    notes: z
      .string()
      .trim()
      .max(2000, "Notes must be 2000 characters or fewer.")
      .optional()
      .transform((value) => (value === "" ? undefined : value)),
  })
  .superRefine((data, ctx) => {
    if (!isStatusForPurpose(data.purpose, data.status)) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "That stage is not valid for this pipeline.",
      });
    }
    if (!isDispositionForPurpose(data.purpose, data.disposition)) {
      ctx.addIssue({
        code: "custom",
        path: ["disposition"],
        message: "That disposition is not valid for this pipeline.",
      });
    }
  });

export const leadUpdateSchema = z
  .object({
    id: z.uuid("This lead reference is invalid. Reload the page."),
    companyId: optionalCompanyId,
    purpose: z.enum(PIPELINE_PURPOSES),
    status: z.string().min(1, "Choose a stage."),
    disposition: z
      .string()
      .trim()
      .max(64)
      .optional()
      .transform((value) => (value === "" ? undefined : value)),
    notes: z
      .string()
      .trim()
      .max(2000, "Notes must be 2000 characters or fewer.")
      .optional()
      .transform((value) => (value === "" ? undefined : value)),
  })
  .superRefine((data, ctx) => {
    if (!isStatusForPurpose(data.purpose, data.status)) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "That stage is not valid for this pipeline.",
      });
    }
    if (!isDispositionForPurpose(data.purpose, data.disposition)) {
      ctx.addIssue({
        code: "custom",
        path: ["disposition"],
        message: "That disposition is not valid for this pipeline.",
      });
    }
  });

export const leadStatusMoveSchema = z.object({
  id: z.uuid("This lead reference is invalid. Reload the page."),
  status: z.string().min(1, "Choose a stage."),
});

export const leadArchiveSchema = z.object({
  id: z.uuid("This lead reference is invalid. Reload the page."),
});

export const leadDeleteSchema = z.object({
  id: z.uuid("This lead reference is invalid. Reload the page."),
  confirm: z
    .string()
    .trim()
    .refine((value) => value.toLowerCase() === "delete", {
      message: 'Type "delete" to confirm.',
    }),
});

export const leadCloneSchema = z.object({
  id: z.uuid("This lead reference is invalid. Reload the page."),
});

export type LeadInput = z.infer<typeof leadSchema>;

export type LeadOption = {
  id: string;
  contactId: string;
  contactName: string;
  status: LeadStatus;
  purpose: PipelinePurpose;
  createdAt: string;
  archived: boolean;
};

export function leadOptionLabel(lead: LeadOption): string {
  const added = new Date(lead.createdAt);
  const date = Number.isNaN(added.getTime())
    ? ""
    : `, added ${added.toLocaleDateString()}`;
  const archived = lead.archived ? ", archived" : "";
  return `${lead.contactName} — ${statusLabel(lead.status)}${date}${archived}`;
}

export function defaultStatusForPurpose(purpose: PipelinePurpose): string {
  return PIPELINE_DEFAULT_STATUS[purpose];
}

export function coerceLeadPurpose(value: string | null | undefined): PipelinePurpose {
  return value && isPipelinePurpose(value) ? value : "sales";
}

export function coerceLeadStatus(
  purpose: PipelinePurpose,
  value: string,
): LeadStatus | null {
  const candidate =
    purpose === "powerbridge" ? remapLegacyPowerbridgeStatus(value) : value;
  const normalized = normalizeLeadStatus(candidate);
  if (normalized && isStatusForPurpose(purpose, normalized)) return normalized;
  if (isStatusForPurpose(purpose, candidate)) return candidate;
  return null;
}

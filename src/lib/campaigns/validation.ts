import { z } from "zod";

export const CAMPAIGN_STATUSES = ["draft", "active", "paused", "completed"] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
};

const CAMPAIGN_STATUS_SET = new Set<string>(CAMPAIGN_STATUSES);

export function isCampaignStatus(value: string): value is CampaignStatus {
  return CAMPAIGN_STATUS_SET.has(value);
}

export {
  PIPELINE_PURPOSES as CAMPAIGN_PURPOSES,
  PIPELINE_PURPOSE_LABELS as CAMPAIGN_PURPOSE_LABELS,
  type PipelinePurpose as CampaignPurpose,
  isPipelinePurpose as isCampaignPurpose,
  normalizePipelinePurposeFilter as normalizeCampaignPurposeFilter,
  availablePurposes,
  assertPurposeAllowed,
} from "@/lib/crm/pipelines";

import { PIPELINE_PURPOSES } from "@/lib/crm/pipelines";

const notesField = z
  .string()
  .trim()
  .max(2000, "Notes must be 2000 characters or fewer.")
  .optional()
  .transform((value) => (value === "" ? undefined : value));

export const campaignSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter a campaign name.")
    .max(120, "Name must be 120 characters or fewer."),
  status: z.enum(CAMPAIGN_STATUSES).default("draft"),
  purpose: z.enum(PIPELINE_PURPOSES, "Choose a campaign purpose.").default("sales"),
  notes: notesField,
});

export const campaignUpdateSchema = campaignSchema.extend({
  id: z.uuid("This campaign reference is invalid. Reload the page."),
});

export const campaignArchiveSchema = z.object({
  id: z.uuid("This campaign reference is invalid. Reload the page."),
});

export const campaignContactSchema = z.object({
  campaignId: z.uuid("This campaign reference is invalid. Reload the page."),
  contactId: z.uuid("Choose a contact."),
});

export type CampaignInput = z.infer<typeof campaignSchema>;

import { z } from "zod";

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === "" ? undefined : value));

export const COMPANY_PRIORITIES = ["hot", "warm", "cold"] as const;
export type CompanyPriority = (typeof COMPANY_PRIORITIES)[number];

export const companySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a company name.")
    .max(160, "Company name must be 160 characters or fewer."),
  website: optionalTrimmed(2048),
  imo: optionalTrimmed(160),
  state: optionalTrimmed(64),
  priority: z
    .string()
    .optional()
    .transform((value) => (value === "" || value == null ? undefined : value))
    .pipe(z.enum(COMPANY_PRIORITIES).optional()),
  notes: optionalTrimmed(2000),
});

export const companyUpdateSchema = companySchema.extend({
  id: z.uuid("This company reference is invalid. Reload the page."),
});

export function priorityLabel(priority: string | null | undefined): string {
  if (priority === "hot") return "Hot";
  if (priority === "warm") return "Warm";
  if (priority === "cold") return "Cold";
  return "—";
}

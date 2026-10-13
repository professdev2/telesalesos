import { z } from "zod";

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === "" ? undefined : value));

/**
 * Contact fields describe a third party the agency talks to. None of this is a
 * credential, and `organization_id` is deliberately absent — the owning tenant
 * comes from the session, never from the submitted form.
 */
const optionalCompanyId = z
  .string()
  .optional()
  .transform((value) => (value === "" || value == null ? undefined : value))
  .pipe(z.uuid("Choose a company.").optional());

export const contactSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter the contact's name.")
    .max(120, "Name must be 120 characters or fewer."),
  companyId: optionalCompanyId,
  email: z
    .string()
    .trim()
    .max(254, "Email must be 254 characters or fewer.")
    .optional()
    .transform((value) => (value === "" ? undefined : value))
    .pipe(z.email("Enter a valid email address.").optional()),
  phone: optionalTrimmed(40),
  phoneSecondary: optionalTrimmed(40),
  dateOfBirth: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === "" ? undefined : value))
    .pipe(
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.")
        .optional(),
    ),
  gender: optionalTrimmed(40),
  timezone: optionalTrimmed(64),
  bestTimeToCall: optionalTrimmed(120),
  leadSource: optionalTrimmed(120),
  dnc: z.boolean().default(false),
  smsConsent: z.boolean().default(false),
  emailConsent: z.boolean().default(false),
  notes: z
    .string()
    .trim()
    .max(2000, "Notes must be 2000 characters or fewer.")
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
});

export const contactUpdateSchema = contactSchema.extend({
  id: z.uuid("This contact reference is invalid. Reload the page."),
});

export type ContactInput = z.infer<typeof contactSchema>;

export function checkboxFromForm(formData: FormData, name: string): boolean {
  const value = formData.get(name);
  return value === "on" || value === "true" || value === "1";
}

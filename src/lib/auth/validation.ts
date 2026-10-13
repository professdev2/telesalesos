import { z } from "zod";

/**
 * Password rules are enforced here and in Supabase Auth settings. Keep the two
 * in sync — Supabase rejects weak passwords server-side regardless of this
 * schema, and a mismatch surfaces as an unhelpful provider error.
 */
const password = z
  .string()
  .min(12, "Password must be at least 12 characters.")
  .max(72, "Password must be 72 characters or fewer.")
  .regex(/[a-z]/, "Password must contain a lowercase letter.")
  .regex(/[A-Z]/, "Password must contain an uppercase letter.")
  .regex(/[0-9]/, "Password must contain a number.");

const email = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .pipe(z.email("Enter a valid email address."))
  .transform((value) => value.toLowerCase());

export const signupSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Enter your full name.")
      .max(120, "Name must be 120 characters or fewer."),
    email,
    password,
    confirmPassword: z.string(),
    organizationName: z
      .string()
      .trim()
      .max(120, "Organization name must be 120 characters or fewer.")
      .optional()
      .transform((value) => (value === "" ? undefined : value)),
    accountType: z.enum(["individual", "team"]).default("individual"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required."),
});

export const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your full name.")
    .max(120, "Name must be 120 characters or fewer."),
});

export const organizationNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Organization name is required.")
    .max(120, "Organization name must be 120 characters or fewer."),
});

export const inviteSchema = z.object({
  email,
  role: z.enum(["admin", "member"]),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/** Shape returned by every auth server action to `useActionState`. */
export type AuthFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  inviteUrl?: string;
};

export const totpCodeSchema = z.object({
  factorId: z.string().uuid("Enrollment session is invalid. Reload the page."),
  code: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator.")),
});

export const emailOtpSchema = z.object({
  code: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your email.")),
});

export const idleFormState: AuthFormState = { status: "idle" };

export function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const flattened: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    (flattened[key] ??= []).push(issue.message);
  }
  return flattened;
}

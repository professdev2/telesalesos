/**
 * Validation checks for the contact form schemas.
 *
 * Exists because of a real bug: the create form renders no `notes` input, so
 * `FormData.get("notes")` returned `null`. Zod's `.optional()` accepts
 * `undefined` but rejects `null`, so the submission failed on a field the user
 * could not see, and the form showed "correct the highlighted fields" with
 * nothing highlighted.
 *
 *   node scripts/contact-schema-check.mjs
 */

import { contactSchema, contactUpdateSchema } from "../src/lib/contacts/validation.ts";

// Mirrors the helper in src/lib/contacts/actions.ts.
function textField(formData, name) {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

function form(entries) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

function readCreate(formData) {
  return contactSchema.safeParse({
    fullName: textField(formData, "fullName"),
    email: textField(formData, "email"),
    phone: textField(formData, "phone"),
    notes: textField(formData, "notes"),
  });
}

const results = [];
function check(name, result, expectValid) {
  const pass = result.success === expectValid;
  results.push(pass);
  const detail = result.success
    ? JSON.stringify(result.data)
    : JSON.stringify(result.error.issues.map((i) => `${i.path.join(".") || "form"}: ${i.message}`));
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
}

// The exact submission from the bug report: no notes field in the form.
check(
  "Create with name, email, phone and no notes field",
  readCreate(
    form({
      fullName: "nicolas",
      email: "nicolas@gmial.com",
      phone: "+1 (216) 405-7047",
    }),
  ),
  true,
);

check(
  "Create with only a name",
  readCreate(form({ fullName: "Solo Name" })),
  true,
);

check(
  "Create with blank optional fields",
  readCreate(form({ fullName: "Blank Optionals", email: "", phone: "", notes: "" })),
  true,
);

check(
  "Create with notes supplied",
  readCreate(form({ fullName: "With Notes", notes: "Called Tuesday." })),
  true,
);

check(
  "Create rejects a one-character name",
  readCreate(form({ fullName: "x" })),
  false,
);

check(
  "Create rejects a malformed email",
  readCreate(form({ fullName: "Bad Email", email: "not-an-email" })),
  false,
);

const updateForm = form({
  contactId: "b00174b6-bb5d-4856-bfcf-a0bf9868f01b",
  fullName: "Edited Name",
  email: "edited@example.com",
  phone: "555-0100",
});
check(
  "Update with no notes field",
  contactUpdateSchema.safeParse({
    id: textField(updateForm, "contactId"),
    fullName: textField(updateForm, "fullName"),
    email: textField(updateForm, "email"),
    phone: textField(updateForm, "phone"),
    notes: textField(updateForm, "notes"),
  }),
  true,
);

check(
  "Update rejects a non-uuid id",
  contactUpdateSchema.safeParse({ id: "not-a-uuid", fullName: "Edited Name" }),
  false,
);

const failed = results.filter((pass) => !pass).length;
console.log(
  `\n${failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`} — ${results.length} total`,
);
process.exit(failed === 0 ? 0 : 1);

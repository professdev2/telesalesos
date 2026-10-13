import { z } from "zod";

export const tagNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a tag name.")
  .max(40, "Tag must be 40 characters or fewer.")
  .regex(/^[^,]+$/, "Tags cannot contain commas.");

export const addContactTagSchema = z.object({
  contactId: z.uuid("Choose a contact."),
  name: tagNameSchema,
});

export const removeContactTagSchema = z.object({
  contactId: z.uuid("Choose a contact."),
  tagId: z.uuid("Choose a tag."),
});

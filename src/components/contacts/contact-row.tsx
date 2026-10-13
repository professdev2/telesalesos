"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleFormState, type AuthFormState } from "@/lib/auth/validation";
import { updateContactAction } from "@/lib/contacts/actions";
import type { Contact } from "@/lib/contacts/queries";
import { DeleteContactRowButton } from "@/components/contacts/delete-contact-form";

export function ContactRow({ contact }: { contact: Contact }) {
  const [editing, setEditing] = useState(false);
  const [state, setState] = useState<AuthFormState>(idleFormState);
  const [, startTransition] = useTransition();

  // Closing the editor is a consequence of the save, so it happens where the
  // result arrives rather than in an effect watching for it.
  function save(formData: FormData) {
    startTransition(async () => {
      const result = await updateContactAction(idleFormState, formData);
      setState(result);
      if (result.status === "success") setEditing(false);
    });
  }

  function startEditing() {
    setState(idleFormState);
    setEditing(true);
  }

  const details = [contact.companyName, contact.email, contact.phone]
    .filter(Boolean)
    .join(" · ");

  if (!editing) {
    return (
      <li className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
        <div className="min-w-0">
          <Link
            href={`/contacts/${contact.id}`}
            className="truncate font-medium underline-offset-4 hover:underline"
          >
            {contact.fullName}
          </Link>
          <p className="text-muted-foreground truncate text-sm">
            {details || "No contact details"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={startEditing}>
            Edit
          </Button>
          <DeleteContactRowButton contactId={contact.id} />
        </div>
      </li>
    );
  }

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <form action={save} className="space-y-4">
        <FormAlert state={state} />
        <input type="hidden" name="contactId" value={contact.id} />
        <input type="hidden" name="companyId" value={contact.companyId ?? ""} />
        <input type="hidden" name="phoneSecondary" value={contact.phoneSecondary ?? ""} />
        <input type="hidden" name="dateOfBirth" value={contact.dateOfBirth ?? ""} />
        <input type="hidden" name="gender" value={contact.gender ?? ""} />
        <input type="hidden" name="timezone" value={contact.timezone ?? ""} />
        <input type="hidden" name="bestTimeToCall" value={contact.bestTimeToCall ?? ""} />
        <input type="hidden" name="leadSource" value={contact.leadSource ?? ""} />
        <input type="hidden" name="notes" value={contact.notes ?? ""} />
        {contact.dnc ? <input type="hidden" name="dnc" value="on" /> : null}
        {contact.smsConsent ? <input type="hidden" name="smsConsent" value="on" /> : null}
        {contact.emailConsent ? (
          <input type="hidden" name="emailConsent" value="on" />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor={`fullName-${contact.id}`}>Name</Label>
            <Input
              id={`fullName-${contact.id}`}
              name="fullName"
              defaultValue={contact.fullName}
              required
              aria-describedby={`fullName-error-${contact.id}`}
            />
            <FieldError
              id={`fullName-error-${contact.id}`}
              errors={state.fieldErrors?.fullName}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`email-${contact.id}`}>Email</Label>
            <Input
              id={`email-${contact.id}`}
              name="email"
              type="email"
              defaultValue={contact.email ?? ""}
              aria-describedby={`email-error-${contact.id}`}
            />
            <FieldError id={`email-error-${contact.id}`} errors={state.fieldErrors?.email} />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`phone-${contact.id}`}>Phone</Label>
            <Input
              id={`phone-${contact.id}`}
              name="phone"
              type="tel"
              defaultValue={contact.phone ?? ""}
              aria-describedby={`phone-error-${contact.id}`}
            />
            <FieldError id={`phone-error-${contact.id}`} errors={state.fieldErrors?.phone} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <SubmitButton pendingLabel="Saving..." className="w-auto">
            Save
          </SubmitButton>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </li>
  );
}

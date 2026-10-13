"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { EntitySearchPicker } from "@/components/crm/entity-search-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { idleFormState } from "@/lib/auth/validation";
import { searchCompaniesForPickerAction } from "@/lib/crm/entity-search";
import { updateContactAction } from "@/lib/contacts/actions";
import type { Contact } from "@/lib/contacts/queries";

function contactFormKey(contact: Contact): string {
  return [
    contact.fullName,
    contact.companyId ?? "",
    contact.email ?? "",
    contact.phone ?? "",
    contact.phoneSecondary ?? "",
    contact.dateOfBirth ?? "",
    contact.gender ?? "",
    contact.timezone ?? "",
    contact.bestTimeToCall ?? "",
    contact.leadSource ?? "",
    contact.dnc ? "1" : "0",
    contact.smsConsent ? "1" : "0",
    contact.emailConsent ? "1" : "0",
    contact.notes ?? "",
  ].join("|");
}

export function ContactDetailForm({
  contact,
  showCompany = false,
}: {
  contact: Contact;
  showCompany?: boolean;
}) {
  const [state, action] = useActionState(updateContactAction, idleFormState);

  return (
    <div className="space-y-4">
      {/* Alert stays outside the keyed form so a remount after save keeps the message. */}
      <FormAlert state={state} />

      <form key={contactFormKey(contact)} action={action} className="space-y-4">
        <input type="hidden" name="contactId" value={contact.id} />

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="fullName">Name</Label>
            <Input
              id="fullName"
              name="fullName"
              defaultValue={contact.fullName}
              required
              aria-describedby="fullName-error"
            />
            <FieldError id="fullName-error" errors={state.fieldErrors?.fullName} />
          </div>

          {showCompany ? (
            <div className="space-y-2">
              <Label htmlFor="companyId">Company</Label>
              <EntitySearchPicker
                id="companyId"
                name="companyId"
                placeholder="Search companies…"
                emptyMessage="No companies match."
                clearLabel="Clear company"
                defaultOption={
                  contact.companyId && contact.companyName
                    ? { id: contact.companyId, label: contact.companyName }
                    : null
                }
                search={searchCompaniesForPickerAction}
                aria-describedby="companyId-error"
              />
              <p className="text-muted-foreground text-xs">
                <Link
                  href="/companies"
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  Add a company
                </Link>{" "}
                if it’s new.
              </p>
              <FieldError id="companyId-error" errors={state.fieldErrors?.companyId} />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={contact.email ?? ""}
              aria-describedby="email-error"
            />
            <FieldError id="email-error" errors={state.fieldErrors?.email} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={contact.phone ?? ""}
              aria-describedby="phone-error"
            />
            <FieldError id="phone-error" errors={state.fieldErrors?.phone} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phoneSecondary">Secondary phone</Label>
            <Input
              id="phoneSecondary"
              name="phoneSecondary"
              type="tel"
              defaultValue={contact.phoneSecondary ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dateOfBirth">Date of birth</Label>
            <Input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              defaultValue={contact.dateOfBirth ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gender">Gender</Label>
            <Input id="gender" name="gender" defaultValue={contact.gender ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Time zone</Label>
            <Input id="timezone" name="timezone" defaultValue={contact.timezone ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bestTimeToCall">Best time to call</Label>
            <Input
              id="bestTimeToCall"
              name="bestTimeToCall"
              defaultValue={contact.bestTimeToCall ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="leadSource">Lead source</Label>
            <Input
              id="leadSource"
              name="leadSource"
              defaultValue={contact.leadSource ?? ""}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="dnc"
              className="size-4"
              defaultChecked={contact.dnc}
            />
            DNC
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="smsConsent"
              className="size-4"
              defaultChecked={contact.smsConsent}
            />
            SMS consent
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="emailConsent"
              className="size-4"
              defaultChecked={contact.emailConsent}
            />
            Email consent
          </label>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={5}
            defaultValue={contact.notes ?? ""}
            placeholder="Call outcomes, preferences, anything the next person should know."
            aria-describedby="notes-error"
          />
          <FieldError id="notes-error" errors={state.fieldErrors?.notes} />
        </div>

        <SubmitButton pendingLabel="Saving..." className="w-auto">
          Save changes
        </SubmitButton>
      </form>
    </div>
  );
}

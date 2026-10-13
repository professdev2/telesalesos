"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { EntitySearchPicker } from "@/components/crm/entity-search-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleFormState } from "@/lib/auth/validation";
import { searchCompaniesForPickerAction } from "@/lib/crm/entity-search";
import { createContactAction } from "@/lib/contacts/actions";

export function ContactForm({
  showCompany = false,
}: {
  showCompany?: boolean;
}) {
  const [state, action] = useActionState(createContactAction, idleFormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <FormAlert state={state} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="fullName">Name</Label>
          <Input
            id="fullName"
            name="fullName"
            required
            autoComplete="off"
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
              search={searchCompaniesForPickerAction}
              aria-describedby="companyId-error"
            />
            <p className="text-muted-foreground text-xs">
              Optional.{" "}
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
            autoComplete="off"
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
            autoComplete="off"
            aria-describedby="phone-error"
          />
          <FieldError id="phone-error" errors={state.fieldErrors?.phone} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phoneSecondary">Secondary phone</Label>
          <Input id="phoneSecondary" name="phoneSecondary" type="tel" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="leadSource">Lead source</Label>
          <Input id="leadSource" name="leadSource" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="timezone">Time zone</Label>
          <Input id="timezone" name="timezone" placeholder="America/New_York" />
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="dnc" className="size-4" />
          DNC
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="smsConsent" className="size-4" />
          SMS consent
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="emailConsent" className="size-4" />
          Email consent
        </label>
      </div>

      <SubmitButton pendingLabel="Adding..." className="w-auto">
        Add contact
      </SubmitButton>
    </form>
  );
}

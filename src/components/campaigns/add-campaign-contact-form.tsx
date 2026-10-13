"use client";

import { useActionState, useEffect, useRef } from "react";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { idleFormState } from "@/lib/auth/validation";
import { addCampaignContactAction } from "@/lib/campaigns/actions";

export function AddCampaignContactForm({
  campaignId,
  contacts,
}: {
  campaignId: string;
  contacts: { id: string; fullName: string }[];
}) {
  const [state, action] = useActionState(addCampaignContactAction, idleFormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state]);

  if (contacts.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Every contact in this organization is already on this campaign, or this organization has
        no contacts yet.
      </p>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <FormAlert state={state} />
      <input type="hidden" name="campaignId" value={campaignId} />

      <div className="space-y-2">
        <Label htmlFor="contactId">Contact</Label>
        <NativeSelect
          id="contactId"
          name="contactId"
          required
          defaultValue=""
          aria-describedby="contactId-error"
        >
          <option value="" disabled>
            Choose a contact
          </option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.fullName}
            </option>
          ))}
        </NativeSelect>
        <FieldError id="contactId-error" errors={state.fieldErrors?.contactId} />
      </div>

      <SubmitButton pendingLabel="Adding..." className="w-auto">
        Add to campaign
      </SubmitButton>
    </form>
  );
}

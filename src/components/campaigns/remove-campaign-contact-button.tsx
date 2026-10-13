"use client";

import { useActionState } from "react";

import { FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { idleFormState } from "@/lib/auth/validation";
import { removeCampaignContactAction } from "@/lib/campaigns/actions";

export function RemoveCampaignContactButton({
  campaignId,
  contactId,
}: {
  campaignId: string;
  contactId: string;
}) {
  const [state, action] = useActionState(removeCampaignContactAction, idleFormState);

  return (
    <form action={action} className="space-y-2">
      <FormAlert state={state} />
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="contactId" value={contactId} />
      <SubmitButton pendingLabel="Removing..." variant="outline" size="sm" className="w-auto">
        Remove
      </SubmitButton>
    </form>
  );
}

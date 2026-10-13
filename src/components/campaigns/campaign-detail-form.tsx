"use client";

import { useActionState } from "react";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { idleFormState } from "@/lib/auth/validation";
import { archiveCampaignAction, updateCampaignAction } from "@/lib/campaigns/actions";
import type { Campaign } from "@/lib/campaigns/queries";
import {
  CAMPAIGN_PURPOSE_LABELS,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUSES,
  type CampaignPurpose,
} from "@/lib/campaigns/validation";

export function CampaignDetailForm({
  campaign,
  purposes,
}: {
  campaign: Campaign;
  purposes: CampaignPurpose[];
}) {
  const [state, action] = useActionState(updateCampaignAction, idleFormState);
  const [archiveState, archiveAction] = useActionState(archiveCampaignAction, idleFormState);
  const purposeOptions = purposes.includes(campaign.purpose)
    ? purposes
    : [...purposes, campaign.purpose];

  if (campaign.archivedAt) {
    return (
      <p className="text-muted-foreground text-sm">
        This campaign is archived. Contacts on it stay linked so history is not silently
        removed.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <form
        key={`${campaign.name}|${campaign.status}|${campaign.purpose}|${campaign.notes}`}
        action={action}
        className="space-y-4"
      >
        <FormAlert state={state} />
        <input type="hidden" name="campaignId" value={campaign.id} />

        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            required
            defaultValue={campaign.name}
            aria-describedby="name-error"
          />
          <FieldError id="name-error" errors={state.fieldErrors?.name} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="purpose">Purpose</Label>
          <NativeSelect
            id="purpose"
            name="purpose"
            required
            defaultValue={campaign.purpose}
            aria-describedby="purpose-error"
          >
            {purposeOptions.map((purpose) => (
              <option key={purpose} value={purpose}>
                {CAMPAIGN_PURPOSE_LABELS[purpose]}
              </option>
            ))}
          </NativeSelect>
          <FieldError id="purpose-error" errors={state.fieldErrors?.purpose} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <NativeSelect
            id="status"
            name="status"
            required
            defaultValue={campaign.status}
            aria-describedby="status-error"
          >
            {CAMPAIGN_STATUSES.map((status) => (
              <option key={status} value={status}>
                {CAMPAIGN_STATUS_LABELS[status]}
              </option>
            ))}
          </NativeSelect>
          <FieldError id="status-error" errors={state.fieldErrors?.status} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={5}
            defaultValue={campaign.notes ?? ""}
            aria-describedby="notes-error"
          />
          <FieldError id="notes-error" errors={state.fieldErrors?.notes} />
        </div>

        <SubmitButton pendingLabel="Saving..." className="w-auto">
          Save changes
        </SubmitButton>
      </form>

      <form action={archiveAction} className="space-y-2">
        <FormAlert state={archiveState} />
        <input type="hidden" name="campaignId" value={campaign.id} />
        <SubmitButton pendingLabel="Archiving..." className="w-auto" variant="outline">
          Archive
        </SubmitButton>
      </form>
    </div>
  );
}

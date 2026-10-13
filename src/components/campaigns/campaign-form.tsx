"use client";

import { useActionState, useEffect, useRef } from "react";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { idleFormState } from "@/lib/auth/validation";
import { createCampaignAction } from "@/lib/campaigns/actions";
import {
  CAMPAIGN_PURPOSE_LABELS,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUSES,
  type CampaignPurpose,
} from "@/lib/campaigns/validation";

export function CampaignForm({
  defaultPurpose = "sales",
  purposes,
}: {
  defaultPurpose?: CampaignPurpose;
  purposes: CampaignPurpose[];
}) {
  const [state, action] = useActionState(createCampaignAction, idleFormState);
  const formRef = useRef<HTMLFormElement>(null);
  const initialPurpose = purposes.includes(defaultPurpose)
    ? defaultPurpose
    : (purposes[0] ?? "sales");

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
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required aria-describedby="name-error" />
          <FieldError id="name-error" errors={state.fieldErrors?.name} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="purpose">Purpose</Label>
          <NativeSelect
            key={initialPurpose}
            id="purpose"
            name="purpose"
            required
            defaultValue={initialPurpose}
            aria-describedby="purpose-error"
          >
            {purposes.map((purpose) => (
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
            defaultValue="draft"
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
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" rows={3} aria-describedby="notes-error" />
        <FieldError id="notes-error" errors={state.fieldErrors?.notes} />
      </div>

      <SubmitButton pendingLabel="Adding..." className="w-auto">
        Add campaign
      </SubmitButton>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { idleFormState } from "@/lib/auth/validation";
import { updateCallRecordAction } from "@/lib/calls/actions";
import { toDatetimeLocalValue } from "@/lib/calls/format";
import type { CallRecord } from "@/lib/calls/queries";
import { CALL_OUTCOME_LABELS, CALL_OUTCOMES } from "@/lib/calls/validation";
import { leadOptionLabel, type LeadOption } from "@/lib/leads/validation";

export function CallDetailForm({
  record,
  leads,
}: {
  record: CallRecord;
  leads: LeadOption[];
}) {
  const [state, action] = useActionState(updateCallRecordAction, idleFormState);
  // Held in state so the stored instant is converted to a wall-clock value
  // once, instead of once per render.
  const [occurredAt, setOccurredAt] = useState(() =>
    toDatetimeLocalValue(record.occurredAt),
  );
  const matchingLeads = leads.filter((lead) => lead.contactId === record.contactId);

  return (
    <form
      key={`${record.outcome}|${record.notes}|${record.occurredAt}|${record.leadId}`}
      action={action}
      className="space-y-4"
    >
      <FormAlert state={state} />
      <input type="hidden" name="callRecordId" value={record.id} />

      <div className="space-y-2">
        <Label htmlFor="leadId">Lead (optional)</Label>
        <NativeSelect
          id="leadId"
          name="leadId"
          defaultValue={record.leadId ?? ""}
          aria-describedby="leadId-error"
        >
          <option value="">No lead</option>
          {matchingLeads.map((lead) => (
            <option key={lead.id} value={lead.id}>
              {leadOptionLabel(lead)}
            </option>
          ))}
        </NativeSelect>
        <FieldError id="leadId-error" errors={state.fieldErrors?.leadId} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="outcome">Outcome</Label>
          <NativeSelect
            id="outcome"
            name="outcome"
            required
            defaultValue={record.outcome}
            aria-describedby="outcome-error"
          >
            {CALL_OUTCOMES.map((outcome) => (
              <option key={outcome} value={outcome}>
                {CALL_OUTCOME_LABELS[outcome]}
              </option>
            ))}
          </NativeSelect>
          <FieldError id="outcome-error" errors={state.fieldErrors?.outcome} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="occurredAt">When</Label>
          <Input
            id="occurredAt"
            name="occurredAt"
            type="datetime-local"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
            // The server renders its own timezone; the browser then renders
            // the viewer's. That difference is expected here.
            suppressHydrationWarning
            aria-describedby="occurredAt-error"
          />
          <FieldError id="occurredAt-error" errors={state.fieldErrors?.occurredAt} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="durationSeconds">Duration in seconds (optional)</Label>
        <Input
          id="durationSeconds"
          name="durationSeconds"
          type="number"
          min={0}
          max={14400}
          inputMode="numeric"
          defaultValue={record.durationSeconds ?? ""}
          aria-describedby="durationSeconds-error"
        />
        <FieldError id="durationSeconds-error" errors={state.fieldErrors?.durationSeconds} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={5}
          defaultValue={record.notes ?? ""}
          aria-describedby="notes-error"
        />
        <FieldError id="notes-error" errors={state.fieldErrors?.notes} />
      </div>

      <SubmitButton pendingLabel="Saving..." className="w-auto">
        Save changes
      </SubmitButton>
    </form>
  );
}

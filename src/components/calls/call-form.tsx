"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { EntitySearchPicker } from "@/components/crm/entity-search-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { idleFormState } from "@/lib/auth/validation";
import { createCallRecordAction } from "@/lib/calls/actions";
import { toDatetimeLocalValue } from "@/lib/calls/format";
import { CALL_OUTCOME_LABELS, CALL_OUTCOMES } from "@/lib/calls/validation";
import { searchContactsForPickerAction } from "@/lib/crm/entity-search";
import { leadOptionLabel, type LeadOption } from "@/lib/leads/validation";

export function CallForm({
  leads,
  defaultContactId,
  defaultLeadId,
}: {
  leads: LeadOption[];
  defaultContactId?: string;
  defaultLeadId?: string;
}) {
  const [state, action] = useActionState(createCallRecordAction, idleFormState);
  const [formKey, setFormKey] = useState(0);
  const [contactId, setContactId] = useState(defaultContactId ?? "");
  // "Now" is read once per mount rather than per render. Picking a contact
  // re-renders this form, and a fresh clock reading each time would keep
  // changing an uncontrolled field's default value.
  const [occurredAt, setOccurredAt] = useState(toDatetimeLocalValue);

  useEffect(() => {
    if (state.status === "success") {
      setFormKey((key) => key + 1);
      setContactId(defaultContactId ?? "");
      setOccurredAt(toDatetimeLocalValue());
    }
  }, [state, defaultContactId]);

  const matchingLeads = useMemo(
    () => leads.filter((lead) => lead.contactId === contactId),
    [leads, contactId],
  );

  return (
    <form key={formKey} action={action} className="space-y-4">
      <FormAlert state={state} />

      {defaultContactId ? (
        <input type="hidden" name="contactId" value={defaultContactId} />
      ) : (
        <div className="space-y-2">
          <Label htmlFor="contactId">Contact</Label>
          <EntitySearchPicker
            id="contactId"
            name="contactId"
            required
            placeholder="Search by name, phone, or email…"
            emptyMessage="No contacts match. Add one under Contacts first."
            search={searchContactsForPickerAction}
            onOptionChange={(option) => setContactId(option?.id ?? "")}
            aria-describedby="contactId-error"
          />
          <p className="text-muted-foreground text-xs">
            Need a new person?{" "}
            <Link href="/contacts" className="text-foreground underline-offset-4 hover:underline">
              Add a contact
            </Link>
            .
          </p>
          <FieldError id="contactId-error" errors={state.fieldErrors?.contactId} />
        </div>
      )}

      {defaultLeadId ? (
        <input type="hidden" name="leadId" value={defaultLeadId} />
      ) : (
        <div className="space-y-2">
          <Label htmlFor="leadId">Lead (optional)</Label>
          <NativeSelect
            id="leadId"
            name="leadId"
            defaultValue=""
            disabled={!contactId}
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
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="outcome">Outcome</Label>
          <NativeSelect
            id="outcome"
            name="outcome"
            required
            defaultValue="no_answer"
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
            // The server renders its own clock and timezone; the browser then
            // renders the viewer's. That difference is expected here.
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
          aria-describedby="durationSeconds-error"
        />
        <FieldError id="durationSeconds-error" errors={state.fieldErrors?.durationSeconds} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" rows={3} aria-describedby="notes-error" />
        <FieldError id="notes-error" errors={state.fieldErrors?.notes} />
      </div>

      <SubmitButton pendingLabel="Saving..." className="w-auto">
        Log attempt
      </SubmitButton>
    </form>
  );
}

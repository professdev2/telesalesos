"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { EntitySearchPicker } from "@/components/crm/entity-search-picker";
import { LeadFieldPackFields } from "@/components/leads/lead-field-pack";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { idleFormState } from "@/lib/auth/validation";
import {
  dispositionLabel,
  dispositionsForPurpose,
} from "@/lib/crm/dispositions";
import { searchCompaniesForPickerAction } from "@/lib/crm/entity-search";
import { extraToFormDefaults } from "@/lib/crm/field-packs";
import { Input } from "@/components/ui/input";
import {
  archiveLeadAction,
  cloneLeadAction,
  deleteLeadAction,
  updateLeadAction,
} from "@/lib/leads/actions";
import type { Lead } from "@/lib/leads/queries";
import {
  LEAD_PURPOSE_LABELS,
  defaultStatusForPurpose,
  statusLabel,
  statusesForPurpose,
  type LeadPurpose,
} from "@/lib/leads/validation";

export function LeadDetailForm({
  lead,
  purposes,
  showCompany = false,
  canDelete = false,
}: {
  lead: Lead;
  purposes: LeadPurpose[];
  showCompany?: boolean;
  /** Owner/Admin hard-delete. */
  canDelete?: boolean;
}) {
  const [state, action] = useActionState(updateLeadAction, idleFormState);
  const [archiveState, archiveAction] = useActionState(archiveLeadAction, idleFormState);
  const [deleteState, deleteAction] = useActionState(deleteLeadAction, idleFormState);
  const [cloneState, cloneAction] = useActionState(cloneLeadAction, idleFormState);
  const purposeOptions = purposes.includes(lead.purpose)
    ? purposes
    : [...purposes, lead.purpose];
  const [purpose, setPurpose] = useState<LeadPurpose>(lead.purpose);
  const stages = useMemo(() => statusesForPurpose(purpose), [purpose]);
  const dispositions = useMemo(() => dispositionsForPurpose(purpose), [purpose]);
  const extraDefaults = extraToFormDefaults(lead.extra);
  const extraKey = JSON.stringify(extraDefaults);

  if (lead.archivedAt) {
    return (
      <p className="text-muted-foreground text-sm">
        This lead is archived. It stays attached to the contact and is hidden from the default
        list.
      </p>
    );
  }

  const statusDefault =
    purpose === lead.purpose && stages.includes(lead.status)
      ? lead.status
      : defaultStatusForPurpose(purpose);

  const dispositionDefault =
    purpose === lead.purpose && lead.disposition && dispositions.includes(lead.disposition)
      ? lead.disposition
      : "";

  return (
    <div className="space-y-8">
      <form
        key={`${lead.purpose}|${lead.status}|${lead.disposition}|${lead.notes}|${extraKey}`}
        action={action}
        className="space-y-4"
      >
        <FormAlert state={state} />
        <input type="hidden" name="leadId" value={lead.id} />

        <div className="grid gap-4 sm:grid-cols-3">
          {showCompany ? (
            <div className="space-y-2 sm:col-span-3 lg:col-span-1">
              <Label htmlFor="companyId">Company</Label>
              <EntitySearchPicker
                id="companyId"
                name="companyId"
                placeholder="Search companies…"
                emptyMessage="No companies match."
                clearLabel="Clear company"
                defaultOption={
                  lead.companyId && lead.companyName
                    ? { id: lead.companyId, label: lead.companyName }
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
            <Label htmlFor="purpose">Pipeline</Label>
            <NativeSelect
              id="purpose"
              name="purpose"
              required
              value={purpose}
              onChange={(event) => setPurpose(event.target.value as LeadPurpose)}
              aria-describedby="purpose-error"
            >
              {purposeOptions.map((value) => (
                <option key={value} value={value}>
                  {LEAD_PURPOSE_LABELS[value]}
                </option>
              ))}
            </NativeSelect>
            <FieldError id="purpose-error" errors={state.fieldErrors?.purpose} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Stage</Label>
            <NativeSelect
              key={`${purpose}:${statusDefault}`}
              id="status"
              name="status"
              required
              defaultValue={statusDefault}
              aria-describedby="status-error"
            >
              {stages.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </NativeSelect>
            <FieldError id="status-error" errors={state.fieldErrors?.status} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="disposition">Disposition</Label>
            <NativeSelect
              key={`${purpose}:disp:${dispositionDefault}`}
              id="disposition"
              name="disposition"
              defaultValue={dispositionDefault}
              aria-describedby="disposition-error"
            >
              <option value="">—</option>
              {dispositions.map((value) => (
                <option key={value} value={value}>
                  {dispositionLabel(value)}
                </option>
              ))}
            </NativeSelect>
            <FieldError
              id="disposition-error"
              errors={state.fieldErrors?.disposition}
            />
          </div>
        </div>

        <LeadFieldPackFields
          key={purpose}
          purpose={purpose}
          defaults={purpose === lead.purpose ? extraDefaults : {}}
        />

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={5}
            defaultValue={lead.notes ?? ""}
            aria-describedby="notes-error"
          />
          <FieldError id="notes-error" errors={state.fieldErrors?.notes} />
        </div>

        <SubmitButton pendingLabel="Saving..." className="w-auto">
          Save changes
        </SubmitButton>
      </form>

      <form action={cloneAction} className="space-y-2">
        <FormAlert state={cloneState} />
        <input type="hidden" name="leadId" value={lead.id} />
        <p className="text-muted-foreground text-sm">
          Opens a new opportunity on the same contact
          {lead.companyName ? ` and ${lead.companyName}` : ""}. Stage resets to the pipeline
          default.
        </p>
        <SubmitButton pendingLabel="Cloning…" className="w-auto" variant="outline">
          Clone opportunity
        </SubmitButton>
      </form>

      <form action={archiveAction} className="space-y-2">
        <FormAlert state={archiveState} />
        <input type="hidden" name="leadId" value={lead.id} />
        <p className="text-muted-foreground text-sm">
          Hides this lead from the default list. Contact and order history stay.
        </p>
        <SubmitButton pendingLabel="Archiving..." className="w-auto" variant="outline">
          Archive
        </SubmitButton>
      </form>

      {canDelete ? (
        <form action={deleteAction} className="space-y-2 border-t pt-6">
          <FormAlert state={deleteState} />
          <input type="hidden" name="leadId" value={lead.id} />
          <p className="text-muted-foreground text-sm">
            Permanently deletes this opportunity. Company orders remain (unlinked from this
            deal). Type <span className="text-foreground font-medium">delete</span> to
            confirm.
          </p>
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="confirmDelete">Confirm</Label>
            <Input
              id="confirmDelete"
              name="confirm"
              autoComplete="off"
              placeholder="delete"
              aria-describedby="confirm-error"
            />
            <FieldError id="confirm-error" errors={deleteState.fieldErrors?.confirm} />
          </div>
          <SubmitButton
            pendingLabel="Deleting…"
            className="w-auto"
            variant="destructive"
          >
            Delete lead
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

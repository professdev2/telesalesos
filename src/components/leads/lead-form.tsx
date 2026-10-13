"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import {
  EntitySearchPicker,
  type EntitySearchOption,
} from "@/components/crm/entity-search-picker";
import { LeadFieldPackFields } from "@/components/leads/lead-field-pack";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { idleFormState } from "@/lib/auth/validation";
import {
  dispositionLabel,
  dispositionsForPurpose,
} from "@/lib/crm/dispositions";
import {
  searchCompaniesForPickerAction,
  searchContactsForPickerAction,
} from "@/lib/crm/entity-search";
import { createLeadAction } from "@/lib/leads/actions";
import {
  LEAD_PURPOSE_LABELS,
  defaultStatusForPurpose,
  statusLabel,
  statusesForPurpose,
  type LeadPurpose,
} from "@/lib/leads/validation";

export function LeadForm({
  showCompany = false,
  purposes,
  defaultPurpose = "sales",
}: {
  showCompany?: boolean;
  purposes: LeadPurpose[];
  defaultPurpose?: LeadPurpose;
}) {
  const [state, action] = useActionState(createLeadAction, idleFormState);
  const initialPurpose = purposes.includes(defaultPurpose)
    ? defaultPurpose
    : (purposes[0] ?? "sales");
  const [purpose, setPurpose] = useState<LeadPurpose>(initialPurpose);
  const [companyOption, setCompanyOption] = useState<EntitySearchOption | null>(null);
  const stages = useMemo(() => statusesForPurpose(purpose), [purpose]);
  const dispositions = useMemo(() => dispositionsForPurpose(purpose), [purpose]);

  function handleContactChange(option: EntitySearchOption | null) {
    if (!showCompany || !option?.companyId || !option.companyName) return;
    setCompanyOption({
      id: option.companyId,
      label: option.companyName,
    });
  }

  return (
    <form
      key={state.status === "success" ? `ok-${state.message}` : "lead-form"}
      action={action}
      className="space-y-4"
    >
      <FormAlert state={state} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="contactId">Contact</Label>
          <EntitySearchPicker
            id="contactId"
            name="contactId"
            required
            placeholder="Search by name, phone, or email…"
            emptyMessage="No contacts match. Add one under Contacts first."
            search={searchContactsForPickerAction}
            onOptionChange={handleContactChange}
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

        {showCompany ? (
          <div className="space-y-2">
            <Label htmlFor="companyId">Company</Label>
            <EntitySearchPicker
              id="companyId"
              name="companyId"
              placeholder="Search companies…"
              emptyMessage="No companies match."
              clearLabel="Clear company"
              defaultOption={companyOption}
              search={searchCompaniesForPickerAction}
              onOptionChange={setCompanyOption}
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
          <Label htmlFor="purpose">Pipeline</Label>
          <NativeSelect
            id="purpose"
            name="purpose"
            required
            value={purpose}
            onChange={(event) => setPurpose(event.target.value as LeadPurpose)}
            aria-describedby="purpose-error"
          >
            {purposes.map((value) => (
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
            key={purpose}
            id="status"
            name="status"
            required
            defaultValue={defaultStatusForPurpose(purpose)}
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
            key={`disp-${purpose}`}
            id="disposition"
            name="disposition"
            defaultValue=""
            aria-describedby="disposition-error"
          >
            <option value="">—</option>
            {dispositions.map((value) => (
              <option key={value} value={value}>
                {dispositionLabel(value)}
              </option>
            ))}
          </NativeSelect>
          <FieldError id="disposition-error" errors={state.fieldErrors?.disposition} />
        </div>
      </div>

      <LeadFieldPackFields key={purpose} purpose={purpose} />

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" rows={3} aria-describedby="notes-error" />
        <FieldError id="notes-error" errors={state.fieldErrors?.notes} />
      </div>

      <SubmitButton pendingLabel="Adding..." className="w-auto">
        Add lead
      </SubmitButton>
    </form>
  );
}

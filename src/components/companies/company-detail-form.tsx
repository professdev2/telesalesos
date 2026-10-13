"use client";

import { useActionState } from "react";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { idleFormState } from "@/lib/auth/validation";
import {
  deleteCompanyAction,
  updateCompanyAction,
} from "@/lib/companies/actions";
import type { Company } from "@/lib/companies/queries";
import { COMPANY_PRIORITIES, priorityLabel } from "@/lib/companies/validation";

export function CompanyDetailForm({ company }: { company: Company }) {
  const [state, action] = useActionState(updateCompanyAction, idleFormState);
  const [deleteState, deleteAction] = useActionState(deleteCompanyAction, idleFormState);

  return (
    <div className="space-y-8">
      <form
        key={`${company.name}|${company.website}|${company.imo}|${company.state}|${company.priority}|${company.notes}`}
        action={action}
        className="space-y-4"
      >
        <FormAlert state={state} />
        <input type="hidden" name="companyId" value={company.id} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="name">Company name</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={company.name}
              aria-describedby="name-error"
            />
            <FieldError id="name-error" errors={state.fieldErrors?.name} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              name="website"
              type="url"
              defaultValue={company.website ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="imo">IMO / Agency / Parent</Label>
            <Input id="imo" name="imo" defaultValue={company.imo ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="state">State</Label>
            <Input id="state" name="state" defaultValue={company.state ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <NativeSelect
              id="priority"
              name="priority"
              defaultValue={company.priority ?? ""}
            >
              <option value="">—</option>
              {COMPANY_PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {priorityLabel(value)}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" rows={3} defaultValue={company.notes ?? ""} />
        </div>

        <SubmitButton pendingLabel="Saving…">Save company</SubmitButton>
      </form>

      <form action={deleteAction} className="border-t pt-6">
        <FormAlert state={deleteState} />
        <input type="hidden" name="companyId" value={company.id} />
        <p className="text-muted-foreground mb-3 text-sm">
          Deleting a company clears the link on contacts and leads; it does not delete those
          records.
        </p>
        <SubmitButton variant="destructive" pendingLabel="Deleting…">
          Delete company
        </SubmitButton>
      </form>
    </div>
  );
}

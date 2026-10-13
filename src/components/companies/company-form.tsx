"use client";

import { useActionState, useEffect, useRef } from "react";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { idleFormState } from "@/lib/auth/validation";
import { createCompanyAction } from "@/lib/companies/actions";
import { COMPANY_PRIORITIES, priorityLabel } from "@/lib/companies/validation";

export function CompanyForm() {
  const [state, action] = useActionState(createCompanyAction, idleFormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <FormAlert state={state} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="name">Company name</Label>
          <Input
            id="name"
            name="name"
            required
            autoComplete="off"
            aria-describedby="name-error"
          />
          <FieldError id="name-error" errors={state.fieldErrors?.name} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="website">Website</Label>
          <Input id="website" name="website" type="url" placeholder="https://" />
          <FieldError id="website-error" errors={state.fieldErrors?.website} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="imo">IMO / Agency / Parent</Label>
          <Input id="imo" name="imo" aria-describedby="imo-error" />
          <FieldError id="imo-error" errors={state.fieldErrors?.imo} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="state">State</Label>
          <Input id="state" name="state" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="priority">Priority</Label>
          <NativeSelect id="priority" name="priority" defaultValue="">
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
        <Textarea id="notes" name="notes" rows={2} />
      </div>

      <SubmitButton pendingLabel="Adding…">Add company</SubmitButton>
    </form>
  );
}

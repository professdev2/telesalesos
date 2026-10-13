"use client";

import { useActionState } from "react";

import { FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { idleFormState } from "@/lib/auth/validation";
import { convertOrganizationToTeamAction } from "@/lib/org/actions";

export function ConvertToTeamForm() {
  const [state, action] = useActionState(convertOrganizationToTeamAction, idleFormState);

  return (
    <form action={action} className="space-y-4">
      <FormAlert state={state} />
      <p className="text-muted-foreground text-sm">
        Individual organizations cannot invite anyone. Conversion is one-way —
        you cannot turn a team back into an individual account.
      </p>
      <SubmitButton pendingLabel="Converting..." className="w-auto">
        Convert to team
      </SubmitButton>
    </form>
  );
}

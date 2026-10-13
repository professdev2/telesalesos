"use client";

import { useActionState } from "react";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleFormState } from "@/lib/auth/validation";
import { updateOrganizationNameAction } from "@/lib/org/actions";

export function OrganizationNameForm({
  name,
  canEdit,
}: {
  name: string;
  canEdit: boolean;
}) {
  const [state, action] = useActionState(updateOrganizationNameAction, idleFormState);

  return (
    <form action={action} className="space-y-4">
      <FormAlert state={state} />

      <div className="space-y-2">
        <Label htmlFor="name">Organization name</Label>
        {/* Keyed so a saved value remounts the field instead of changing the
            default of an already-initialised uncontrolled input. */}
        <Input
          key={name}
          id="name"
          name="name"
          defaultValue={name}
          required
          disabled={!canEdit}
          aria-describedby="name-error"
        />
        <FieldError id="name-error" errors={state.fieldErrors?.name} />
      </div>

      {canEdit ? (
        <SubmitButton pendingLabel="Saving..." className="w-auto">
          Save name
        </SubmitButton>
      ) : (
        <p className="text-muted-foreground text-sm">
          Only owners and admins can rename this organization.
        </p>
      )}
    </form>
  );
}

"use client";

import { useActionState } from "react";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleFormState } from "@/lib/auth/validation";
import { updateProfileAction } from "@/lib/org/actions";

export function ProfileForm({
  fullName,
  email,
}: {
  fullName: string | null;
  email: string | null;
}) {
  const [state, action] = useActionState(updateProfileAction, idleFormState);

  return (
    <form action={action} className="space-y-4">
      <FormAlert state={state} />

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email ?? ""} disabled readOnly />
        <p className="text-muted-foreground text-xs">
          Email is the sign-in identity and cannot be changed here.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        {/* Keyed so a saved value remounts the field instead of changing the
            default of an already-initialised uncontrolled input. */}
        <Input
          key={fullName ?? ""}
          id="fullName"
          name="fullName"
          defaultValue={fullName ?? ""}
          autoComplete="name"
          required
          aria-describedby="fullName-error"
        />
        <FieldError id="fullName-error" errors={state.fieldErrors?.fullName} />
      </div>

      <SubmitButton pendingLabel="Saving..." className="w-auto">
        Save profile
      </SubmitButton>
    </form>
  );
}

"use client";

import { useActionState } from "react";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeMfaRecoveryAction } from "@/lib/auth/actions";
import { idleFormState } from "@/lib/auth/validation";

export function MfaRecoveryConfirmForm() {
  const [state, action] = useActionState(completeMfaRecoveryAction, idleFormState);

  return (
    <form action={action} className="space-y-4">
      <FormAlert state={state} />

      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-describedby="password-hint password-error"
        />
        <p id="password-hint" className="text-muted-foreground text-xs">
          At least 12 characters, with upper case, lower case, and a number.
        </p>
        <FieldError id="password-error" errors={state.fieldErrors?.password} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-describedby="confirmPassword-error"
        />
        <FieldError
          id="confirmPassword-error"
          errors={state.fieldErrors?.confirmPassword}
        />
      </div>

      <SubmitButton pendingLabel="Recovering...">Remove authenticator</SubmitButton>
    </form>
  );
}

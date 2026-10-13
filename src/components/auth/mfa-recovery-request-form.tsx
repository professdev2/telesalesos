"use client";

import { useActionState } from "react";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestMfaRecoveryAction } from "@/lib/auth/actions";
import { idleFormState } from "@/lib/auth/validation";

export function MfaRecoveryRequestForm() {
  const [state, action] = useActionState(requestMfaRecoveryAction, idleFormState);

  if (state.status === "success") {
    return <FormAlert state={state} />;
  }

  return (
    <form action={action} className="space-y-4">
      <FormAlert state={state} />

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-describedby="email-error"
        />
        <FieldError id="email-error" errors={state.fieldErrors?.email} />
      </div>

      <SubmitButton pendingLabel="Sending...">Send recovery link</SubmitButton>
    </form>
  );
}

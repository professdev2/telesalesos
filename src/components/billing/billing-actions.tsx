"use client";

import { useActionState } from "react";

import { FormAlert, SubmitButton } from "@/components/auth/form-parts";
import {
  openBillingPortalAction,
  startCheckoutAction,
} from "@/lib/billing/actions";
import { idleFormState } from "@/lib/auth/validation";

export function StartCheckoutButton() {
  const [state, action] = useActionState(startCheckoutAction, idleFormState);
  return (
    <form action={action} className="space-y-2">
      <FormAlert state={state} />
      <SubmitButton pendingLabel="Redirecting…" className="w-auto">
        Start 3-day trial
      </SubmitButton>
    </form>
  );
}

export function ManageBillingButton() {
  const [state, action] = useActionState(openBillingPortalAction, idleFormState);
  return (
    <form action={action} className="space-y-2">
      <FormAlert state={state} />
      <SubmitButton pendingLabel="Opening…" className="w-auto" variant="outline">
        Manage billing
      </SubmitButton>
    </form>
  );
}

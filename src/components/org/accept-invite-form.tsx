"use client";

import { useActionState } from "react";

import { FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { idleFormState } from "@/lib/auth/validation";
import { acceptInvitationAction } from "@/lib/org/actions";

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInvitationAction, idleFormState);

  return (
    <form action={action} className="space-y-4">
      <FormAlert state={state} />
      <input type="hidden" name="token" value={token} />
      <p className="text-muted-foreground text-sm">
        You must accept with the same email address the invitation was created for.
        Signing up first creates your own workspace; accepting then adds this team
        alongside it.
      </p>
      <SubmitButton pendingLabel="Accepting...">Join organization</SubmitButton>
    </form>
  );
}

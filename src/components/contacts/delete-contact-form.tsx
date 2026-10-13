"use client";

import { useActionState } from "react";

import { FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { idleFormState } from "@/lib/auth/validation";
import { deleteContactAction } from "@/lib/contacts/actions";

export function DeleteContactForm({
  contactId,
  redirectTo,
  variant = "ghost",
}: {
  contactId: string;
  redirectTo?: "/contacts";
  variant?: "ghost" | "outline";
}) {
  const [state, action] = useActionState(deleteContactAction, idleFormState);

  return (
    <form action={action} className="space-y-2">
      <FormAlert state={state} />
      <input type="hidden" name="contactId" value={contactId} />
      {redirectTo ? <input type="hidden" name="redirectTo" value={redirectTo} /> : null}
      <SubmitButton pendingLabel="Deleting..." className="w-auto" variant={variant} size="sm">
        Delete contact
      </SubmitButton>
    </form>
  );
}

export function DeleteContactRowButton({ contactId }: { contactId: string }) {
  const [state, action] = useActionState(deleteContactAction, idleFormState);

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <FormAlert state={state} />
      <input type="hidden" name="contactId" value={contactId} />
      <Button type="submit" variant="ghost" size="sm">
        Delete
      </Button>
    </form>
  );
}

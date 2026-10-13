"use client";

import { useActionState, useState } from "react";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { createInvitationAction } from "@/lib/org/actions";
import { idleFormState } from "@/lib/auth/validation";

export function InviteForm() {
  const [state, action] = useActionState(createInvitationAction, idleFormState);

  return (
    <form action={action} className="space-y-4">
      <FormAlert state={state} />

      {state.inviteUrl ? <CopyableLink url={state.inviteUrl} /> : null}

      <div className="grid gap-4 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="email">Invitee email</Label>
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

        <div className="space-y-2">
          <Label htmlFor="role">Role</Label>
          <NativeSelect id="role" name="role" defaultValue="member">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </NativeSelect>
        </div>

        <SubmitButton pendingLabel="Sending..." className="w-auto">
          Send invite
        </SubmitButton>
      </div>
    </form>
  );
}

function CopyableLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="invite-url">Invitation link</Label>
      <div className="flex gap-2">
        <Input id="invite-url" value={url} readOnly />
        <Button type="button" variant="outline" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

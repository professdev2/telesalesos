"use client";

import { useActionState } from "react";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { resetPasswordAction } from "@/lib/auth/actions";
import type { TotpFactor } from "@/lib/auth/mfa";
import { idleFormState } from "@/lib/auth/validation";

export function ResetPasswordForm({
  factors = [],
}: {
  /** Verified authenticators that must be satisfied before the password changes. */
  factors?: TotpFactor[];
}) {
  const [state, action] = useActionState(resetPasswordAction, idleFormState);
  const firstFactor = factors[0];

  return (
    <form action={action} className="space-y-4">
      <FormAlert state={state} />

      {firstFactor ? (
        <div className="space-y-4">
          {factors.length === 1 ? (
            <input type="hidden" name="factorId" value={firstFactor.id} />
          ) : (
            <div className="space-y-2">
              <Label htmlFor="factorId">Authenticator</Label>
              <NativeSelect
                id="factorId"
                name="factorId"
                required
                defaultValue={firstFactor.id}
              >
                {factors.map((factor) => (
                  <option key={factor.id} value={factor.id}>
                    {factor.friendlyName}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="code">Authenticator code</Label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              aria-describedby="code-hint code-error"
            />
            <p id="code-hint" className="text-muted-foreground text-xs">
              This account has an authenticator, so a current code is required
              before the password can change.
            </p>
            <FieldError id="code-error" errors={state.fieldErrors?.code} />
          </div>
        </div>
      ) : null}

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

      <SubmitButton pendingLabel="Updating...">Update password</SubmitButton>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupAction } from "@/lib/auth/actions";
import { idleFormState } from "@/lib/auth/validation";

export function SignupForm({
  next,
  invited = false,
}: {
  next?: string;
  invited?: boolean;
}) {
  const [state, action] = useActionState(signupAction, idleFormState);
  const [accountType, setAccountType] = useState<"individual" | "team">("individual");

  return (
    <form action={action} className="space-y-4">
      <FormAlert state={state} />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {invited ? (
        <p className="text-muted-foreground text-sm">
          This account will join the invited team after you confirm and click Join
          organization. It will not create a separate workspace.
        </p>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-sm leading-none font-medium">Account type</legend>
          <div className="grid grid-cols-2 gap-2">
            <AccountTypeOption
              value="individual"
              label="Individual agent"
              description="Just me"
              checked={accountType === "individual"}
              onSelect={setAccountType}
            />
            <AccountTypeOption
              value="team"
              label="Agency"
              description="Invite a team"
              checked={accountType === "team"}
              onSelect={setAccountType}
            />
          </div>
        </fieldset>
      )}

      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          aria-describedby="fullName-error"
        />
        <FieldError id="fullName-error" errors={state.fieldErrors?.fullName} />
      </div>

      {invited ? null : (
      <div className="space-y-2">
        <Label htmlFor="organizationName">
          {accountType === "team" ? "Agency name" : "Workspace name"}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="organizationName"
          name="organizationName"
          autoComplete="organization"
          placeholder={accountType === "team" ? "Legacy Producers Group" : "My workspace"}
          aria-describedby="organizationName-error"
        />
        <FieldError
          id="organizationName-error"
          errors={state.fieldErrors?.organizationName}
        />
      </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Work email</Label>
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
        <Label htmlFor="password">Password</Label>
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
        <Label htmlFor="confirmPassword">Confirm password</Label>
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

      <SubmitButton pendingLabel="Creating account...">Create account</SubmitButton>
    </form>
  );
}

function AccountTypeOption({
  value,
  label,
  description,
  checked,
  onSelect,
}: {
  value: "individual" | "team";
  label: string;
  description: string;
  checked: boolean;
  onSelect: (value: "individual" | "team") => void;
}) {
  return (
    <label
      className={`flex cursor-pointer flex-col gap-0.5 rounded-md border p-3 text-sm transition-colors ${
        checked ? "border-primary bg-primary/5" : "border-input hover:bg-accent"
      }`}
    >
      <input
        type="radio"
        name="accountType"
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground text-xs">{description}</span>
    </label>
  );
}

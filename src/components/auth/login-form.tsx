"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/lib/auth/actions";
import { idleFormState } from "@/lib/auth/validation";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, idleFormState);

  return (
    <form action={action} className="space-y-4">
      <FormAlert state={state} />
      {next ? <input type="hidden" name="next" value={next} /> : null}

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

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-describedby="password-error"
        />
        <FieldError id="password-error" errors={state.fieldErrors?.password} />
      </div>

      <SubmitButton pendingLabel="Signing in...">Sign in</SubmitButton>
      <p className="text-center text-sm">
        <Link
          href="/recover-mfa"
          className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          I can&apos;t use my authenticator
        </Link>
      </p>
    </form>
  );
}

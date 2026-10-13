"use client";

import { useActionState } from "react";

import { FieldError, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { idleFormState } from "@/lib/auth/validation";
import {
  requestEmailMfaAction,
  verifyEmailMfaAction,
  verifyTotpChallengeAction,
  verifyTotpEnrollmentAction,
} from "@/lib/auth/mfa-actions";
import type { TotpFactor } from "@/lib/auth/mfa";

export function MfaEnrollForm({
  factorId,
  qrCode,
  secret,
  returnTo,
  next,
}: {
  factorId: string;
  qrCode: string | null;
  secret: string | null;
  returnTo?: "/settings/security";
  next?: string;
}) {
  const [state, action] = useActionState(verifyTotpEnrollmentAction, idleFormState);

  return (
    <form action={action} className="space-y-4">
      <FormAlert state={state} />
      <input type="hidden" name="factorId" value={factorId} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {qrCode ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qrCode}
          alt="Authenticator QR code"
          className="mx-auto size-48 rounded-md bg-white p-2"
        />
      ) : null}

      {secret ? (
        <p className="text-muted-foreground text-center text-xs">
          Can&apos;t scan? Enter this key:{" "}
          <span className="text-foreground font-mono break-all">{secret}</span>
        </p>
      ) : null}

      <TotpFields errors={state.fieldErrors} />
      <TrustDeviceField />
      <SubmitButton pendingLabel="Verifying...">Confirm authenticator</SubmitButton>
    </form>
  );
}

export function MfaChallengeForm({
  factors,
  next,
}: {
  factors: TotpFactor[];
  next?: string;
}) {
  const [state, action] = useActionState(verifyTotpChallengeAction, idleFormState);
  const firstFactor = factors[0];

  return (
    <form action={action} className="space-y-4">
      <FormAlert state={state} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {factors.length === 1 && firstFactor ? (
        <input type="hidden" name="factorId" value={firstFactor.id} />
      ) : (
        <div className="space-y-2">
          <Label htmlFor="factorId">Authenticator</Label>
          <NativeSelect
            id="factorId"
            name="factorId"
            required
            defaultValue={firstFactor?.id}
          >
            {factors.map((factor) => (
              <option key={factor.id} value={factor.id}>
                {factor.friendlyName}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      <TotpFields errors={state.fieldErrors} />
      <TrustDeviceField />
      <SubmitButton pendingLabel="Verifying...">Continue</SubmitButton>
    </form>
  );
}

export function EmailMfaForm({
  next,
  initialMessage,
}: {
  next?: string;
  initialMessage?: string;
}) {
  const [verifyState, verifyAction] = useActionState(verifyEmailMfaAction, idleFormState);
  const [requestState, requestAction] = useActionState(requestEmailMfaAction, idleFormState);
  const alertState =
    verifyState.status !== "idle"
      ? verifyState
      : requestState.status !== "idle"
        ? requestState
        : initialMessage
          ? { status: "success" as const, message: initialMessage }
          : idleFormState;

  return (
    <div className="space-y-4">
      <form action={verifyAction} className="space-y-4">
        <FormAlert state={alertState} />
        {next ? <input type="hidden" name="next" value={next} /> : null}
      <TotpFields errors={verifyState.fieldErrors} label="Email code" />
        <TrustDeviceField />
        <SubmitButton pendingLabel="Verifying...">Continue</SubmitButton>
      </form>
      <form action={requestAction}>
        <SubmitButton variant="ghost" pendingLabel="Sending...">
          Send a new code
        </SubmitButton>
      </form>
    </div>
  );
}

function TotpFields({
  errors,
  label = "Authenticator code",
}: {
  errors?: Record<string, string[]>;
  label?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="code">{label}</Label>
      <Input
        id="code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={8}
        required
        aria-describedby="code-error"
      />
      <FieldError id="code-error" errors={errors?.code} />
    </div>
  );
}

function TrustDeviceField() {
  return (
    <label className="flex items-start gap-2 text-sm leading-snug">
      <input
        type="checkbox"
        name="trustDevice"
        value="1"
        className="border-input mt-0.5 size-4 shrink-0 rounded-sm"
      />
      <span>
        Trust this browser for 30 days. Security changes will still ask for a
        new authenticator code.
      </span>
    </label>
  );
}

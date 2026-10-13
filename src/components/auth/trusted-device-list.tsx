"use client";

import { useActionState } from "react";

import { FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { idleFormState } from "@/lib/auth/validation";
import {
  revokeAllTrustedDevicesAction,
  revokeTrustedDeviceAction,
} from "@/lib/auth/mfa-actions";
import type { TrustedDevice } from "@/lib/auth/trusted-device-types";

export function TrustedDeviceList({ devices }: { devices: TrustedDevice[] }) {
  const [revokeState, revokeAction] = useActionState(
    revokeTrustedDeviceAction,
    idleFormState,
  );
  const [revokeAllState, revokeAllAction] = useActionState(
    revokeAllTrustedDevicesAction,
    idleFormState,
  );

  return (
    <div className="space-y-4">
      <FormAlert state={revokeState} />
      <FormAlert state={revokeAllState} />

      {devices.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No browsers are trusted. After an authenticator code you can choose to
          skip the code on this device for 30 days.
        </p>
      ) : (
        <ul className="divide-y">
          {devices.map((device) => (
            <li
              key={device.id}
              className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
            >
              <div>
                <p className="font-medium">{device.label}</p>
                <p className="text-muted-foreground text-sm">
                  Last used {formatDate(device.lastUsedAt)} · expires{" "}
                  {formatDate(device.expiresAt)}
                </p>
              </div>
              <form action={revokeAction}>
                <input type="hidden" name="deviceId" value={device.id} />
                <SubmitButton
                  variant="outline"
                  size="sm"
                  pendingLabel="Revoking..."
                  className="w-auto"
                >
                  Revoke
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}

      {devices.length > 0 ? (
        <form action={revokeAllAction}>
          <SubmitButton
            variant="outline"
            size="sm"
            pendingLabel="Signing out..."
            className="w-auto"
          >
            Sign out all trusted devices
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

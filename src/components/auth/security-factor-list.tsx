"use client";

import { useActionState } from "react";

import { FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { Badge } from "@/components/ui/badge";
import { idleFormState } from "@/lib/auth/validation";
import { removeTotpFactorAction } from "@/lib/auth/mfa-actions";
import type { TotpFactor } from "@/lib/auth/mfa";

export function SecurityFactorList({
  factors,
  privileged,
}: {
  factors: TotpFactor[];
  privileged: boolean;
}) {
  const [state, action] = useActionState(removeTotpFactorAction, idleFormState);

  if (factors.length === 0) {
    return <p className="text-muted-foreground text-sm">No authenticator is enrolled.</p>;
  }

  return (
    <div className="space-y-4">
      <FormAlert state={state} />
      <ul className="divide-y">
        {factors.map((factor) => {
          const isProtectedLastFactor = privileged && factors.length === 1;
          return (
            <li
              key={factor.id}
              className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{factor.friendlyName}</p>
                  <Badge variant="secondary">Verified</Badge>
                </div>
                <p className="text-muted-foreground text-sm">
                  Added {formatDate(factor.createdAt)}
                </p>
              </div>

              <form action={action}>
                <input type="hidden" name="factorId" value={factor.id} />
                <SubmitButton
                  variant="outline"
                  size="sm"
                  pendingLabel="Removing..."
                  disabled={isProtectedLastFactor}
                  className="w-auto"
                >
                  Remove
                </SubmitButton>
              </form>
            </li>
          );
        })}
      </ul>
      {privileged && factors.length === 1 ? (
        <p className="text-muted-foreground text-sm">
          Owners and admins must keep one verified authenticator. Add another before
          removing this one.
        </p>
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

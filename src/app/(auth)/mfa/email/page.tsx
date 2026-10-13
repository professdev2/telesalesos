import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/logout-button";
import { EmailMfaForm } from "@/components/auth/mfa-forms";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser, requireSession } from "@/lib/auth/dal";
import { hasValidEmailMfaSession, requestEmailMfaCode } from "@/lib/auth/email-mfa";
import { getMfaStatus } from "@/lib/auth/mfa";
import { isMfaPrivileged } from "@/lib/auth/mfa-privilege";
import { nextFromSearchParams, withNextParam } from "@/lib/auth/safe-path";
import { hasValidTrustedDevice } from "@/lib/auth/trusted-device";

export const metadata: Metadata = {
  title: "Email verification | TelesalesOS",
};

export default async function MfaEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = nextFromSearchParams(await searchParams);
  await requireSession();
  const user = await getCurrentUser();
  if (!user?.mfaRequired) {
    redirect(next);
  }

  const privileged = await isMfaPrivileged();
  if (privileged) {
    const status = await getMfaStatus();
    if (status.hasVerifiedFactor) {
      redirect(withNextParam("/mfa/challenge", next));
    }
    redirect(withNextParam("/mfa/enroll", next));
  }

  const status = await getMfaStatus();
  if (status.hasVerifiedFactor) {
    if (status.aal === "aal2" || (await hasValidTrustedDevice())) {
      redirect(next);
    }
    redirect(withNextParam("/mfa/challenge", next));
  }
  if (status.aal === "aal2" || (await hasValidTrustedDevice()) || (await hasValidEmailMfaSession())) {
    redirect(next);
  }

  const sent = await requestEmailMfaCode();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          Enter the 6-digit code we sent to {user.email ?? "your inbox"}. Owners
          and admins cannot use this path — they must use an authenticator app.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <EmailMfaForm
          next={next === "/dashboard" ? undefined : next}
          initialMessage={sent.ok ? sent.message : undefined}
        />
        {!sent.ok ? (
          <p className="text-destructive mt-3 text-sm">{sent.message}</p>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-col items-center gap-2">
        <Link
          href={withNextParam("/mfa/enroll", next)}
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          Use an authenticator app instead
        </Link>
        <LogoutButton />
      </CardFooter>
    </Card>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/logout-button";
import { MfaChallengeForm } from "@/components/auth/mfa-forms";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser, requireSession } from "@/lib/auth/dal";
import { getMfaStatus } from "@/lib/auth/mfa";
import { isMfaPrivileged } from "@/lib/auth/mfa-privilege";
import { nextFromSearchParams, withNextParam } from "@/lib/auth/safe-path";
import { hasValidTrustedDevice } from "@/lib/auth/trusted-device";

export const metadata: Metadata = {
  title: "Authenticator | TelesalesOS",
};

export default async function MfaChallengePage({
  searchParams,
}: PageProps<"/mfa/challenge">) {
  const next = nextFromSearchParams(await searchParams);
  await requireSession();
  const user = await getCurrentUser();
  if (!user?.mfaRequired) {
    redirect(next);
  }

  const status = await getMfaStatus();
  if (!status.hasVerifiedFactor || status.verifiedFactors.length === 0) {
    if (await isMfaPrivileged()) {
      redirect(withNextParam("/mfa/enroll", next));
    }
    redirect(withNextParam("/mfa/email", next));
  }
  if (status.aal === "aal2" || (await hasValidTrustedDevice())) {
    redirect(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enter your authenticator code</CardTitle>
        <CardDescription>
          Password sign-in is not enough for this account. Open your authenticator
          app and enter the current 6-digit code.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MfaChallengeForm
          factors={status.verifiedFactors}
          next={next === "/dashboard" ? undefined : next}
        />
      </CardContent>
      <CardFooter className="flex flex-col items-center gap-2">
        <Link
          href="/recover-mfa"
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          I can&apos;t use my authenticator
        </Link>
        <LogoutButton />
      </CardFooter>
    </Card>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/logout-button";
import { MfaEnrollForm } from "@/components/auth/mfa-forms";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser, requireSession } from "@/lib/auth/dal";
import { getMfaStatus, startTotpEnrollment } from "@/lib/auth/mfa";
import { isMfaPrivileged } from "@/lib/auth/mfa-privilege";
import { nextFromSearchParams, withNextParam } from "@/lib/auth/safe-path";
import { hasValidTrustedDevice } from "@/lib/auth/trusted-device";

export const metadata: Metadata = {
  title: "Enroll authenticator | TelesalesOS",
};

export default async function MfaEnrollPage({
  searchParams,
}: PageProps<"/mfa/enroll">) {
  const next = nextFromSearchParams(await searchParams);
  await requireSession();
  const user = await getCurrentUser();
  if (!user?.mfaRequired) {
    redirect(next);
  }

  const privileged = await isMfaPrivileged();
  const status = await getMfaStatus();
  if (status.hasVerifiedFactor) {
    if (status.aal === "aal2" || (await hasValidTrustedDevice())) {
      redirect(next);
    }
    redirect(withNextParam("/mfa/challenge", next));
  }

  let enrollment: Awaited<ReturnType<typeof startTotpEnrollment>>;
  try {
    enrollment = await startTotpEnrollment();
  } catch (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Could not start enrollment</CardTitle>
          <CardDescription>
            {error instanceof Error ? error.message : "Try signing out and back in."}
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex justify-center gap-2">
          <Link
            href={withNextParam("/mfa/enroll", next)}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Try again
          </Link>
          <LogoutButton />
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up two-factor authentication</CardTitle>
        <CardDescription>
          {privileged
            ? "Your account requires an authenticator app. Scan the QR code, then enter the current 6-digit code."
            : "Scan the QR code, then enter the current 6-digit code. You can also verify with a code sent to your email."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MfaEnrollForm
          factorId={enrollment.factorId}
          qrCode={enrollment.qrCode}
          secret={enrollment.secret}
          next={next === "/dashboard" ? undefined : next}
        />
      </CardContent>
      <CardFooter className="flex flex-col items-center gap-2">
        {!privileged ? (
          <Link
            href={withNextParam("/mfa/email", next)}
            className="text-muted-foreground text-sm underline-offset-4 hover:underline"
          >
            Email me a code instead
          </Link>
        ) : null}
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

import type { Metadata } from "next";
import Link from "next/link";

import { MfaEnrollForm } from "@/components/auth/mfa-forms";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { startTotpEnrollment } from "@/lib/auth/mfa";
import { requireActiveMembership } from "@/lib/org/active-org";

export const metadata: Metadata = {
  title: "Add authenticator | TelesalesOS",
};

export default async function SecurityEnrollPage() {
  await requireActiveMembership();

  let enrollment: Awaited<ReturnType<typeof startTotpEnrollment>>;
  try {
    enrollment = await startTotpEnrollment();
  } catch (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Could not add an authenticator</CardTitle>
          <CardDescription>
            {error instanceof Error ? error.message : "Return to Security and try again."}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link
            href="/settings/security"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Back to Security
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add an authenticator</CardTitle>
        <CardDescription>
          Scan this QR code with an authenticator app, then enter its current
          six-digit code. The setup key is shown only during enrollment.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MfaEnrollForm
          factorId={enrollment.factorId}
          qrCode={enrollment.qrCode}
          secret={enrollment.secret}
          returnTo="/settings/security"
        />
      </CardContent>
      <CardFooter>
        <Link
          href="/settings/security"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          Cancel
        </Link>
      </CardFooter>
    </Card>
  );
}

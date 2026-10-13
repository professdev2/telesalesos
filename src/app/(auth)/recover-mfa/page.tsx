import type { Metadata } from "next";
import Link from "next/link";

import { MfaRecoveryRequestForm } from "@/components/auth/mfa-recovery-request-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Recover authenticator | TelesalesOS",
};

export default function RecoverMfaPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>I can&apos;t use my authenticator</CardTitle>
        <CardDescription>
          We will email a one-time link. After you choose a new password, this
          device&apos;s authenticator and trusted browsers are cleared. Owners and
          admins must enroll a new authenticator before opening the app.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MfaRecoveryRequestForm />
      </CardContent>
      <CardFooter className="text-muted-foreground justify-center text-sm">
        <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}

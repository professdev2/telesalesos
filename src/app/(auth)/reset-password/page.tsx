import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth/dal";
import { getMfaStatus } from "@/lib/auth/mfa";
import {
  claimsIncludeRecovery,
  hasMfaRecoveryRequest,
} from "@/lib/auth/recovery";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Choose a new password | TelesalesOS",
};

export default async function ResetPasswordPage() {
  // Reaching this page means the recovery link already established a session in
  // the callback route. Without one there is nothing to update, and sending the
  // user back to /forgot-password is more useful than an empty form.
  const user = await getSessionUser();

  if (!user) {
    redirect("/forgot-password");
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (
    (await hasMfaRecoveryRequest()) &&
    claimsIncludeRecovery(claims?.claims)
  ) {
    redirect("/recover-mfa/confirm");
  }

  // Auth blocks a password change on an AAL1 session once the account has an
  // authenticator. Collect the code alongside the new password rather than
  // letting the update fail after the form is filled in.
  const status = await getMfaStatus();
  const factors =
    status.hasVerifiedFactor && status.aal !== "aal2"
      ? status.verifiedFactors
      : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>
          Signed in as {user.email}. This will end your other sessions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm factors={factors} />
      </CardContent>
    </Card>
  );
}

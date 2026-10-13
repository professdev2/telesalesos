import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MfaRecoveryConfirmForm } from "@/components/auth/mfa-recovery-confirm-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth/dal";
import {
  claimsIncludeRecovery,
  hasMfaRecoveryRequest,
} from "@/lib/auth/recovery";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Finish recovery | TelesalesOS",
};

export default async function RecoverMfaConfirmPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/recover-mfa");
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const allowed =
    (await hasMfaRecoveryRequest()) && claimsIncludeRecovery(claims?.claims);
  if (!allowed) {
    redirect("/recover-mfa");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Finish authenticator recovery</CardTitle>
        <CardDescription>
          Signed in as {user.email}. Setting a new password removes enrolled
          authenticators, trusted browsers, and email sign-in codes for this
          account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <MfaRecoveryConfirmForm />
      </CardContent>
    </Card>
  );
}

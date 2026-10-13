import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { SecurityFactorList } from "@/components/auth/security-factor-list";
import { TrustedDeviceList } from "@/components/auth/trusted-device-list";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getMfaStatus, getVerifiedTotpFactors } from "@/lib/auth/mfa";
import { isMfaPrivileged } from "@/lib/auth/mfa-privilege";
import { listTrustedDevices } from "@/lib/auth/trusted-device";
import { requireActiveMembership } from "@/lib/org/active-org";

export const metadata: Metadata = {
  title: "Security | TelesalesOS",
};

export default async function SecurityPage() {
  const [, factors, status, devices, privileged] = await Promise.all([
    requireActiveMembership(),
    getVerifiedTotpFactors(),
    getMfaStatus(),
    listTrustedDevices(),
    isMfaPrivileged(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security"
        description="Manage authenticator apps and trusted browsers."
      />

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Authenticator apps</CardTitle>
            <CardDescription>
              TelesalesOS requires a second factor before opening organization data.
            </CardDescription>
          </div>
          <Link
            href="/settings/security/enroll"
            className={buttonVariants({ size: "sm" })}
          >
            Add authenticator
          </Link>
        </CardHeader>
        <CardContent>
          <SecurityFactorList factors={factors} privileged={privileged} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current session</CardTitle>
          <CardDescription>
            Assurance level for this signed-in browser session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            {status.aal === "aal2"
              ? "Authenticator verified (AAL2)."
              : privileged
                ? "Password only (AAL1). A trusted browser can open the app; Security changes still need a fresh authenticator code."
                : "Password only (AAL1). Agents can satisfy MFA with an email code. Security changes still need a fresh authenticator code."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trusted browsers</CardTitle>
          <CardDescription>
            Skipping the daily authenticator code on a browser you marked as
            trusted. Changing authenticators, resetting your password, or
            revoking here signs them out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TrustedDeviceList devices={devices} />
        </CardContent>
      </Card>
    </div>
  );
}

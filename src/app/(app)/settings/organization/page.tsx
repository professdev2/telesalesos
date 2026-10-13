import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { ConvertToTeamForm } from "@/components/org/convert-to-team-form";
import { OrganizationNameForm } from "@/components/org/organization-name-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { hasAtLeastRole } from "@/lib/auth/dal";
import { requireActiveMembership } from "@/lib/org/active-org";
import { getOrganizationDetails } from "@/lib/org/queries";

export const metadata: Metadata = {
  title: "Organization | TelesalesOS",
};

export default async function OrganizationPage() {
  const [membership, details] = await Promise.all([
    requireActiveMembership(),
    getOrganizationDetails(),
  ]);

  const canEdit = hasAtLeastRole(membership.role, "admin");
  const name = details?.name ?? membership.organizationName;
  const accountType = details?.accountType ?? membership.accountType;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization"
        description="Account type cannot be edited as a field. Individual accounts convert to a team through the action below."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account information</CardTitle>
          <CardDescription>These values come from the database, not the URL.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3 text-sm">
            <InfoRow label="Name">{name}</InfoRow>
            <InfoRow label="Account type">
              <Badge variant="secondary" className="capitalize">
                {accountType}
              </Badge>
            </InfoRow>
            <InfoRow label="Your role">
              <span className="capitalize">{membership.role}</span>
            </InfoRow>
            {details?.createdAt ? (
              <InfoRow label="Created">
                {new Date(details.createdAt).toLocaleDateString()}
              </InfoRow>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Name</CardTitle>
          <CardDescription>
            Column privileges allow clients to update name only. Account type is locked.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrganizationNameForm name={name} canEdit={canEdit} />
        </CardContent>
      </Card>

      {accountType === "individual" && membership.role === "owner" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Convert to team</CardTitle>
            <CardDescription>
              Required before invitations. Uses convert_organization_to_team().
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConvertToTeamForm />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

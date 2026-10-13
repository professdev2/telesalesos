import Link from "next/link";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { DashboardSwitcher } from "@/components/dashboard/dashboard-switcher";
import { MonthFilter } from "@/components/dashboard/month-filter";
import { PipelinePanel } from "@/components/dashboard/pipeline-panel";
import { PowerbridgePanel } from "@/components/dashboard/powerbridge-panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireCurrentUser } from "@/lib/auth/dal";
import { getMfaStatus } from "@/lib/auth/mfa";
import { isMfaPrivileged } from "@/lib/auth/mfa-privilege";
import { monthRange, normalizeMonthParam } from "@/lib/dashboard/month";
import { getPipelineDashboardStats } from "@/lib/dashboard/pipeline-stats";
import { getPowerbridgeDashboardStats } from "@/lib/dashboard/powerbridge-stats";
import {
  normalizeDashboardView,
  type DashboardView,
} from "@/lib/dashboard/views";
import { requireActiveMembership } from "@/lib/org/active-org";

export const metadata: Metadata = {
  title: "Dashboard | TelesalesOS",
};

function firstString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [user, membership, params, status, privileged] = await Promise.all([
    requireCurrentUser(),
    requireActiveMembership(),
    searchParams,
    getMfaStatus(),
    isMfaPrivileged(),
  ]);

  const view = normalizeDashboardView(
    firstString(params.view),
    membership.powerbridgeEnabled,
  );
  const month = normalizeMonthParam(firstString(params.month));
  const range = monthRange(month);
  const firstName = user.fullName?.split(" ")[0];

  return (
    <div className="space-y-6">
      {firstString(params.password_updated) === "1" ? (
        <Alert>
          <AlertDescription>Your password has been updated.</AlertDescription>
        </Alert>
      ) : null}

      {!privileged && !status.hasVerifiedFactor ? (
        <Alert>
          <AlertDescription>
            Add an authenticator app for faster sign-in.{" "}
            <Link href="/settings/security/enroll" className="underline underline-offset-4">
              Set up authenticator
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        description={`${membership.organizationName} — signed in as ${membership.role}`}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <DashboardSwitcher
          view={view}
          month={month}
          powerbridgeEnabled={membership.powerbridgeEnabled}
        />
        {view === "powerbridge" ? <MonthFilter view={view} month={month} /> : null}
      </div>

      {view === "home" ? (
        <HomePanel
          email={user.email}
          role={membership.role}
          accountType={membership.accountType}
          mfaRequired={user.mfaRequired}
          privileged={privileged}
        />
      ) : null}

      {view === "powerbridge" && membership.powerbridgeEnabled ? (
        <PowerbridgeSection range={range} />
      ) : null}

      {view === "sales" ||
      view === "recruiting" ||
      view === "retention" ||
      view === "agentfuel" ? (
        <PipelineSection view={view} />
      ) : null}

      {view === "powerbridge" && !membership.powerbridgeEnabled ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">PowerBridge not enabled</CardTitle>
            <CardDescription>
              This organization does not have PowerBridge. Switch to Insurance Telesales,
              Recruiting, Retention, or AgentFuel.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  );
}

async function PowerbridgeSection({
  range,
}: {
  range: ReturnType<typeof monthRange>;
}) {
  const stats = await getPowerbridgeDashboardStats({
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
  });
  return <PowerbridgePanel rangeLabel={range.label} stats={stats} />;
}

async function PipelineSection({
  view,
}: {
  view: Exclude<DashboardView, "home" | "powerbridge">;
}) {
  const stats = await getPipelineDashboardStats(view);
  return <PipelinePanel stats={stats} />;
}

function HomePanel({
  email,
  role,
  accountType,
  mfaRequired,
  privileged,
}: {
  email: string | null;
  role: string;
  accountType: string;
  mfaRequired: boolean;
  privileged: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>Your sign-in details</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-2 text-sm">
            <Row label="Email">
              <span className="truncate">{email}</span>
            </Row>
            <Row label="Role">
              <Badge variant="secondary" className="capitalize">
                {role}
              </Badge>
            </Row>
            <Row label="Account type">
              <span className="capitalize">{accountType}</span>
            </Row>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Security</CardTitle>
          <CardDescription>Requirements for this account</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          {mfaRequired
            ? privileged
              ? "Two-factor authentication is required. An authenticator app is enforced before CRM routes."
              : "Two-factor authentication is required. You can use an email code or an authenticator app."
            : "Two-factor authentication is not required for your role."}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dashboards</CardTitle>
          <CardDescription>Use the tabs above</CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          PowerBridge orders desk plus Insurance / Recruiting / Retention pipeline
          snapshots. Month filters apply to PowerBridge order metrics.
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

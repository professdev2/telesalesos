import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/app/page-header";
import { CampaignForm } from "@/components/campaigns/campaign-form";
import { CampaignPagination } from "@/components/campaigns/campaign-pagination";
import { CampaignPurposeFilter } from "@/components/campaigns/campaign-purpose-filter";
import { CampaignRow } from "@/components/campaigns/campaign-row";
import { CampaignSearch } from "@/components/campaigns/campaign-search";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCampaignPage, normalizeCampaignSearch } from "@/lib/campaigns/queries";
import {
  availablePurposes,
  CAMPAIGN_PURPOSE_LABELS,
  normalizeCampaignPurposeFilter,
  type CampaignPurpose,
} from "@/lib/campaigns/validation";
import { requireActiveMembership } from "@/lib/org/active-org";

export const metadata: Metadata = {
  title: "Campaigns | TelesalesOS",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    page?: string | string[];
    purpose?: string | string[];
  }>;
}) {
  const [membership, params] = await Promise.all([requireActiveMembership(), searchParams]);

  const term = normalizeCampaignSearch(typeof params.q === "string" ? params.q : undefined);
  const page = Number(typeof params.page === "string" ? params.page : 1) || 1;
  const purpose = normalizeCampaignPurposeFilter(
    typeof params.purpose === "string" ? params.purpose : undefined,
  );
  const purposes = availablePurposes(membership.powerbridgeEnabled);
  const filterPurpose = purpose && purposes.includes(purpose) ? purpose : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description={`Pipeline lists for ${membership.organizationName}. Live dialing is a later phase.`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a campaign</CardTitle>
          <CardDescription>
            Choose Insurance Telesales, Recruiting, or Retention
            {membership.powerbridgeEnabled ? ", or PowerBridge" : ""}. The organization is taken
            from your session. Adding a contact does not create a lead or a call.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CampaignForm
            defaultPurpose={filterPurpose ?? "sales"}
            purposes={purposes}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4">
          <div>
            <CardTitle className="text-base">Campaigns</CardTitle>
            <CardDescription>
              Archived campaigns are hidden. Row-level security limits this list to{" "}
              {membership.organizationName}.
            </CardDescription>
          </div>
          <CampaignPurposeFilter
            purpose={filterPurpose}
            term={term}
            purposes={purposes}
          />
          <CampaignSearch term={term} purpose={filterPurpose} />
        </CardHeader>
        <CardContent>
          <Suspense
            key={`${filterPurpose ?? "all"}:${term}:${page}`}
            fallback={<ListSkeleton />}
          >
            <CampaignList term={term} page={page} purpose={filterPurpose} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

async function CampaignList({
  term,
  page,
  purpose,
}: {
  term: string;
  page: number;
  purpose: CampaignPurpose | null;
}) {
  const { campaigns, total, pageCount, page: current } = await getCampaignPage(
    term,
    page,
    purpose,
  );
  const kind = purpose ? `${CAMPAIGN_PURPOSE_LABELS[purpose].toLowerCase()} ` : "";

  if (campaigns.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {term
          ? `No ${kind}campaigns match “${term}”.`
          : `No open ${kind}campaigns yet. Add the first one above.`}
      </p>
    );
  }

  return (
    <>
      <p className="text-muted-foreground pb-3 text-sm">
        {total} {kind}
        {total === 1 ? "campaign" : "campaigns"}
        {term ? ` matching “${term}”` : ""}
      </p>

      <ul className="divide-border divide-y">
        {campaigns.map((campaign) => (
          <CampaignRow key={campaign.id} campaign={campaign} />
        ))}
      </ul>

      <CampaignPagination
        page={current}
        pageCount={pageCount}
        term={term}
        purpose={purpose}
      />
    </>
  );
}

function ListSkeleton() {
  return (
    <ul className="divide-border divide-y" aria-hidden>
      {[0, 1, 2].map((row) => (
        <li key={row} className="space-y-2 py-3 first:pt-0 last:pb-0">
          <div className="bg-muted h-4 w-40 animate-pulse rounded" />
          <div className="bg-muted h-3 w-24 animate-pulse rounded" />
        </li>
      ))}
    </ul>
  );
}

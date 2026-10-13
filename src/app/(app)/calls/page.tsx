import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/app/page-header";
import { CallForm } from "@/components/calls/call-form";
import { CallPagination } from "@/components/calls/call-pagination";
import { CallRow } from "@/components/calls/call-row";
import { CallSearch } from "@/components/calls/call-search";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCallRecordPage, normalizeCallSearch } from "@/lib/calls/queries";
import { listLeadsForSelect } from "@/lib/leads/queries";
import { requireActiveMembership } from "@/lib/org/active-org";

export const metadata: Metadata = {
  title: "Calls | TelesalesOS",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  const [membership, params, leads] = await Promise.all([
    requireActiveMembership(),
    searchParams,
    listLeadsForSelect(),
  ]);

  const term = normalizeCallSearch(typeof params.q === "string" ? params.q : undefined);
  const page = Number(typeof params.page === "string" ? params.page : 1) || 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calls"
        description={`Logged attempts for ${membership.organizationName}. Live dialing is a later phase.`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log an attempt</CardTitle>
          <CardDescription>
            The organization is taken from your session. A call record must point at a contact in
            this organization. This does not change lead status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CallForm leads={leads} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4">
          <div>
            <CardTitle className="text-base">Attempts</CardTitle>
            <CardDescription>
              Row-level security limits this list to {membership.organizationName}.
            </CardDescription>
          </div>
          <CallSearch term={term} />
        </CardHeader>
        <CardContent>
          <Suspense key={`${term}:${page}`} fallback={<ListSkeleton />}>
            <CallList term={term} page={page} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

async function CallList({ term, page }: { term: string; page: number }) {
  const { records, total, pageCount, page: current } = await getCallRecordPage(term, page);

  if (records.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {term
          ? `No attempts match “${term}”.`
          : "No attempts yet. Log the first one above."}
      </p>
    );
  }

  return (
    <>
      <p className="text-muted-foreground pb-3 text-sm">
        {total} {total === 1 ? "attempt" : "attempts"}
        {term ? ` matching “${term}”` : ""}
      </p>

      <ul className="divide-border divide-y">
        {records.map((record) => (
          <CallRow key={record.id} record={record} />
        ))}
      </ul>

      <CallPagination page={current} pageCount={pageCount} term={term} />
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

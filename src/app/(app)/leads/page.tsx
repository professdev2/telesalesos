import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/app/page-header";
import { LeadForm } from "@/components/leads/lead-form";
import { LeadKanbanBoard } from "@/components/leads/lead-kanban-board";
import { LeadPagination } from "@/components/leads/lead-pagination";
import { LeadPurposeFilter } from "@/components/leads/lead-purpose-filter";
import { LeadRow } from "@/components/leads/lead-row";
import { LeadSearch } from "@/components/leads/lead-search";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { availablePurposes } from "@/lib/crm/pipelines";
import { leadListHref } from "@/lib/leads/list-href";
import {
  countUnreadLeads,
  getLeadPage,
  getLeadsForBoard,
  normalizeLeadSearch,
} from "@/lib/leads/queries";
import {
  LEAD_PURPOSE_LABELS,
  normalizeLeadPurposeFilter,
  type LeadPurpose,
} from "@/lib/leads/validation";
import { requireActiveMembership } from "@/lib/org/active-org";

export const metadata: Metadata = {
  title: "Leads | TelesalesOS",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    page?: string | string[];
    purpose?: string | string[];
    view?: string | string[];
    unread?: string | string[];
  }>;
}) {
  const [membership, params] = await Promise.all([
    requireActiveMembership(),
    searchParams,
  ]);

  const term = normalizeLeadSearch(typeof params.q === "string" ? params.q : undefined);
  const page = Number(typeof params.page === "string" ? params.page : 1) || 1;
  const purposes = availablePurposes(membership.powerbridgeEnabled);
  const requestedPurpose = normalizeLeadPurposeFilter(
    typeof params.purpose === "string" ? params.purpose : undefined,
  );
  const purpose =
    requestedPurpose && purposes.includes(requestedPurpose) ? requestedPurpose : null;
  const wantBoard = typeof params.view === "string" && params.view === "board";
  const view: "list" | "board" = wantBoard && purpose ? "board" : "list";
  const unread =
    params.unread === "1" || params.unread === "true" || params.unread === "yes";
  const unreadCount = await countUnreadLeads(purpose);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description={`Open opportunities for ${membership.organizationName}.`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a lead</CardTitle>
          <CardDescription>
            Pick a pipeline and stage. The organization is taken from your session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LeadForm
            showCompany={membership.powerbridgeEnabled}
            purposes={purposes}
            defaultPurpose={purpose ?? "sales"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Leads</CardTitle>
              <CardDescription>
                Archived leads are hidden. New website leads stay unread until you open them.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={leadListHref({ term, purpose, view: "list", unread })}
                className={buttonVariants({
                  variant: view === "list" ? "default" : "outline",
                  size: "sm",
                })}
              >
                List
              </Link>
              <Link
                href={
                  purpose
                    ? leadListHref({ term, purpose, view: "board", unread })
                    : leadListHref({ term, purpose: "sales", view: "board", unread })
                }
                className={buttonVariants({
                  variant: view === "board" ? "default" : "outline",
                  size: "sm",
                })}
              >
                Board
              </Link>
              <Link
                href={leadListHref({
                  term,
                  purpose,
                  view: view === "board" && purpose ? "board" : "list",
                  unread: !unread,
                })}
                className={buttonVariants({
                  variant: unread ? "default" : "outline",
                  size: "sm",
                })}
                aria-pressed={unread}
              >
                Unread
                {unreadCount > 0 ? (
                  <span className="bg-background/20 ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </Link>
            </div>
          </div>
          <LeadPurposeFilter
            purpose={purpose}
            term={term}
            view={view}
            purposes={purposes}
            unread={unread}
          />
          <LeadSearch term={term} purpose={purpose} view={view} unread={unread} />
        </CardHeader>
        <CardContent>
          {view === "board" && purpose ? (
            <Suspense
              key={`board:${purpose}:${term}:${unread ? "u" : "a"}`}
              fallback={<BoardSkeleton />}
            >
              <LeadBoard purpose={purpose} term={term} unread={unread} />
            </Suspense>
          ) : (
            <Suspense
              key={`list:${purpose ?? "all"}:${term}:${page}:${unread ? "u" : "a"}`}
              fallback={<ListSkeleton />}
            >
              <LeadList term={term} page={page} purpose={purpose} unread={unread} />
            </Suspense>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function LeadList({
  term,
  page,
  purpose,
  unread,
}: {
  term: string;
  page: number;
  purpose: LeadPurpose | null;
  unread: boolean;
}) {
  const { leads, total, pageCount, page: current } = await getLeadPage(
    term,
    page,
    purpose,
    unread,
  );
  const kind = purpose ? `${LEAD_PURPOSE_LABELS[purpose].toLowerCase()} ` : "";
  const unreadLabel = unread ? "unread " : "";

  if (leads.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {term
          ? `No ${unreadLabel}${kind}leads match “${term}”.`
          : unread
            ? `No unread ${kind}leads. New website or form leads show here until you open them.`
            : `No open ${kind}leads yet. Add the first one above.`}
      </p>
    );
  }

  return (
    <>
      <p className="text-muted-foreground pb-3 text-sm">
        {total} {unreadLabel}
        {kind}
        {total === 1 ? "lead" : "leads"}
        {term ? ` matching “${term}”` : ""}
      </p>

      <ul className="divide-border divide-y">
        {leads.map((lead) => (
          <LeadRow key={lead.id} lead={lead} />
        ))}
      </ul>

      <LeadPagination
        page={current}
        pageCount={pageCount}
        term={term}
        purpose={purpose}
        unread={unread}
      />
    </>
  );
}

async function LeadBoard({
  purpose,
  term,
  unread,
}: {
  purpose: LeadPurpose;
  term: string;
  unread: boolean;
}) {
  const leads = await getLeadsForBoard(purpose, term, unread);
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {LEAD_PURPOSE_LABELS[purpose]} board · {leads.length}{" "}
        {unread ? "unread " : ""}
        {leads.length === 1 ? "lead" : "leads"}
        {term ? ` matching “${term}”` : ""}
      </p>
      <LeadKanbanBoard purpose={purpose} leads={leads} />
    </div>
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

function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-auto" aria-hidden>
      {[0, 1, 2, 3].map((col) => (
        <div key={col} className="bg-muted/40 h-64 w-64 shrink-0 animate-pulse rounded-md" />
      ))}
    </div>
  );
}

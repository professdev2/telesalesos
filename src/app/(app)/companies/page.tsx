import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { CompanyForm } from "@/components/companies/company-form";
import { CompanyPagination } from "@/components/companies/company-pagination";
import { CompanyRow } from "@/components/companies/company-row";
import { CompanySearch } from "@/components/companies/company-search";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getCompanyPage,
  normalizeCompanySearch,
} from "@/lib/companies/queries";
import { requireActiveMembership } from "@/lib/org/active-org";

export const metadata: Metadata = {
  title: "Companies | TelesalesOS",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  const [membership, params] = await Promise.all([
    requireActiveMembership(),
    searchParams,
  ]);

  if (!membership.powerbridgeEnabled) {
    notFound();
  }

  const term = normalizeCompanySearch(
    typeof params.q === "string" ? params.q : undefined,
  );
  const page = Number(typeof params.page === "string" ? params.page : 1) || 1;
  const result = await getCompanyPage(term, page);

  const directoryDescription =
    result.total === 0
      ? term
        ? "No matches for that search."
        : "No companies yet."
      : `${result.total} compan${result.total === 1 ? "y" : "ies"}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Companies"
        description={`Accounts for ${membership.organizationName}. One company, many opportunities.`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a company</CardTitle>
          <CardDescription>
            Prospects and customers share the same record. Closed Won marks them as buyers later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CompanyForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4">
          <div>
            <CardTitle className="text-base">Directory</CardTitle>
            <CardDescription>{directoryDescription}</CardDescription>
          </div>
          <CompanySearch term={term} />
        </CardHeader>
        <CardContent>
          {result.companies.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {term ? "No companies match that search." : "Add a company above to get started."}
            </p>
          ) : (
            <ul>
              {result.companies.map((company) => (
                <CompanyRow key={company.id} company={company} />
              ))}
            </ul>
          )}
          <div className="mt-4">
            <CompanyPagination
              page={result.page}
              pageCount={result.pageCount}
              search={term}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

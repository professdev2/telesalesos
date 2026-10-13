import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/app/page-header";
import { ContactForm } from "@/components/contacts/contact-form";
import { ContactPagination } from "@/components/contacts/contact-pagination";
import { ContactRow } from "@/components/contacts/contact-row";
import { ContactSearch } from "@/components/contacts/contact-search";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getContactPage, normalizeContactSearch } from "@/lib/contacts/queries";
import { requireActiveMembership } from "@/lib/org/active-org";

export const metadata: Metadata = {
  title: "Contacts | TelesalesOS",
};

export default async function Page({ searchParams }: PageProps<"/contacts">) {
  const [membership, params] = await Promise.all([
    requireActiveMembership(),
    searchParams,
  ]);

  const term = normalizeContactSearch(
    typeof params.q === "string" ? params.q : undefined,
  );
  const page = Number(typeof params.page === "string" ? params.page : 1) || 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contacts"
        description={`Everyone ${membership.organizationName} has a relationship with.`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a contact</CardTitle>
          <CardDescription>
            The organization is taken from your session, not from this form.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ContactForm showCompany={membership.powerbridgeEnabled} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4">
          <div>
            <CardTitle className="text-base">Contacts</CardTitle>
            <CardDescription>
              Row-level security limits this list to {membership.organizationName}.
            </CardDescription>
          </div>
          <ContactSearch term={term} />
        </CardHeader>
        <CardContent>
          {/* Keyed so a new search or page shows the fallback rather than the
              previous results while the query runs. */}
          <Suspense key={`${term}:${page}`} fallback={<ListSkeleton />}>
            <ContactList term={term} page={page} />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

async function ContactList({ term, page }: { term: string; page: number }) {
  const { contacts, total, pageCount, page: current } = await getContactPage(term, page);

  if (contacts.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {term
          ? `No contacts match “${term}”.`
          : "No contacts yet. Add the first one above."}
      </p>
    );
  }

  return (
    <>
      <p className="text-muted-foreground pb-3 text-sm">
        {total} {total === 1 ? "contact" : "contacts"}
        {term ? ` matching “${term}”` : ""}
      </p>

      <ul className="divide-border divide-y">
        {contacts.map((contact) => (
          <ContactRow key={contact.id} contact={contact} />
        ))}
      </ul>

      <ContactPagination page={current} pageCount={pageCount} term={term} />
    </>
  );
}

function ListSkeleton() {
  return (
    <ul className="divide-border divide-y" aria-hidden>
      {[0, 1, 2].map((row) => (
        <li key={row} className="space-y-2 py-3 first:pt-0 last:pb-0">
          <div className="bg-muted h-4 w-40 animate-pulse rounded" />
          <div className="bg-muted h-3 w-56 animate-pulse rounded" />
        </li>
      ))}
    </ul>
  );
}

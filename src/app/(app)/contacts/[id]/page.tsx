import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { CallForm } from "@/components/calls/call-form";
import { CallHistoryList } from "@/components/calls/call-history-list";
import { ContactDetailForm } from "@/components/contacts/contact-detail-form";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DeleteContactForm } from "@/components/contacts/delete-contact-form";
import { ContactTagsEditor } from "@/components/tags/contact-tags-editor";
import { listCallRecordsForContact } from "@/lib/calls/queries";
import { listCampaignsForContact } from "@/lib/campaigns/queries";
import {
  CAMPAIGN_PURPOSE_LABELS,
  CAMPAIGN_STATUS_LABELS,
} from "@/lib/campaigns/validation";
import { getContactById } from "@/lib/contacts/queries";
import { listLeadsForSelect } from "@/lib/leads/queries";
import { requireActiveMembership } from "@/lib/org/active-org";
import { listOrgTags, listTagsForContact } from "@/lib/tags/queries";

export const metadata: Metadata = {
  title: "Contact | TelesalesOS",
};

export default async function ContactPage({ params }: PageProps<"/contacts/[id]">) {
  const [membership, { id }] = await Promise.all([requireActiveMembership(), params]);
  const [contact, records, leads, campaigns, tags, orgTags] = await Promise.all([
    getContactById(id),
    listCallRecordsForContact(id),
    listLeadsForSelect(),
    listCampaignsForContact(id),
    listTagsForContact(id),
    listOrgTags(),
  ]);

  // A contact in another organization and an id that never existed produce the
  // same 404. Distinguishing them would confirm the record is real.
  if (!contact) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={contact.fullName}
        description={`Contact in ${membership.organizationName}.`}
      />

      <Link href="/contacts" className={buttonVariants({ variant: "outline", size: "sm" })}>
        Back to contacts
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
          <CardDescription>
            Added {new Date(contact.createdAt).toLocaleDateString()}. The organization comes from
            your session and cannot be changed here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {contact.companyId && contact.companyName ? (
            <p className="text-muted-foreground mb-4 text-sm">
              Company{" "}
              <Link
                href={`/companies/${contact.companyId}`}
                className="text-foreground underline-offset-4 hover:underline"
              >
                {contact.companyName}
              </Link>
            </p>
          ) : null}
          <ContactDetailForm
            contact={contact}
            showCompany={membership.powerbridgeEnabled}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tags</CardTitle>
          <CardDescription>
            Labels for this person. Same tags show on every campaign they belong to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ContactTagsEditor
            contactId={contact.id}
            tags={tags}
            suggestions={orgTags}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attempts</CardTitle>
          <CardDescription>
            Logged attempts for this person. Logging an attempt does not change a lead&apos;s
            status.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <CallForm
            leads={leads.filter((lead) => lead.contactId === contact.id)}
            defaultContactId={contact.id}
          />
          <CallHistoryList records={records} empty="No attempts logged for this contact yet." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaigns</CardTitle>
          <CardDescription>
            Lists in this organization that include this person.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <p className="text-muted-foreground text-sm">Not on any campaign yet.</p>
          ) : (
            <ul className="divide-border divide-y">
              {campaigns.map((campaign) => (
                <li key={campaign.id} className="py-3 first:pt-0 last:pb-0">
                  <Link
                    href={`/campaigns/${campaign.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {campaign.name}
                  </Link>
                  <p className="text-muted-foreground text-sm">
                    {CAMPAIGN_PURPOSE_LABELS[campaign.purpose]} ·{" "}
                    {CAMPAIGN_STATUS_LABELS[campaign.status]}
                    {campaign.archivedAt ? " · Archived" : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delete</CardTitle>
          <CardDescription>
            Contacts with leads, call records, or campaign memberships cannot be deleted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteContactForm contactId={contact.id} redirectTo="/contacts" variant="outline" />
        </CardContent>
      </Card>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/app/page-header";
import { AddCampaignContactForm } from "@/components/campaigns/add-campaign-contact-form";
import { CampaignDetailForm } from "@/components/campaigns/campaign-detail-form";
import { RemoveCampaignContactButton } from "@/components/campaigns/remove-campaign-contact-button";
import { ContactTagsEditor } from "@/components/tags/contact-tags-editor";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCampaignById } from "@/lib/campaigns/queries";
import {
  availablePurposes,
  CAMPAIGN_PURPOSE_LABELS,
  CAMPAIGN_STATUS_LABELS,
} from "@/lib/campaigns/validation";
import { listContactsForSelect } from "@/lib/contacts/queries";
import { requireActiveMembership } from "@/lib/org/active-org";
import { listOrgTags, listTagsForContacts } from "@/lib/tags/queries";

export const metadata: Metadata = {
  title: "Campaign | TelesalesOS",
};

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const [membership, { id }, contacts, orgTags] = await Promise.all([
    requireActiveMembership(),
    params,
    listContactsForSelect(),
    listOrgTags(),
  ]);
  const campaign = await getCampaignById(id);

  if (!campaign) {
    notFound();
  }

  const memberIds = new Set(campaign.members.map((member) => member.contactId));
  const available = contacts.filter((contact) => !memberIds.has(contact.id));
  const purposes = availablePurposes(membership.powerbridgeEnabled);
  const tagsByContact = await listTagsForContacts(
    campaign.members.map((member) => member.contactId),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.name}
        description={`${CAMPAIGN_PURPOSE_LABELS[campaign.purpose]} campaign in ${membership.organizationName}.`}
      />

      <Link href="/campaigns" className={buttonVariants({ variant: "outline", size: "sm" })}>
        Back to campaigns
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
          <CardDescription>
            {CAMPAIGN_PURPOSE_LABELS[campaign.purpose]} · status{" "}
            {CAMPAIGN_STATUS_LABELS[campaign.status]}. Added{" "}
            {new Date(campaign.createdAt).toLocaleDateString()}. The organization comes from your
            session and cannot be changed here. There is no delete control — archive hides it from
            the default list.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CampaignDetailForm campaign={campaign} purposes={purposes} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contacts</CardTitle>
          <CardDescription>
            Only people in this organization can be added. Add or remove tags on each contact —
            tags are shared across all campaigns.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {campaign.archivedAt ? null : (
            <AddCampaignContactForm campaignId={campaign.id} contacts={available} />
          )}

          {campaign.members.length === 0 ? (
            <p className="text-muted-foreground text-sm">No contacts on this campaign yet.</p>
          ) : (
            <ul className="divide-border divide-y">
              {campaign.members.map((member) => (
                <li
                  key={member.id}
                  className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <Link
                      href={`/contacts/${member.contactId}`}
                      className="truncate font-medium underline-offset-4 hover:underline"
                    >
                      {member.contactName}
                    </Link>
                    {campaign.archivedAt ? (
                      <div className="flex flex-wrap gap-1.5">
                        {(tagsByContact.get(member.contactId) ?? []).map((tag) => (
                          <span
                            key={tag.id}
                            className="border-border bg-muted/50 rounded-md border px-2 py-0.5 text-xs font-medium"
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <ContactTagsEditor
                        contactId={member.contactId}
                        tags={tagsByContact.get(member.contactId) ?? []}
                        suggestions={orgTags}
                        campaignId={campaign.id}
                        compact
                      />
                    )}
                  </div>
                  {campaign.archivedAt ? null : (
                    <RemoveCampaignContactButton
                      campaignId={campaign.id}
                      contactId={member.contactId}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

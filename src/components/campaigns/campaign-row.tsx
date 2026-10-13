import Link from "next/link";

import type { Campaign } from "@/lib/campaigns/queries";
import {
  CAMPAIGN_PURPOSE_LABELS,
  CAMPAIGN_STATUS_LABELS,
} from "@/lib/campaigns/validation";

export function CampaignRow({ campaign }: { campaign: Campaign }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <Link
          href={`/campaigns/${campaign.id}`}
          className="truncate font-medium underline-offset-4 hover:underline"
        >
          {campaign.name}
        </Link>
        <p className="text-muted-foreground truncate text-sm">
          {CAMPAIGN_PURPOSE_LABELS[campaign.purpose]} ·{" "}
          {CAMPAIGN_STATUS_LABELS[campaign.status]} · {campaign.memberCount}{" "}
          {campaign.memberCount === 1 ? "contact" : "contacts"}
        </p>
      </div>
    </li>
  );
}

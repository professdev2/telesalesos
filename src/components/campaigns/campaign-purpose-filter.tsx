import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { campaignListHref } from "@/lib/campaigns/list-href";
import {
  CAMPAIGN_PURPOSE_LABELS,
  type CampaignPurpose,
} from "@/lib/campaigns/validation";

export function CampaignPurposeFilter({
  purpose,
  term,
  purposes,
}: {
  purpose: CampaignPurpose | null;
  term: string;
  purposes: CampaignPurpose[];
}) {
  const options: { value: CampaignPurpose | null; label: string }[] = [
    { value: null, label: "All" },
    ...purposes.map((value) => ({
      value,
      label: CAMPAIGN_PURPOSE_LABELS[value],
    })),
  ];

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Campaign purpose">
      {options.map((option) => {
        const active = option.value === purpose;
        return (
          <Link
            key={option.label}
            href={campaignListHref({ term, purpose: option.value })}
            aria-current={active ? "page" : undefined}
            className={buttonVariants({
              variant: active ? "default" : "outline",
              size: "sm",
            })}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}

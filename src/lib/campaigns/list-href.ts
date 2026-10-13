import type { CampaignPurpose } from "@/lib/campaigns/validation";

export function campaignListHref({
  term = "",
  page = 1,
  purpose = null,
}: {
  term?: string;
  page?: number;
  purpose?: CampaignPurpose | null;
}): string {
  const params = new URLSearchParams();
  if (purpose) params.set("purpose", purpose);
  if (term) params.set("q", term);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/campaigns?${query}` : "/campaigns";
}

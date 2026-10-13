import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { campaignListHref } from "@/lib/campaigns/list-href";
import type { CampaignPurpose } from "@/lib/campaigns/validation";

export function CampaignSearch({
  term,
  purpose,
}: {
  term: string;
  purpose: CampaignPurpose | null;
}) {
  return (
    <form action="/campaigns" method="get" className="flex items-end gap-2">
      {purpose ? <input type="hidden" name="purpose" value={purpose} /> : null}
      <div className="flex-1 space-y-2">
        <Label htmlFor="q">Search</Label>
        <Input
          key={term}
          id="q"
          name="q"
          type="search"
          defaultValue={term}
          placeholder="Name or notes"
        />
      </div>
      <Button type="submit" variant="outline">
        Search
      </Button>
      {term ? (
        <Link
          href={campaignListHref({ purpose })}
          className={buttonVariants({ variant: "ghost" })}
        >
          Clear
        </Link>
      ) : null}
    </form>
  );
}

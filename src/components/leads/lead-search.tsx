import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { leadListHref } from "@/lib/leads/list-href";
import type { LeadPurpose } from "@/lib/leads/validation";

export function LeadSearch({
  term,
  purpose,
  view,
  unread = false,
}: {
  term: string;
  purpose: LeadPurpose | null;
  view: "list" | "board";
  unread?: boolean;
}) {
  return (
    <form action="/leads" method="get" className="flex items-end gap-2">
      {purpose ? <input type="hidden" name="purpose" value={purpose} /> : null}
      {view === "board" ? <input type="hidden" name="view" value="board" /> : null}
      {unread ? <input type="hidden" name="unread" value="1" /> : null}
      <div className="flex-1 space-y-2">
        <Label htmlFor="q">Search</Label>
        <Input
          key={term}
          id="q"
          name="q"
          type="search"
          defaultValue={term}
          placeholder="Contact name or notes"
        />
      </div>
      <Button type="submit" variant="outline">
        Search
      </Button>
      {term ? (
        <Link
          href={leadListHref({ purpose, view, unread })}
          className={buttonVariants({ variant: "ghost" })}
        >
          Clear
        </Link>
      ) : null}
    </form>
  );
}

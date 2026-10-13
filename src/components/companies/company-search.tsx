import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Plain GET form. The term lives in the URL so results can be shared/reloaded
 * without client state. Keyed like ContactSearch so Base UI does not warn when
 * the default value changes after navigation.
 */
export function CompanySearch({ term }: { term: string }) {
  return (
    <form action="/companies" method="get" className="flex items-end gap-2">
      <div className="flex-1 space-y-2">
        <Label htmlFor="q">Search</Label>
        <Input
          key={term}
          id="q"
          name="q"
          type="search"
          defaultValue={term}
          placeholder="Name, IMO, state, or website"
        />
      </div>
      <Button type="submit" variant="outline">
        Search
      </Button>
      {term ? (
        <Link href="/companies" className={buttonVariants({ variant: "ghost" })}>
          Clear
        </Link>
      ) : null}
    </form>
  );
}

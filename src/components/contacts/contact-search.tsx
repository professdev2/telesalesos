import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * A plain GET form. The term lives in the URL, so a filtered list can be
 * reloaded, shared, or paged through without client state.
 */
export function ContactSearch({ term }: { term: string }) {
  return (
    <form action="/contacts" method="get" className="flex items-end gap-2">
      <div className="flex-1 space-y-2">
        <Label htmlFor="q">Search</Label>
        {/* Keyed so a new term remounts the field instead of changing the
            default of an already-initialised uncontrolled input. */}
        <Input
          key={term}
          id="q"
          name="q"
          type="search"
          defaultValue={term}
          placeholder="Name, email, or phone"
        />
      </div>
      <Button type="submit" variant="outline">
        Search
      </Button>
      {term ? (
        <Link href="/contacts" className={buttonVariants({ variant: "ghost" })}>
          Clear
        </Link>
      ) : null}
    </form>
  );
}

import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CallSearch({ term }: { term: string }) {
  return (
    <form action="/calls" method="get" className="flex items-end gap-2">
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
        <Link href="/calls" className={buttonVariants({ variant: "ghost" })}>
          Clear
        </Link>
      ) : null}
    </form>
  );
}

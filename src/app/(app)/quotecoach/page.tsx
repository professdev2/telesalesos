import type { Metadata } from "next";

import { ComingSoon } from "@/components/app/coming-soon";
import { requireActiveMembership } from "@/lib/org/active-org";

export const metadata: Metadata = {
  title: "QuoteCoach | TelesalesOS",
};

export default async function Page() {
  await requireActiveMembership();

  return (
    <ComingSoon
      title="QuoteCoach"
      description="Carrier quoting and in-call guidance."
      plannedFor="QuoteCoach depends on carrier integrations that are not scoped yet."
    />
  );
}
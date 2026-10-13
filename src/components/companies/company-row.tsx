import Link from "next/link";

import { priorityLabel } from "@/lib/companies/validation";
import type { Company } from "@/lib/companies/queries";

export function CompanyRow({ company }: { company: Company }) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 border-b py-3 last:border-b-0">
      <div className="min-w-0">
        <Link
          href={`/companies/${company.id}`}
          className="text-foreground font-medium underline-offset-4 hover:underline"
        >
          {company.name}
        </Link>
        <p className="text-muted-foreground mt-0.5 text-sm">
          {[company.imo, company.state, priorityLabel(company.priority)]
            .filter((part) => part && part !== "—")
            .join(" · ") || "No details yet"}
        </p>
      </div>
      {company.website ? (
        <a
          href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          Website
        </a>
      ) : null}
    </li>
  );
}

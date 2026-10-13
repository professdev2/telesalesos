import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { leadListHref } from "@/lib/leads/list-href";
import {
  LEAD_PURPOSE_LABELS,
  type LeadPurpose,
} from "@/lib/leads/validation";

export function LeadPurposeFilter({
  purpose,
  term,
  view,
  purposes,
  unread = false,
}: {
  purpose: LeadPurpose | null;
  term: string;
  view: "list" | "board";
  purposes: LeadPurpose[];
  unread?: boolean;
}) {
  const options: { value: LeadPurpose | null; label: string }[] = [
    { value: null, label: "All" },
    ...purposes.map((value) => ({
      value,
      label: LEAD_PURPOSE_LABELS[value],
    })),
  ];

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Lead pipeline">
      {options.map((option) => {
        const active = option.value === purpose;
        return (
          <Link
            key={option.label}
            href={leadListHref({
              term,
              purpose: option.value,
              view: view === "board" && option.value ? "board" : "list",
              unread,
            })}
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

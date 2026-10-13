import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  currentMonthKey,
  shiftMonthKey,
} from "@/lib/dashboard/month";
import { dashboardHref, type DashboardView } from "@/lib/dashboard/views";

export function MonthFilter({
  view,
  month,
}: {
  view: DashboardView;
  month: string;
}) {
  const thisMonth = currentMonthKey();
  const lastMonth = shiftMonthKey(thisMonth, -1);
  const options = [
    { value: thisMonth, label: "This month" },
    { value: lastMonth, label: "Last month" },
    { value: "all", label: "All time" },
  ];

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Date range">
      {options.map((option) => {
        const active = month === option.value;
        return (
          <Link
            key={option.value}
            href={dashboardHref({ view, month: option.value })}
            aria-current={active ? "page" : undefined}
            className={buttonVariants({
              variant: active ? "secondary" : "outline",
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

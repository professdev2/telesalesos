import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  dashboardHref,
  type DashboardView,
} from "@/lib/dashboard/views";

export function DashboardSwitcher({
  view,
  month,
  powerbridgeEnabled,
}: {
  view: DashboardView;
  month: string;
  powerbridgeEnabled: boolean;
}) {
  const options: { value: DashboardView; label: string }[] = [
    ...(powerbridgeEnabled
      ? [{ value: "powerbridge" as const, label: "PowerBridge" }]
      : []),
    { value: "sales", label: "Insurance Telesales" },
    { value: "recruiting", label: "Recruiting" },
    { value: "retention", label: "Retention" },
    { value: "agentfuel", label: "AgentFuel" },
    { value: "home", label: "Account" },
  ];

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Dashboard">
      {options.map((option) => {
        const active = option.value === view;
        return (
          <Link
            key={option.value}
            href={dashboardHref({ view: option.value, month })}
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

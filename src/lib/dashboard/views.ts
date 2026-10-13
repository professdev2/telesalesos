import type { PipelinePurpose } from "@/lib/crm/pipelines";

export const DASHBOARD_VIEWS = [
  "powerbridge",
  "sales",
  "recruiting",
  "retention",
  "agentfuel",
  "home",
] as const;

export type DashboardView = (typeof DASHBOARD_VIEWS)[number];

export function normalizeDashboardView(
  raw: string | undefined,
  powerbridgeEnabled: boolean,
): DashboardView {
  if (raw === "home") return "home";
  if (raw === "powerbridge" && powerbridgeEnabled) return "powerbridge";
  if (
    raw === "sales" ||
    raw === "recruiting" ||
    raw === "retention" ||
    raw === "agentfuel"
  ) {
    return raw;
  }
  if (powerbridgeEnabled) return "powerbridge";
  return "sales";
}

export function dashboardViewToPurpose(
  view: Exclude<DashboardView, "home" | "powerbridge">,
): PipelinePurpose {
  return view;
}

export function dashboardHref(opts: {
  view: DashboardView;
  month?: string;
}): string {
  const params = new URLSearchParams();
  params.set("view", opts.view);
  if (opts.month && opts.month !== "all") {
    params.set("month", opts.month);
  } else if (opts.month === "all") {
    params.set("month", "all");
  }
  return `/dashboard?${params.toString()}`;
}

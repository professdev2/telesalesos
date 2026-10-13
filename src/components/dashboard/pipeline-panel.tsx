import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PipelineDashboardStats } from "@/lib/dashboard/pipeline-stats";
import { leadListHref } from "@/lib/leads/list-href";
import { LEAD_PURPOSE_LABELS } from "@/lib/leads/validation";

export function PipelinePanel({ stats }: { stats: PipelineDashboardStats }) {
  const label = LEAD_PURPOSE_LABELS[stats.purpose];
  const boardHref = leadListHref({
    purpose: stats.purpose,
    view: "board",
  });
  const unreadHref = leadListHref({
    purpose: stats.purpose,
    unread: true,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">{label} desk</h2>
        <p className="text-muted-foreground text-sm">
          {stats.purpose === "agentfuel"
            ? "Applicants and $1600/mo membership. Move to Past due when payment stops, then Cut off when access is revoked. "
            : "Open pipeline snapshot. "}
          <Link href={boardHref} className="underline-offset-4 hover:underline">
            Open board
          </Link>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Open leads</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{stats.openLeads}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>
              {stats.purpose === "agentfuel" ? "Cut off / closed" : "Closed"}
            </CardDescription>
            <CardTitle className="text-2xl tabular-nums">{stats.closedLeads}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unread</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{stats.unread}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              href={unreadHref}
              className="text-muted-foreground text-xs underline-offset-4 hover:underline"
            >
              View unread
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Stages with activity</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {stats.stages.length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By stage</CardTitle>
          <CardDescription>
            Non-archived leads. Open stages are the work list; Cut off and other closed
            stages are listed here but not in Open leads.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.stages.length === 0 ? (
            <p className="text-muted-foreground text-sm">No open leads in this pipeline.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {stats.stages.map((stage) => (
                <li
                  key={stage.status}
                  className="flex items-center justify-between gap-3 border-b py-1.5 last:border-0"
                >
                  <span>{stage.label}</span>
                  <span className="tabular-nums font-medium">{stage.count}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

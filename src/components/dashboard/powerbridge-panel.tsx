import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PowerbridgeDashboardStats } from "@/lib/dashboard/powerbridge-stats";
import { formatMargin, formatMoney } from "@/lib/orders/validation";

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border px-3 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
      {hint ? <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p> : null}
    </div>
  );
}

function QueueCard({
  title,
  description,
  rows,
  empty,
}: {
  title: string;
  description: string;
  rows: PowerbridgeDashboardStats["collectQueue"];
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{empty}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {rows.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/orders/${row.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {row.companyName}
                  </Link>
                  <p className="text-muted-foreground text-xs">
                    {row.orderDate} · {row.detail}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums">
                  {formatMoney(row.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreTable({
  title,
  description,
  rows,
  empty,
}: {
  title: string;
  description: string;
  rows: PowerbridgeDashboardStats["byProvider"];
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{empty}</p>
        ) : (
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Orders</th>
                <th className="py-2 pr-3 font-medium">Collected</th>
                <th className="py-2 pr-3 font-medium">Cost</th>
                <th className="py-2 pr-3 font-medium">Profit</th>
                <th className="py-2 font-medium">Margin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{row.label}</td>
                  <td className="py-2 pr-3 tabular-nums">{row.orders}</td>
                  <td className="py-2 pr-3 tabular-nums">
                    {formatMoney(row.collected)}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {formatMoney(row.ourCost)}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {formatMoney(row.profit)}
                  </td>
                  <td className="py-2 tabular-nums">
                    {formatMargin(row.marginPct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export function PowerbridgePanel({
  rangeLabel,
  stats,
}: {
  rangeLabel: string;
  stats: PowerbridgeDashboardStats;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">PowerBridge orders desk</h2>
          <p className="text-muted-foreground text-sm">
            {rangeLabel}. Collect → pay providers → deliver.{" "}
            <Link href="/orders" className="underline-offset-4 hover:underline">
              Open orders
            </Link>
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Collected" value={formatMoney(stats.collected)} />
        <Kpi
          label="Profit"
          value={formatMoney(stats.profit)}
          hint={
            stats.marginPct != null ? `Margin ${formatMargin(stats.marginPct)}` : undefined
          }
        />
        <Kpi label="Orders" value={String(stats.orderCount)} />
        <Kpi
          label="Open risk"
          value={formatMoney(stats.openRisk)}
          hint={`AR ${formatMoney(stats.arOutstanding)} · Providers ${formatMoney(stats.owedProviders)}`}
        />
        <Kpi label="Undelivered" value={String(stats.undeliveredCount)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <QueueCard
          title="Collect"
          description="Customer unpaid or partial."
          rows={stats.collectQueue}
          empty="Nothing to collect in this range."
        />
        <QueueCard
          title="Pay providers"
          description="Provider not marked paid."
          rows={stats.providerQueue}
          empty="No unpaid provider balances."
        />
        <QueueCard
          title="Deliver"
          description="Not fully delivered yet."
          rows={stats.deliverQueue}
          empty="No open deliveries."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ScoreTable
          title="Provider scorecard"
          description="Collected / cost / profit by lead provider."
          rows={stats.byProvider}
          empty="No provider data in this range."
        />
        <ScoreTable
          title="Revenue by vertical"
          description="Uses fixed vertical options for clean reporting."
          rows={stats.byVertical}
          empty="No vertical data in this range."
        />
      </div>
    </div>
  );
}

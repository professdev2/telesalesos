import "server-only";

import { PIPELINE_BOARD_STAGES } from "@/lib/crm/pipelines";
import { countUnreadLeads, getLeadsForBoard } from "@/lib/leads/queries";
import { statusLabel, type LeadPurpose } from "@/lib/leads/validation";

export type StageCount = {
  status: string;
  label: string;
  count: number;
};

export type PipelineDashboardStats = {
  purpose: LeadPurpose;
  openLeads: number;
  closedLeads: number;
  unread: number;
  stages: StageCount[];
};

export async function getPipelineDashboardStats(
  purpose: LeadPurpose,
): Promise<PipelineDashboardStats> {
  const [leads, unread] = await Promise.all([
    getLeadsForBoard(purpose),
    countUnreadLeads(purpose),
  ]);

  const board = new Set<string>(PIPELINE_BOARD_STAGES[purpose]);
  let openLeads = 0;
  let closedLeads = 0;
  const counts = new Map<string, number>();
  for (const lead of leads) {
    if (board.has(lead.status)) openLeads += 1;
    else closedLeads += 1;
    counts.set(lead.status, (counts.get(lead.status) ?? 0) + 1);
  }

  const stages = [...counts.entries()]
    .map(([status, count]) => ({
      status,
      label: statusLabel(status),
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    purpose,
    openLeads,
    closedLeads,
    unread,
    stages,
  };
}

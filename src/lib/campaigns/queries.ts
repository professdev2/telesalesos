import "server-only";

import { cache } from "react";

import { requireActiveMembership } from "@/lib/org/active-org";
import { createClient } from "@/lib/supabase/server";
import {
  isCampaignPurpose,
  isCampaignStatus,
  type CampaignPurpose,
  type CampaignStatus,
} from "@/lib/campaigns/validation";

export type CampaignMember = {
  id: string;
  contactId: string;
  contactName: string;
  createdAt: string;
};

export type Campaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  purpose: CampaignPurpose;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  memberCount: number;
  members: CampaignMember[];
};

export type CampaignPage = {
  campaigns: Campaign[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

export const CAMPAIGNS_PAGE_SIZE = 25;

function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[%_,()"'\\]/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeCampaignSearch(raw: string | undefined): string {
  return raw ? sanitizeSearchTerm(raw).slice(0, 80) : "";
}

const CAMPAIGN_COLUMNS = "id, name, status, purpose, notes, archived_at, created_at";

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  purpose: string;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
};

type MemberRow = {
  id: string;
  contact_id: string;
  created_at: string;
  contacts: { full_name: string } | { full_name: string }[] | null;
};

function mapCampaign(row: CampaignRow, members: CampaignMember[] = []): Campaign | null {
  if (!isCampaignStatus(row.status) || !isCampaignPurpose(row.purpose)) return null;
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    purpose: row.purpose,
    notes: row.notes,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    memberCount: members.length,
    members,
  };
}

function mapMember(row: MemberRow): CampaignMember {
  const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
  return {
    id: row.id,
    contactId: row.contact_id,
    contactName: contact?.full_name ?? "Unknown contact",
    createdAt: row.created_at,
  };
}

async function loadMembers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  campaignIds: string[],
): Promise<Map<string, CampaignMember[]>> {
  const byCampaign = new Map<string, CampaignMember[]>();
  if (campaignIds.length === 0) return byCampaign;

  const { data, error } = await supabase
    .from("campaign_contacts")
    .select("id, campaign_id, contact_id, created_at, contacts(full_name)")
    .eq("organization_id", organizationId)
    .in("campaign_id", campaignIds)
    .order("created_at", { ascending: true });

  if (error || !data) return byCampaign;

  for (const row of data as (MemberRow & { campaign_id: string })[]) {
    const list = byCampaign.get(row.campaign_id) ?? [];
    list.push(mapMember(row));
    byCampaign.set(row.campaign_id, list);
  }
  return byCampaign;
}

export const getCampaignById = cache(async (id: string): Promise<Campaign | null> => {
  const membership = await requireActiveMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (error || !data) return null;
  const members = await loadMembers(supabase, membership.organizationId, [id]);
  return mapCampaign(data as CampaignRow, members.get(id) ?? []);
});

export const listCampaignsForContact = cache(async (contactId: string): Promise<Campaign[]> => {
  const membership = await requireActiveMembership();
  const supabase = await createClient();

  const { data: links, error: linkError } = await supabase
    .from("campaign_contacts")
    .select("campaign_id")
    .eq("organization_id", membership.organizationId)
    .eq("contact_id", contactId);

  if (linkError || !links?.length) return [];

  const ids = [...new Set(links.map((row) => row.campaign_id))];
  const { data, error } = await supabase
    .from("campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("organization_id", membership.organizationId)
    .in("id", ids)
    .order("name", { ascending: true });

  if (error || !data) return [];
  return (data as CampaignRow[])
    .map((row) => mapCampaign(row, []))
    .filter((row): row is Campaign => row !== null);
});

export const getCampaignPage = cache(
  async (
    search: string = "",
    requestedPage: number = 1,
    purpose: CampaignPurpose | null = null,
  ): Promise<CampaignPage> => {
    const membership = await requireActiveMembership();
    const supabase = await createClient();

    const term = normalizeCampaignSearch(search);
    const page =
      Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
    const from = (page - 1) * CAMPAIGNS_PAGE_SIZE;

    let query = supabase
      .from("campaigns")
      .select(CAMPAIGN_COLUMNS, { count: "exact" })
      .eq("organization_id", membership.organizationId)
      .is("archived_at", null);

    if (purpose) {
      query = query.eq("purpose", purpose);
    }

    if (term) {
      query = query.or(`name.ilike.%${term}%,notes.ilike.%${term}%`);
    }

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, from + CAMPAIGNS_PAGE_SIZE - 1);

    if (error || !data) {
      return { campaigns: [], total: 0, page: 1, pageCount: 1, pageSize: CAMPAIGNS_PAGE_SIZE };
    }

    const rows = data as CampaignRow[];
    const members = await loadMembers(
      supabase,
      membership.organizationId,
      rows.map((row) => row.id),
    );

    const total = count ?? 0;
    return {
      campaigns: rows
        .map((row) => mapCampaign(row, members.get(row.id) ?? []))
        .filter((row): row is Campaign => row !== null),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / CAMPAIGNS_PAGE_SIZE)),
      pageSize: CAMPAIGNS_PAGE_SIZE,
    };
  },
);

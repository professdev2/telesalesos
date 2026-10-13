import "server-only";

import { cache } from "react";

import { requireActiveMembership } from "@/lib/org/active-org";
import { createClient } from "@/lib/supabase/server";
import {
  coerceLeadPurpose,
  coerceLeadStatus,
  type LeadOption,
  type LeadPurpose,
  type LeadStatus,
} from "@/lib/leads/validation";

export type Lead = {
  id: string;
  contactId: string;
  contactName: string;
  companyId: string | null;
  companyName: string | null;
  purpose: LeadPurpose;
  status: LeadStatus;
  disposition: string | null;
  extra: Record<string, unknown>;
  notes: string | null;
  archivedAt: string | null;
  /** Null = unread (not opened yet). */
  viewedAt: string | null;
  createdAt: string;
};

export type LeadPage = {
  leads: Lead[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

export const LEADS_PAGE_SIZE = 25;
/** Board loads enough open cards without paging. */
export const LEADS_BOARD_LIMIT = 200;

function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[%_,()"'\\]/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeLeadSearch(raw: string | undefined): string {
  return raw ? sanitizeSearchTerm(raw).slice(0, 80) : "";
}

type LeadRow = {
  id: string;
  contact_id: string;
  company_id: string | null;
  purpose: string | null;
  status: string;
  disposition: string | null;
  extra: Record<string, unknown> | null;
  notes: string | null;
  archived_at: string | null;
  viewed_at: string | null;
  created_at: string;
  contacts: { full_name: string } | { full_name: string }[] | null;
  companies: { name: string } | { name: string }[] | null;
};

function mapLead(row: LeadRow): Lead | null {
  const purpose = coerceLeadPurpose(row.purpose);
  const status = coerceLeadStatus(purpose, row.status);
  if (!status) return null;
  const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
  const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
  return {
    id: row.id,
    contactId: row.contact_id,
    contactName: contact?.full_name ?? "Unknown contact",
    companyId: row.company_id,
    companyName: company?.name ?? null,
    purpose,
    status,
    disposition: row.disposition,
    extra:
      row.extra && typeof row.extra === "object" && !Array.isArray(row.extra)
        ? row.extra
        : {},
    notes: row.notes,
    archivedAt: row.archived_at,
    viewedAt: row.viewed_at,
    createdAt: row.created_at,
  };
}

const LEAD_SELECT =
  "id, contact_id, company_id, purpose, status, disposition, extra, notes, archived_at, viewed_at, created_at, contacts(full_name), companies(name)";

/**
 * A single lead in the active organization, including archived rows.
 */
export const getLeadById = cache(async (id: string): Promise<Lead | null> => {
  const membership = await requireActiveMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_SELECT)
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (error || !data) return null;
  return mapLead(data as LeadRow);
});

/**
 * One page of non-archived leads for the active organization.
 */
export const getLeadPage = cache(
  async (
    search: string = "",
    requestedPage: number = 1,
    purpose: LeadPurpose | null = null,
    unreadOnly: boolean = false,
  ): Promise<LeadPage> => {
    const membership = await requireActiveMembership();
    const supabase = await createClient();

    const term = normalizeLeadSearch(search);
    const page =
      Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
    const from = (page - 1) * LEADS_PAGE_SIZE;

    let matchingContactIds: string[] = [];
    if (term) {
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id")
        .eq("organization_id", membership.organizationId)
        .or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
      matchingContactIds = (contacts ?? []).map((row) => row.id);
    }

    let query = supabase
      .from("leads")
      .select(LEAD_SELECT, { count: "exact" })
      .eq("organization_id", membership.organizationId)
      .is("archived_at", null);

    if (purpose) {
      query = query.eq("purpose", purpose);
    }

    if (unreadOnly) {
      query = query.is("viewed_at", null);
    }

    if (term) {
      if (matchingContactIds.length > 0) {
        query = query.or(`notes.ilike.%${term}%,contact_id.in.(${matchingContactIds.join(",")})`);
      } else {
        query = query.ilike("notes", `%${term}%`);
      }
    }

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, from + LEADS_PAGE_SIZE - 1);

    if (error || !data) {
      return { leads: [], total: 0, page: 1, pageCount: 1, pageSize: LEADS_PAGE_SIZE };
    }

    const total = count ?? 0;
    return {
      leads: (data as LeadRow[]).map(mapLead).filter((lead): lead is Lead => lead !== null),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE)),
      pageSize: LEADS_PAGE_SIZE,
    };
  },
);

/** Count of open unread leads (optional purpose filter). */
export const countUnreadLeads = cache(
  async (purpose: LeadPurpose | null = null): Promise<number> => {
    const membership = await requireActiveMembership();
    const supabase = await createClient();

    let query = supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", membership.organizationId)
      .is("archived_at", null)
      .is("viewed_at", null);

    if (purpose) {
      query = query.eq("purpose", purpose);
    }

    const { count, error } = await query;
    if (error) return 0;
    return count ?? 0;
  },
);

/**
 * Non-archived leads for one pipeline, for the Kanban board.
 */
export const getLeadsForBoard = cache(
  async (
    purpose: LeadPurpose,
    search: string = "",
    unreadOnly: boolean = false,
  ): Promise<Lead[]> => {
    const membership = await requireActiveMembership();
    const supabase = await createClient();
    const term = normalizeLeadSearch(search);

    let matchingContactIds: string[] = [];
    if (term) {
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id")
        .eq("organization_id", membership.organizationId)
        .or(`full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
      matchingContactIds = (contacts ?? []).map((row) => row.id);
    }

    let query = supabase
      .from("leads")
      .select(LEAD_SELECT)
      .eq("organization_id", membership.organizationId)
      .eq("purpose", purpose)
      .is("archived_at", null);

    if (unreadOnly) {
      query = query.is("viewed_at", null);
    }

    if (term) {
      if (matchingContactIds.length > 0) {
        query = query.or(`notes.ilike.%${term}%,contact_id.in.(${matchingContactIds.join(",")})`);
      } else {
        query = query.ilike("notes", `%${term}%`);
      }
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(LEADS_BOARD_LIMIT);

    if (error || !data) return [];
    return (data as LeadRow[]).map(mapLead).filter((lead): lead is Lead => lead !== null);
  },
);

export type RetentionQueue =
  | "all"
  | "pending"
  | "payment"
  | "at_risk"
  | "lapsed";

const RETENTION_QUEUE_STATUSES: Record<
  Exclude<RetentionQueue, "all">,
  readonly string[]
> = {
  pending: ["pending", "requirements_needed"],
  payment: [
    "payment_monitoring",
    "payment_failed",
    "grace_period",
    "payment_arranged",
  ],
  at_risk: ["at_risk", "conservation", "reinstatement_pending"],
  lapsed: ["lapsed", "cancelled", "unable_to_save"],
};

export function normalizeRetentionQueue(raw: string | undefined): RetentionQueue {
  if (
    raw === "pending" ||
    raw === "payment" ||
    raw === "at_risk" ||
    raw === "lapsed"
  ) {
    return raw;
  }
  return "all";
}

/** Retention work queue — status buckets + days_past_due heuristic for at_risk. */
export const getRetentionQueueLeads = cache(
  async (queue: RetentionQueue = "all"): Promise<Lead[]> => {
    const leads = await getLeadsForBoard("retention");
    if (queue === "all") return leads;

    return leads.filter((lead) => {
      if (RETENTION_QUEUE_STATUSES[queue].includes(lead.status)) return true;
      if (queue === "at_risk") {
        const days = Number(lead.extra.days_past_due);
        return Number.isFinite(days) && days >= 1;
      }
      return false;
    });
  },
);

/**
 * Leads in the active organization for the call-record form.
 */
export const listLeadsForSelect = cache(async (): Promise<LeadOption[]> => {
  const membership = await requireActiveMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("leads")
    .select("id, contact_id, purpose, status, disposition, archived_at, created_at, contacts(full_name)")
    .eq("organization_id", membership.organizationId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) return [];

  return (data as LeadRow[])
    .map((row) => {
      const purpose = coerceLeadPurpose(row.purpose);
      const status = coerceLeadStatus(purpose, row.status);
      if (!status) return null;
      const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
      return {
        id: row.id,
        contactId: row.contact_id,
        contactName: contact?.full_name ?? "Unknown contact",
        status,
        purpose,
        createdAt: row.created_at,
        archived: row.archived_at !== null,
      };
    })
    .filter((row): row is LeadOption => row !== null);
});

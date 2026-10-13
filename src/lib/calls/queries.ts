import "server-only";

import { cache } from "react";

import { requireActiveMembership } from "@/lib/org/active-org";
import { createClient } from "@/lib/supabase/server";
import { isCallOutcome, type CallOutcome } from "@/lib/calls/validation";

export type CallRecord = {
  id: string;
  contactId: string;
  contactName: string;
  leadId: string | null;
  leadLabel: string | null;
  outcome: CallOutcome;
  notes: string | null;
  occurredAt: string;
  durationSeconds: number | null;
  createdAt: string;
};

export type CallRecordPage = {
  records: CallRecord[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

export const CALLS_PAGE_SIZE = 25;

function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[%_,()"'\\]/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeCallSearch(raw: string | undefined): string {
  return raw ? sanitizeSearchTerm(raw).slice(0, 80) : "";
}

type CallRow = {
  id: string;
  contact_id: string;
  lead_id: string | null;
  outcome: string;
  notes: string | null;
  occurred_at: string;
  duration_seconds: number | null;
  created_at: string;
  contacts: { full_name: string } | { full_name: string }[] | null;
};

function mapCall(row: CallRow): CallRecord | null {
  if (!isCallOutcome(row.outcome)) return null;
  const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
  return {
    id: row.id,
    contactId: row.contact_id,
    contactName: contact?.full_name ?? "Unknown contact",
    leadId: row.lead_id,
    leadLabel: null,
    outcome: row.outcome,
    notes: row.notes,
    occurredAt: row.occurred_at,
    durationSeconds: row.duration_seconds,
    createdAt: row.created_at,
  };
}

const SELECT_COLUMNS =
  "id, contact_id, lead_id, outcome, notes, occurred_at, duration_seconds, created_at, contacts(full_name)";

/**
 * A single call record in the active organization.
 *
 * Another tenant's id and a missing id both return null so the page can 404
 * without confirming the record exists.
 */
export const getCallRecordById = cache(async (id: string): Promise<CallRecord | null> => {
  const membership = await requireActiveMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("call_records")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (error || !data) return null;
  return mapCall(data as CallRow);
});

export const listCallRecordsForContact = cache(async (contactId: string): Promise<CallRecord[]> => {
  const membership = await requireActiveMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("call_records")
    .select(SELECT_COLUMNS)
    .eq("organization_id", membership.organizationId)
    .eq("contact_id", contactId)
    .order("occurred_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];
  return (data as CallRow[]).map(mapCall).filter((row): row is CallRecord => row !== null);
});

export const listCallRecordsForLead = cache(async (leadId: string): Promise<CallRecord[]> => {
  const membership = await requireActiveMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("call_records")
    .select(SELECT_COLUMNS)
    .eq("organization_id", membership.organizationId)
    .eq("lead_id", leadId)
    .order("occurred_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];
  return (data as CallRow[]).map(mapCall).filter((row): row is CallRecord => row !== null);
});

/**
 * One page of call records for the active organization.
 *
 * Search may look at notes and at contact names in this org. Both filters run
 * in the database. RLS is the security boundary.
 */
export const getCallRecordPage = cache(
  async (search: string = "", requestedPage: number = 1): Promise<CallRecordPage> => {
    const membership = await requireActiveMembership();
    const supabase = await createClient();

    const term = normalizeCallSearch(search);
    const page =
      Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
    const from = (page - 1) * CALLS_PAGE_SIZE;

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
      .from("call_records")
      .select(SELECT_COLUMNS, { count: "exact" })
      .eq("organization_id", membership.organizationId);

    if (term) {
      if (matchingContactIds.length > 0) {
        query = query.or(`notes.ilike.%${term}%,contact_id.in.(${matchingContactIds.join(",")})`);
      } else {
        query = query.ilike("notes", `%${term}%`);
      }
    }

    const { data, count, error } = await query
      .order("occurred_at", { ascending: false })
      .range(from, from + CALLS_PAGE_SIZE - 1);

    if (error || !data) {
      return { records: [], total: 0, page: 1, pageCount: 1, pageSize: CALLS_PAGE_SIZE };
    }

    const total = count ?? 0;
    return {
      records: (data as CallRow[]).map(mapCall).filter((row): row is CallRecord => row !== null),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / CALLS_PAGE_SIZE)),
      pageSize: CALLS_PAGE_SIZE,
    };
  },
);

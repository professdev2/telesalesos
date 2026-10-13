import "server-only";

import { cache } from "react";

import { requireActiveMembership } from "@/lib/org/active-org";
import { createClient } from "@/lib/supabase/server";
import type { CompanyPriority } from "@/lib/companies/validation";

export type Company = {
  id: string;
  name: string;
  website: string | null;
  imo: string | null;
  state: string | null;
  priority: CompanyPriority | null;
  notes: string | null;
  createdAt: string;
};

export type CompanyPage = {
  companies: Company[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

export const COMPANIES_PAGE_SIZE = 25;

const COMPANY_COLUMNS =
  "id, name, website, imo, state, priority, notes, created_at";

type CompanyRow = {
  id: string;
  name: string;
  website: string | null;
  imo: string | null;
  state: string | null;
  priority: string | null;
  notes: string | null;
  created_at: string;
};

function mapCompany(row: CompanyRow): Company {
  const priority =
    row.priority === "hot" || row.priority === "warm" || row.priority === "cold"
      ? row.priority
      : null;
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    imo: row.imo,
    state: row.state,
    priority,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[%_,()"'\\]/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeCompanySearch(raw: string | undefined): string {
  return raw ? sanitizeSearchTerm(raw).slice(0, 80) : "";
}

export const listCompaniesForSelect = cache(
  async (): Promise<{ id: string; name: string }[]> => {
    const membership = await requireActiveMembership();
    if (!membership.powerbridgeEnabled) return [];

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("companies")
      .select("id, name")
      .eq("organization_id", membership.organizationId)
      .order("name", { ascending: true })
      .limit(200);

    if (error) {
      console.error("listCompaniesForSelect failed", error.message);
      return [];
    }
    return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
  },
);

export type CompanyPickerOption = {
  id: string;
  label: string;
  description?: string;
};

const PICKER_LIMIT = 10;

/** Typeahead options for company pickers (PowerBridge orgs only). */
export async function searchCompaniesForPicker(
  term: string,
  limit: number = PICKER_LIMIT,
): Promise<CompanyPickerOption[]> {
  const membership = await requireActiveMembership();
  if (!membership.powerbridgeEnabled) return [];

  const supabase = await createClient();
  const take = Math.min(Math.max(limit, 1), 25);

  let query = supabase
    .from("companies")
    .select("id, name, imo, state")
    .eq("organization_id", membership.organizationId)
    .order("name", { ascending: true })
    .limit(take);

  if (term) {
    query = query.or(
      `name.ilike.%${term}%,imo.ilike.%${term}%,state.ilike.%${term}%,website.ilike.%${term}%`,
    );
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((row) => {
    const bits = [row.imo, row.state].filter(Boolean);
    return {
      id: row.id as string,
      label: row.name as string,
      description: bits.length ? bits.join(" · ") : undefined,
    };
  });
}

export const getCompanyById = cache(async (id: string): Promise<Company | null> => {
  const membership = await requireActiveMembership();
  if (!membership.powerbridgeEnabled) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select(COMPANY_COLUMNS)
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (error || !data) return null;
  return mapCompany(data as CompanyRow);
});

export const getCompanyPage = cache(
  async (search: string = "", requestedPage: number = 1): Promise<CompanyPage> => {
    const membership = await requireActiveMembership();
    if (!membership.powerbridgeEnabled) {
      return { companies: [], total: 0, page: 1, pageCount: 1, pageSize: COMPANIES_PAGE_SIZE };
    }

    const supabase = await createClient();
    const term = normalizeCompanySearch(search);
    const page =
      Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
    const from = (page - 1) * COMPANIES_PAGE_SIZE;

    let query = supabase
      .from("companies")
      .select(COMPANY_COLUMNS, { count: "exact" })
      .eq("organization_id", membership.organizationId)
      .order("name", { ascending: true })
      .range(from, from + COMPANIES_PAGE_SIZE - 1);

    if (term) {
      query = query.or(
        `name.ilike.%${term}%,imo.ilike.%${term}%,state.ilike.%${term}%,website.ilike.%${term}%`,
      );
    }

    const { data, error, count } = await query;
    const total = count ?? 0;
    const pageCount = Math.max(1, Math.ceil(total / COMPANIES_PAGE_SIZE));

    if (error || !data) {
      return {
        companies: [],
        total: 0,
        page: 1,
        pageCount: 1,
        pageSize: COMPANIES_PAGE_SIZE,
      };
    }

    return {
      companies: (data as CompanyRow[]).map(mapCompany),
      total,
      page: Math.min(page, pageCount),
      pageCount,
      pageSize: COMPANIES_PAGE_SIZE,
    };
  },
);

/** People linked to a company (for company detail). */
export const listCompanyContacts = cache(
  async (
    companyId: string,
  ): Promise<{ id: string; fullName: string; email: string | null; phone: string | null }[]> => {
    const membership = await requireActiveMembership();
    if (!membership.powerbridgeEnabled) return [];

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("contacts")
      .select("id, full_name, email, phone")
      .eq("organization_id", membership.organizationId)
      .eq("company_id", companyId)
      .order("full_name", { ascending: true })
      .limit(100);

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id as string,
      fullName: row.full_name as string,
      email: (row.email as string | null) ?? null,
      phone: (row.phone as string | null) ?? null,
    }));
  },
);

/** Open opportunities linked to a company (for company detail). */
export const listCompanyLeads = cache(
  async (
    companyId: string,
  ): Promise<{ id: string; contactName: string; status: string; purpose: string }[]> => {
    const membership = await requireActiveMembership();
    if (!membership.powerbridgeEnabled) return [];

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("leads")
      .select("id, purpose, status, contacts(full_name)")
      .eq("organization_id", membership.organizationId)
      .eq("company_id", companyId)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error || !data) return [];

    return data.map((row) => {
      const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
      return {
        id: row.id as string,
        contactName: (contact as { full_name?: string } | null)?.full_name ?? "Unknown",
        status: row.status as string,
        purpose: (row.purpose as string) ?? "powerbridge",
      };
    });
  },
);

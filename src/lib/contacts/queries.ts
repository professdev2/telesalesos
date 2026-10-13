import "server-only";

import { cache } from "react";

import { requireActiveMembership } from "@/lib/org/active-org";
import { createClient } from "@/lib/supabase/server";

export type Contact = {
  id: string;
  fullName: string;
  companyId: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  phoneSecondary: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  timezone: string | null;
  bestTimeToCall: string | null;
  leadSource: string | null;
  dnc: boolean;
  smsConsent: boolean;
  emailConsent: boolean;
  notes: string | null;
  createdAt: string;
};

export type ContactPage = {
  contacts: Contact[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

export const CONTACTS_PAGE_SIZE = 25;

const CONTACT_COLUMNS =
  "id, full_name, company_id, email, phone, phone_secondary, date_of_birth, gender, timezone, best_time_to_call, lead_source, dnc, sms_consent, email_consent, notes, created_at, companies(name)";

type ContactRow = {
  id: string;
  full_name: string;
  company_id: string | null;
  email: string | null;
  phone: string | null;
  phone_secondary: string | null;
  date_of_birth: string | null;
  gender: string | null;
  timezone: string | null;
  best_time_to_call: string | null;
  lead_source: string | null;
  dnc: boolean;
  sms_consent: boolean;
  email_consent: boolean;
  notes: string | null;
  created_at: string;
  companies: { name: string } | { name: string }[] | null;
};

function mapContact(row: ContactRow): Contact {
  const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
  return {
    id: row.id,
    fullName: row.full_name,
    companyId: row.company_id,
    companyName: company?.name ?? null,
    email: row.email,
    phone: row.phone,
    phoneSecondary: row.phone_secondary,
    dateOfBirth: toDateInputValue(row.date_of_birth),
    gender: row.gender,
    timezone: row.timezone,
    bestTimeToCall: row.best_time_to_call,
    leadSource: row.lead_source,
    dnc: row.dnc === true,
    smsConsent: row.sms_consent === true,
    emailConsent: row.email_consent === true,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

/** `type="date"` needs YYYY-MM-DD; PostgREST may return a full timestamp. */
function toDateInputValue(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

export const listContactsForSelect = cache(
  async (): Promise<{ id: string; fullName: string }[]> => {
    const membership = await requireActiveMembership();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("contacts")
      .select("id, full_name")
      .eq("organization_id", membership.organizationId)
      .order("full_name", { ascending: true })
      .limit(200);

    if (error || !data) return [];

    return data.map((row) => ({ id: row.id, fullName: row.full_name }));
  },
);

export type ContactPickerOption = {
  id: string;
  label: string;
  description?: string;
  companyId: string | null;
  companyName: string | null;
};

const PICKER_LIMIT = 10;

/** Typeahead options for lead/contact pickers (org-scoped). Optional company filter. */
export async function searchContactsForPicker(
  term: string,
  limit: number = PICKER_LIMIT,
  companyId?: string,
): Promise<ContactPickerOption[]> {
  const membership = await requireActiveMembership();
  const supabase = await createClient();
  const take = Math.min(Math.max(limit, 1), 25);

  let query = supabase
    .from("contacts")
    .select("id, full_name, email, phone, company_id, companies(name)")
    .eq("organization_id", membership.organizationId)
    .order("full_name", { ascending: true })
    .limit(take);

  if (companyId) {
    query = query.eq("company_id", companyId);
  }

  if (term) {
    query = query.or(
      `full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`,
    );
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((row) => {
    const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
    const bits = [row.phone, row.email, company?.name].filter(Boolean);
    return {
      id: row.id as string,
      label: row.full_name as string,
      description: bits.length ? bits.join(" · ") : undefined,
      companyId: (row.company_id as string | null) ?? null,
      companyName: company?.name ?? null,
    };
  });
}

function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[%_,()"'\\]/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeContactSearch(raw: string | undefined): string {
  return raw ? sanitizeSearchTerm(raw).slice(0, 80) : "";
}

export const getContactById = cache(async (id: string): Promise<Contact | null> => {
  const membership = await requireActiveMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .eq("id", id)
    .eq("organization_id", membership.organizationId)
    .maybeSingle();

  if (error || !data) return null;
  return mapContact(data as ContactRow);
});

export const getContactPage = cache(
  async (search: string = "", requestedPage: number = 1): Promise<ContactPage> => {
    const membership = await requireActiveMembership();
    const supabase = await createClient();

    const term = normalizeContactSearch(search);
    const page =
      Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
    const from = (page - 1) * CONTACTS_PAGE_SIZE;

    let query = supabase
      .from("contacts")
      .select(CONTACT_COLUMNS, { count: "exact" })
      .eq("organization_id", membership.organizationId);

    if (term) {
      query = query.or(
        `full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`,
      );
    }

    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, from + CONTACTS_PAGE_SIZE - 1);

    const total = count ?? 0;

    if (error || !data) {
      return { contacts: [], total: 0, page: 1, pageCount: 1, pageSize: CONTACTS_PAGE_SIZE };
    }

    return {
      contacts: (data as ContactRow[]).map(mapContact),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / CONTACTS_PAGE_SIZE)),
      pageSize: CONTACTS_PAGE_SIZE,
    };
  },
);

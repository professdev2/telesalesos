import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { defaultStatusForPurpose } from "@/lib/leads/validation";

/**
 * PowerBridge website FormSubmit field names (powerbridgemedia.com).
 * Main form + exit popup share most names; Offer / Aged Leads Vertical mark the 25% popup.
 */
export type PowerbridgeWebPayload = {
  name: string;
  email?: string;
  phone?: string;
  /** Company / agency name from the website forms (optional). */
  company?: string;
  interestedIn?: string;
  verticals?: string;
  otherVertical?: string;
  heardAbout?: string;
  message?: string;
  offer?: string;
  page?: string;
  agedLeadsVertical?: string;
  honey?: string;
  /** Thank-you redirect target from the form (`_next`). */
  nextUrl?: string;
  /** Email subject from the form (`_subject`). */
  subject?: string;
};

export type IngestResult =
  | { ok: true; contactId: string; leadId: string; campaignId: string; tagged25: boolean }
  | { ok: false; status: number; message: string };

function firstString(value: FormDataEntryValue | string | string[] | undefined): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value) && typeof value[0] === "string") return value[0].trim();
  return "";
}

/** Accept FormSubmit multipart/urlencoded or JSON with the same keys. */
export function parsePowerbridgeWebBody(
  raw: FormData | Record<string, unknown>,
): PowerbridgeWebPayload {
  const get = (key: string) => {
    if (raw instanceof FormData) return firstString(raw.get(key) ?? undefined);
    const value = raw[key];
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value) && typeof value[0] === "string") return value[0].trim();
    return "";
  };

  return {
    name: get("Name") || get("name"),
    email: get("Email") || get("email") || undefined,
    phone: get("Phone") || get("phone") || undefined,
    company:
      get("Company") ||
      get("Company Name") ||
      get("company") ||
      get("company_name") ||
      undefined,
    interestedIn: get("Interested In") || get("interested_in") || undefined,
    verticals: get("Verticals") || get("verticals") || undefined,
    otherVertical: get("Other Vertical") || get("other_vertical") || undefined,
    heardAbout:
      get("How Did You Hear About Us") || get("how_did_you_hear") || undefined,
    message: get("Message") || get("message") || undefined,
    offer: get("Offer") || get("offer") || undefined,
    page: get("Page") || get("page") || undefined,
    agedLeadsVertical:
      get("Aged Leads Vertical") || get("aged_leads_vertical") || undefined,
    honey: get("_honey") || get("honey") || undefined,
    nextUrl: get("_next") || get("next") || undefined,
    subject: get("_subject") || get("subject") || undefined,
  };
}

/** Only allow thank-you redirects on the PowerBridge site (no open redirect). */
export function safeThankYouUrl(nextUrl: string | undefined): string {
  const fallback = "https://powerbridgemedia.com/thank-you.html";
  if (!nextUrl) return fallback;
  try {
    const url = new URL(nextUrl);
    if (
      url.protocol === "https:" &&
      (url.hostname === "powerbridgemedia.com" ||
        url.hostname === "www.powerbridgemedia.com")
    ) {
      return url.toString();
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export function isTwentyFiveOffer(payload: PowerbridgeWebPayload): boolean {
  const offer = (payload.offer ?? "").toLowerCase();
  const next = (payload.nextUrl ?? "").toLowerCase();
  if (next.includes("aged-leads-offer")) return true;
  return offer.includes("25%") || offer.includes("25 percent") || offer.includes("25 off");
}

function leadSourceFor(tagged25: boolean): string {
  return tagged25 ? "Website — 25% aged leads" : "Website — Get Started";
}

function buildNotes(payload: PowerbridgeWebPayload, tagged25: boolean): string {
  const lines = [
    tagged25 ? "Tag: 25% aged leads offer" : "Tag: Get Started form",
    payload.company ? `Company: ${payload.company}` : null,
    payload.interestedIn ? `Interested in: ${payload.interestedIn}` : null,
    payload.verticals ? `Verticals: ${payload.verticals}` : null,
    payload.otherVertical ? `Other vertical: ${payload.otherVertical}` : null,
    payload.agedLeadsVertical
      ? `Aged leads vertical: ${payload.agedLeadsVertical}`
      : null,
    payload.heardAbout ? `Heard about us: ${payload.heardAbout}` : null,
    payload.page ? `Page: ${payload.page}` : null,
    payload.offer ? `Offer: ${payload.offer}` : null,
    payload.message ? `Message: ${payload.message}` : null,
  ].filter(Boolean);
  return lines.join("\n").slice(0, 2000);
}

async function resolveCampaignId(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  organizationId: string,
  campaignIdEnv: string | undefined,
  campaignName: string,
): Promise<string | null> {
  if (campaignIdEnv) {
    const { data } = await supabase
      .from("campaigns")
      .select("id")
      .eq("id", campaignIdEnv)
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  const { data: existing } = await supabase
    .from("campaigns")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", campaignName)
    .is("archived_at", null)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from("campaigns")
    .insert({
      organization_id: organizationId,
      name: campaignName,
      status: "active",
      purpose: "powerbridge",
      notes: "Inbound from powerbridgemedia.com (Get Started + 25% popup).",
    })
    .select("id")
    .maybeSingle();

  if (error || !created) {
    console.error("inbound campaign create failed", error?.message);
    return null;
  }
  return created.id;
}

/** Find or create a Company by name (case-insensitive) within the org. */
async function resolveCompanyIdByName(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  organizationId: string,
  companyName: string | undefined,
): Promise<string | null> {
  const name = companyName?.trim().slice(0, 160) ?? "";
  if (name.length < 1) return null;

  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from("companies")
    .insert({
      organization_id: organizationId,
      name,
      priority: "warm",
    })
    .select("id")
    .maybeSingle();

  if (error || !created) {
    console.error("inbound company create failed", error?.message);
    return null;
  }
  return created.id;
}

/**
 * Create/update contact, open a PowerBridge lead, attach to the website campaign.
 * Uses the service role (auth.uid() null → org guards allow).
 */
export async function ingestPowerbridgeWebLead(
  payload: PowerbridgeWebPayload,
): Promise<IngestResult> {
  if (payload.honey) {
    // Honeypot tripped — pretend success so bots don't retry.
    return {
      ok: true,
      contactId: "honeypot",
      leadId: "honeypot",
      campaignId: "honeypot",
      tagged25: false,
    };
  }

  const name = payload.name?.trim() ?? "";
  if (name.length < 2) {
    return { ok: false, status: 400, message: "Name is required." };
  }
  if (!payload.email && !payload.phone) {
    return { ok: false, status: 400, message: "Email or phone is required." };
  }

  const organizationId = process.env.POWERBRIDGE_INBOUND_ORG_ID?.trim();
  if (!organizationId) {
    return {
      ok: false,
      status: 503,
      message: "Inbound org is not configured (POWERBRIDGE_INBOUND_ORG_ID).",
    };
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return {
      ok: false,
      status: 503,
      message: "Server is missing SUPABASE_SECRET_KEY.",
    };
  }

  const tagged25 = isTwentyFiveOffer(payload);
  const leadSource = leadSourceFor(tagged25);
  const campaignName =
    process.env.POWERBRIDGE_INBOUND_CAMPAIGN_NAME?.trim() || "Website Leads";
  const campaignId = await resolveCampaignId(
    supabase,
    organizationId,
    process.env.POWERBRIDGE_INBOUND_CAMPAIGN_ID?.trim(),
    campaignName,
  );
  if (!campaignId) {
    return { ok: false, status: 500, message: "Could not resolve website campaign." };
  }

  const companyId = await resolveCompanyIdByName(
    supabase,
    organizationId,
    payload.company,
  );

  const email = payload.email?.trim().toLowerCase() || null;
  const phone = payload.phone?.trim() || null;

  let contactId: string | null = null;
  if (email) {
    const { data: byEmail } = await supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    contactId = byEmail?.id ?? null;
  }

  if (!contactId) {
    const { data: created, error } = await supabase
      .from("contacts")
      .insert({
        organization_id: organizationId,
        full_name: name.slice(0, 120),
        email,
        phone,
        company_id: companyId,
        lead_source: leadSource.slice(0, 120),
        notes: buildNotes(payload, tagged25),
      })
      .select("id")
      .maybeSingle();
    if (error || !created) {
      console.error("inbound contact insert failed", error?.message);
      return { ok: false, status: 500, message: "Could not create contact." };
    }
    contactId = created.id;
  } else {
    await supabase
      .from("contacts")
      .update({
        full_name: name.slice(0, 120),
        phone: phone ?? undefined,
        lead_source: leadSource.slice(0, 120),
        ...(companyId ? { company_id: companyId } : {}),
      })
      .eq("id", contactId)
      .eq("organization_id", organizationId);
  }

  const vertical =
    (payload.agedLeadsVertical || payload.verticals || payload.otherVertical || "")
      .slice(0, 80) || undefined;
  const companyName = payload.company?.trim().slice(0, 160) || undefined;

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      organization_id: organizationId,
      contact_id: contactId,
      company_id: companyId,
      purpose: "powerbridge",
      status: defaultStatusForPurpose("powerbridge"),
      notes: buildNotes(payload, tagged25),
      extra: {
        vertical: vertical || undefined,
        product_lead_type: payload.interestedIn?.slice(0, 80) || undefined,
        company_name: companyName,
        priority: tagged25 ? "hot" : undefined,
      },
    })
    .select("id")
    .maybeSingle();

  if (leadError || !lead) {
    console.error("inbound lead insert failed", leadError?.message);
    return { ok: false, status: 500, message: "Could not create lead." };
  }

  const { error: linkError } = await supabase.from("campaign_contacts").upsert(
    {
      organization_id: organizationId,
      campaign_id: campaignId,
      contact_id: contactId,
    },
    { onConflict: "campaign_id,contact_id", ignoreDuplicates: true },
  );

  if (linkError) {
    console.error("inbound campaign link failed", linkError.message);
    // Lead/contact already created — still success for the submitter.
  }

  return {
    ok: true,
    contactId: contactId as string,
    leadId: lead.id as string,
    campaignId,
    tagged25,
  };
}

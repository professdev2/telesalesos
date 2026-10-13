import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { defaultStatusForPurpose } from "@/lib/leads/validation";

export type LeadOptionTag = "company_assisted" | "buy_own" | "unknown";

export type LegacyRecruitPayload = {
  name: string;
  email?: string;
  phone?: string;
  leadOptionRaw?: string;
  leadOptionTag: LeadOptionTag;
  /** Extra Q&A lines for notes */
  answersSummary: string;
  formId?: string;
  responseId?: string;
};

export type RecruitIngestResult =
  | {
      ok: true;
      contactId: string;
      leadId: string;
      campaignId: string;
      leadOptionTag: LeadOptionTag;
    }
  | { ok: false; status: number; message: string };

type TypeformAnswer = {
  type?: string;
  text?: string;
  email?: string;
  phone_number?: string;
  boolean?: boolean;
  number?: number;
  choice?: { label?: string; other?: string };
  choices?: { labels?: string[]; other?: string };
  field?: { id?: string; ref?: string; type?: string };
};

type TypeformFieldDef = {
  id?: string;
  ref?: string;
  title?: string;
  type?: string;
};

function answerValue(answer: TypeformAnswer): string {
  if (answer.type === "email" && answer.email) return answer.email.trim();
  if (answer.type === "phone_number" && answer.phone_number) {
    return answer.phone_number.trim();
  }
  if (answer.type === "choice") {
    return (answer.choice?.label || answer.choice?.other || "").trim();
  }
  if (answer.type === "choices") {
    const labels = answer.choices?.labels ?? [];
    const other = answer.choices?.other ? [answer.choices.other] : [];
    return [...labels, ...other].filter(Boolean).join(", ");
  }
  if (answer.type === "boolean") return answer.boolean ? "Yes" : "No";
  if (answer.type === "number" && answer.number != null) return String(answer.number);
  if (answer.text) return answer.text.trim();
  return "";
}

export function classifyLeadOption(raw: string | undefined): LeadOptionTag {
  const text = (raw ?? "").toLowerCase();
  if (!text) return "unknown";
  if (
    text.includes("company assisted") ||
    text.includes("30%") ||
    text.includes("30 percent")
  ) {
    return "company_assisted";
  }
  if (
    text.includes("buying my own") ||
    text.includes("buy my own") ||
    text.includes("100%") ||
    text.includes("100 percent") ||
    text.includes("at cost")
  ) {
    return "buy_own";
  }
  return "unknown";
}

function leadSourceLabel(tag: LeadOptionTag): string {
  if (tag === "company_assisted") return "Typeform — Company assisted leads";
  if (tag === "buy_own") return "Typeform — Buying own leads";
  return "Typeform — Recruiting";
}

function recruitSourceExtra(tag: LeadOptionTag): string | undefined {
  if (tag === "company_assisted") return "Company assisted (30%)";
  if (tag === "buy_own") return "Buying own leads (100%)";
  return undefined;
}

/**
 * Parse a Typeform webhook body (form_response) into a flat recruiting payload.
 * Field titles are matched loosely so form edits don't break ingestion.
 */
export function parseTypeformRecruitBody(body: unknown): LegacyRecruitPayload | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const formResponse = (root.form_response ?? root) as Record<string, unknown>;
  if (!formResponse || typeof formResponse !== "object") return null;

  const definition = formResponse.definition as
    | { fields?: TypeformFieldDef[] }
    | undefined;
  const answers = (formResponse.answers as TypeformAnswer[] | undefined) ?? [];
  const titleById = new Map<string, string>();
  for (const field of definition?.fields ?? []) {
    if (field.id && field.title) titleById.set(field.id, field.title);
  }

  let name = "";
  let email = "";
  let phone = "";
  let leadOptionRaw = "";
  const summaryLines: string[] = [];

  for (const answer of answers) {
    const fieldId = answer.field?.id ?? "";
    const title = (titleById.get(fieldId) || answer.field?.ref || "Field").trim();
    const value = answerValue(answer);
    if (!value) continue;

    summaryLines.push(`${title}: ${value}`);
    const t = title.toLowerCase();

    if (!email && (answer.type === "email" || t.includes("email"))) {
      email = value;
      continue;
    }
    if (
      !phone &&
      (answer.type === "phone_number" || t.includes("phone") || t.includes("mobile"))
    ) {
      phone = value;
      continue;
    }
    if (
      !name &&
      (t.includes("full name") ||
        t === "name" ||
        t.startsWith("name ") ||
        t.includes("your name"))
    ) {
      name = value;
      continue;
    }
    if (
      !leadOptionRaw &&
      (t.includes("lead option") ||
        t.includes("most interested") ||
        t.includes("contract level"))
    ) {
      leadOptionRaw = value;
    }
  }

  // Typeform sometimes splits first/last name
  if (!name) {
    const first = summaryLines.find((line) => /first name/i.test(line))?.split(": ")[1];
    const last = summaryLines.find((line) => /last name/i.test(line))?.split(": ")[1];
    if (first || last) name = [first, last].filter(Boolean).join(" ");
  }

  if (!name && email) name = email.split("@")[0] ?? "Recruit";
  if (!name) return null;

  return {
    name: name.slice(0, 120),
    email: email || undefined,
    phone: phone || undefined,
    leadOptionRaw: leadOptionRaw || undefined,
    leadOptionTag: classifyLeadOption(leadOptionRaw),
    answersSummary: summaryLines.join("\n").slice(0, 2000),
    formId:
      typeof formResponse.form_id === "string" ? formResponse.form_id : undefined,
    responseId:
      typeof formResponse.token === "string" ? formResponse.token : undefined,
  };
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
      purpose: "recruiting",
      notes: "Inbound from Legacy Telesales Typeform.",
    })
    .select("id")
    .maybeSingle();

  if (error || !created) {
    console.error("recruiting inbound campaign create failed", error?.message);
    return null;
  }
  return created.id;
}

export async function ingestLegacyRecruitLead(
  payload: LegacyRecruitPayload,
): Promise<RecruitIngestResult> {
  if (!payload.email && !payload.phone) {
    return { ok: false, status: 400, message: "Email or phone is required." };
  }

  const organizationId = process.env.LEGACY_RECRUITING_INBOUND_ORG_ID?.trim();
  if (!organizationId) {
    return {
      ok: false,
      status: 503,
      message: "Inbound org is not configured (LEGACY_RECRUITING_INBOUND_ORG_ID).",
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

  const campaignName =
    process.env.LEGACY_RECRUITING_INBOUND_CAMPAIGN_NAME?.trim() ||
    "Legacy Recruiting — Typeform";
  const campaignId = await resolveCampaignId(
    supabase,
    organizationId,
    process.env.LEGACY_RECRUITING_INBOUND_CAMPAIGN_ID?.trim(),
    campaignName,
  );
  if (!campaignId) {
    return { ok: false, status: 500, message: "Could not resolve recruiting campaign." };
  }

  const leadSource = leadSourceLabel(payload.leadOptionTag);
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

  const notes = [
    `Lead option tag: ${payload.leadOptionTag}`,
    payload.leadOptionRaw ? `Lead option: ${payload.leadOptionRaw}` : null,
    payload.formId ? `Typeform: ${payload.formId}` : null,
    payload.answersSummary,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000);

  if (!contactId) {
    const { data: created, error } = await supabase
      .from("contacts")
      .insert({
        organization_id: organizationId,
        full_name: payload.name,
        email,
        phone,
        lead_source: leadSource.slice(0, 120),
        notes,
      })
      .select("id")
      .maybeSingle();
    if (error || !created) {
      console.error("recruiting contact insert failed", error?.message);
      return { ok: false, status: 500, message: "Could not create contact." };
    }
    contactId = created.id;
  } else {
    await supabase
      .from("contacts")
      .update({
        full_name: payload.name,
        phone: phone ?? undefined,
        lead_source: leadSource.slice(0, 120),
      })
      .eq("id", contactId)
      .eq("organization_id", organizationId);
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      organization_id: organizationId,
      contact_id: contactId,
      purpose: "recruiting",
      status: defaultStatusForPurpose("recruiting"),
      notes,
      extra: {
        recruit_source: recruitSourceExtra(payload.leadOptionTag) || "Typeform",
      },
    })
    .select("id")
    .maybeSingle();

  if (leadError || !lead) {
    console.error("recruiting lead insert failed", leadError?.message);
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
    console.error("recruiting campaign link failed", linkError.message);
  }

  return {
    ok: true,
    contactId: contactId as string,
    leadId: lead.id as string,
    campaignId,
    leadOptionTag: payload.leadOptionTag,
  };
}

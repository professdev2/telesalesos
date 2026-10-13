import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

import {
  ingestAgentfuelLead,
  parseTypeformAgentfuelBody,
} from "@/lib/inbound/agentfuel-typeform";

function authorized(request: NextRequest, rawBody: string): boolean {
  const sharedSecret = process.env.AGENTFUEL_INBOUND_SECRET?.trim();
  const typeformSecret = process.env.TYPEFORM_WEBHOOK_SECRET?.trim();

  if (sharedSecret) {
    const header =
      request.headers.get("x-inbound-secret")?.trim() ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    const query = request.nextUrl.searchParams.get("key")?.trim();
    if (header === sharedSecret || query === sharedSecret) return true;
  }

  if (typeformSecret) {
    const signature = request.headers.get("typeform-signature");
    if (signature?.startsWith("sha256=")) {
      const expected =
        "sha256=" +
        createHmac("sha256", typeformSecret).update(rawBody).digest("base64");
      try {
        const a = Buffer.from(signature);
        const b = Buffer.from(expected);
        if (a.length === b.length && timingSafeEqual(a, b)) return true;
      } catch {
        /* ignore */
      }
    }
  }

  return false;
}

/**
 * Typeform webhook → AgentFuel applicant campaign ($1600/mo membership).
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!authorized(request, rawBody)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const payload = parseTypeformAgentfuelBody(json);
  if (!payload) {
    return NextResponse.json(
      { ok: false, error: "Could not parse Typeform response (need a name)." },
      { status: 400 },
    );
  }

  const result = await ingestAgentfuelLead(payload);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.message },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    contactId: result.contactId,
    leadId: result.leadId,
    campaignId: result.campaignId,
  });
}

import { NextResponse, type NextRequest } from "next/server";

import {
  ingestPowerbridgeWebLead,
  parsePowerbridgeWebBody,
} from "@/lib/inbound/powerbridge-web";

const ALLOWED_ORIGINS = new Set([
  "https://powerbridgemedia.com",
  "https://www.powerbridgemedia.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function corsHeaders(origin: string | null): HeadersInit {
  const allowed =
    origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://powerbridgemedia.com";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function authorized(request: NextRequest): boolean {
  const expected = process.env.POWERBRIDGE_INBOUND_SECRET?.trim();
  if (!expected) return false;
  // Query key only — background browser posts must not need custom headers/cookies.
  const query = request.nextUrl.searchParams.get("key")?.trim();
  return query === expected;
}

/**
 * Background copy of powerbridgemedia.com FormSubmit posts.
 * FormSubmit still handles visitor redirect + Jake's email.
 * This endpoint only ingests into CRM and returns 204.
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  if (!authorized(request)) {
    return new NextResponse(null, { status: 401, headers });
  }

  let payload;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      payload = parsePowerbridgeWebBody((await request.json()) as Record<string, unknown>);
    } else {
      // Spec: application/x-www-form-urlencoded (or multipart)
      payload = parsePowerbridgeWebBody(await request.formData());
    }
  } catch (error) {
    console.error("powerbridge inbound parse failed", error);
    return new NextResponse(null, { status: 400, headers });
  }

  const result = await ingestPowerbridgeWebLead(payload);
  if (!result.ok) {
    console.error("powerbridge inbound ingest failed", result.message, {
      name: payload.name,
      email: payload.email,
    });
    // Still 204 so a CRM blip does not break the site background send.
    return new NextResponse(null, { status: 204, headers });
  }

  return new NextResponse(null, { status: 204, headers });
}

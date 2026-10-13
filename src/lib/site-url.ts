import { headers } from "next/headers";

/**
 * Absolute origin for links Supabase emails back to the user.
 *
 * Prefers the configured site URL because forwarded headers can be spoofed and
 * because preview deployments otherwise email links to a throwaway hostname.
 */
export async function getSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const protocol =
    headerList.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") ? "http" : "https");

  return `${protocol}://${host ?? "localhost:3000"}`;
}

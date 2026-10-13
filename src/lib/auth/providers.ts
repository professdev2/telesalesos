import "server-only";

const TTL_MS = 5 * 60 * 1000;

let cached: { enabled: boolean; at: number } | null = null;

/**
 * Whether the Google provider is switched on in Supabase Auth.
 *
 * Reads the public `/auth/v1/settings` endpoint so the button appears as soon
 * as the provider is enabled in the dashboard, without a redeploy. Any failure
 * hides the button rather than showing one that cannot work.
 */
export async function isGoogleAuthEnabled(): Promise<boolean> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.enabled;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return false;

  let enabled = false;
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      const settings = (await response.json()) as { external?: { google?: boolean } };
      enabled = settings.external?.google === true;
    }
  } catch (error) {
    console.error("auth settings lookup failed", error);
  }

  cached = { enabled, at: Date.now() };
  return enabled;
}

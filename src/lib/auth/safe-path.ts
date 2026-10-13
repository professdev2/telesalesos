/**
 * Only relative, single-slash paths. A crafted `next` cannot bounce the user
 * onto another origin.
 */
export function safeRedirectPath(
  value: FormDataEntryValue | string | null | undefined,
  fallback = "/dashboard",
  origin?: string,
): string {
  if (typeof value !== "string") return fallback;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (!origin) return fallback;
  try {
    const url = new URL(value);
    if (url.origin !== origin) return fallback;
    if (!url.pathname.startsWith("/") || url.pathname.startsWith("//")) return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

/** Carry `next` onto enroll/challenge so invite accept survives MFA. */
export function withNextParam(path: string, next: string): string {
  if (!next || next === "/dashboard" || next === path) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}next=${encodeURIComponent(next)}`;
}

export function nextFromSearchParams(
  params: { next?: string | string[] | undefined },
): string {
  const raw = params.next;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return safeRedirectPath(value, "/dashboard");
}

export function isInvitePath(path: string): boolean {
  return path.startsWith("/invite/");
}

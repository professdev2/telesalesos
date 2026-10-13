import type { LeadPurpose } from "@/lib/leads/validation";

export function leadListHref({
  term = "",
  page,
  purpose = null,
  view = null,
  unread = false,
}: {
  term?: string;
  page?: number;
  purpose?: LeadPurpose | null;
  view?: "list" | "board" | null;
  /** When true, only leads that have not been opened yet. */
  unread?: boolean;
}): string {
  const params = new URLSearchParams();
  if (term) params.set("q", term);
  if (page && page > 1) params.set("page", String(page));
  if (purpose) params.set("purpose", purpose);
  if (view && view !== "list") params.set("view", view);
  if (unread) params.set("unread", "1");
  const qs = params.toString();
  return qs ? `/leads?${qs}` : "/leads";
}

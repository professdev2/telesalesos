import "server-only";

import { cache } from "react";

import { requireActiveMembership } from "@/lib/org/active-org";
import { createClient } from "@/lib/supabase/server";

export type Tag = {
  id: string;
  name: string;
};

export const listOrgTags = cache(async (): Promise<Tag[]> => {
  const membership = await requireActiveMembership();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .select("id, name")
    .eq("organization_id", membership.organizationId)
    .order("name", { ascending: true })
    .limit(200);

  if (error || !data) return [];
  return data.map((row) => ({ id: row.id as string, name: row.name as string }));
});

export const listTagsForContact = cache(async (contactId: string): Promise<Tag[]> => {
  const membership = await requireActiveMembership();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_tags")
    .select("tag_id, tags(id, name)")
    .eq("organization_id", membership.organizationId)
    .eq("contact_id", contactId);

  if (error || !data) return [];

  const tags: Tag[] = [];
  for (const row of data) {
    const nested = row.tags as { id: string; name: string } | { id: string; name: string }[] | null;
    const tag = Array.isArray(nested) ? nested[0] : nested;
    if (tag?.id && tag.name) tags.push({ id: tag.id, name: tag.name });
  }
  return tags.sort((a, b) => a.name.localeCompare(b.name));
});

/** Tags keyed by contact id for campaign / list pages. */
export async function listTagsForContacts(
  contactIds: string[],
): Promise<Map<string, Tag[]>> {
  const map = new Map<string, Tag[]>();
  if (contactIds.length === 0) return map;

  const membership = await requireActiveMembership();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_tags")
    .select("contact_id, tags(id, name)")
    .eq("organization_id", membership.organizationId)
    .in("contact_id", contactIds);

  if (error || !data) return map;

  for (const row of data) {
    const contactId = row.contact_id as string;
    const nested = row.tags as { id: string; name: string } | { id: string; name: string }[] | null;
    const tag = Array.isArray(nested) ? nested[0] : nested;
    if (!tag?.id || !tag.name) continue;
    const list = map.get(contactId) ?? [];
    list.push({ id: tag.id, name: tag.name });
    map.set(contactId, list);
  }

  for (const [id, list] of map) {
    map.set(
      id,
      list.sort((a, b) => a.name.localeCompare(b.name)),
    );
  }
  return map;
}

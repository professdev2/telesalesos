/**
 * Check recent inbound contacts/leads for Nicolas PowerBridge org.
 *   node scripts/check-powerbridge-inbound.mjs
 */
import { readFile } from "node:fs/promises";

const raw = await readFile(new URL("../.env.local", import.meta.url), "utf8");
const env = {};
for (const line of raw.split(/\r?\n/)) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const org = "021593fa-067a-48c5-b70a-4448d67ffb39"; // Jake Lynn (active PowerBridge org)
const headers = { apikey: key, Authorization: `Bearer ${key}` };

const contacts = await fetch(
  `${url}/rest/v1/contacts?organization_id=eq.${org}&select=id,full_name,email,lead_source,created_at&order=created_at.desc&limit=8`,
  { headers },
);
const leads = await fetch(
  `${url}/rest/v1/leads?organization_id=eq.${org}&purpose=eq.powerbridge&select=id,contact_id,status,notes,created_at&order=created_at.desc&limit=8`,
  { headers },
);

console.log("CONTACTS", JSON.stringify(await contacts.json(), null, 2));
console.log("LEADS", JSON.stringify(await leads.json(), null, 2));

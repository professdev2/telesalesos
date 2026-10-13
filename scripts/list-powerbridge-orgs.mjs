/**
 *   node scripts/list-powerbridge-orgs.mjs
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
if (!url || !key) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };

const orgsRes = await fetch(
  `${url}/rest/v1/organizations?powerbridge_enabled=eq.true&select=id,name,account_type`,
  { headers },
);
const orgs = await orgsRes.json();

for (const org of orgs) {
  const mem = await fetch(
    `${url}/rest/v1/organization_memberships?organization_id=eq.${org.id}&status=eq.active&select=role,user_id`,
    { headers },
  );
  const members = await mem.json();
  console.log(
    `${org.name} | ${org.account_type} | ${org.id} | members=${Array.isArray(members) ? members.length : "?"}`,
  );
}

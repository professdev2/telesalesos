/**
 * Read-only TOTP factor check for one user on Staging.
 *
 * The admin "list users" endpoint does not always include factors, so this
 * fetches the single user record, which does.
 *
 *   node scripts/check-user-factors.mjs someone@example.com
 *
 * Prints no keys, no secrets, no QR data. Makes no changes.
 */

import { execFileSync } from "node:child_process";

const EMAIL = (process.argv[2] ?? "").trim().toLowerCase();
if (!EMAIL) {
  console.error("Usage: node scripts/check-user-factors.mjs <email>");
  process.exit(1);
}

const REF = "ceyaylgqcletophrjlja";

function serviceKey(ref) {
  const raw = execFileSync(
    "npx",
    ["supabase", "projects", "api-keys", "--project-ref", ref, "--reveal", "--output", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], shell: true },
  );
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  const json = JSON.parse(raw.slice(start, end + 1));
  const row =
    json.find((k) => k.secret_jwt_template?.role === "service_role") ??
    json.find((k) => k.type === "secret") ??
    json.find((k) => k.name === "service_role");
  return row?.api_key ?? row?.apiKey ?? null;
}

const key = serviceKey(REF);
const headers = { apikey: key, Authorization: `Bearer ${key}` };

const listRes = await fetch(
  `https://${REF}.supabase.co/auth/v1/admin/users?page=1&per_page=200`,
  { headers },
);
const { users = [] } = await listRes.json();
const match = users.find((u) => (u.email ?? "").toLowerCase() === EMAIL);

if (!match) {
  console.log(`${EMAIL}: NOT FOUND`);
  process.exit(0);
}

const oneRes = await fetch(`https://${REF}.supabase.co/auth/v1/admin/users/${match.id}`, {
  headers,
});
const one = await oneRes.json();
const factors = one.factors ?? [];

console.log(`\n${EMAIL}`);
console.log(`  factors: ${factors.length}`);
for (const factor of factors) {
  console.log(
    `    - ${factor.factor_type} "${factor.friendly_name ?? "unnamed"}" status=${factor.status} created=${factor.created_at}`,
  );
}

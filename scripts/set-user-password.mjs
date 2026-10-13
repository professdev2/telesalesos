/**
 * Sets a new password for one Staging user via the Auth admin API.
 *
 * Existing passwords are stored as one-way hashes and cannot be read. When a
 * test account's password is lost, the only options are the recovery email or
 * this — an explicit, audited reset by someone holding the admin key.
 *
 *   node scripts/set-user-password.mjs someone@example.com 'NewPassword123'
 *
 * Staging only. Do not use this against a project holding real customer data.
 * The new password must satisfy both Supabase's minimum length and
 * src/lib/auth/validation.ts: 12+ chars with lower, upper, and a digit.
 */

import { execFileSync } from "node:child_process";

const EMAIL = (process.argv[2] ?? "").trim().toLowerCase();
const PASSWORD = process.argv[3] ?? "";

if (!EMAIL || !PASSWORD) {
  console.error("Usage: node scripts/set-user-password.mjs <email> <new-password>");
  process.exit(1);
}

if (
  PASSWORD.length < 12 ||
  !/[a-z]/.test(PASSWORD) ||
  !/[A-Z]/.test(PASSWORD) ||
  !/[0-9]/.test(PASSWORD)
) {
  console.error("Password must be 12+ characters with a lowercase, an uppercase, and a digit.");
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
if (!key) {
  console.error("No service_role key available.");
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

const listRes = await fetch(
  `https://${REF}.supabase.co/auth/v1/admin/users?page=1&per_page=200`,
  { headers },
);
const { users = [] } = await listRes.json();
const match = users.find((u) => (u.email ?? "").toLowerCase() === EMAIL);

if (!match) {
  console.error(`${EMAIL}: NOT FOUND in Staging.`);
  process.exit(1);
}

const res = await fetch(`https://${REF}.supabase.co/auth/v1/admin/users/${match.id}`, {
  method: "PUT",
  headers,
  body: JSON.stringify({ password: PASSWORD }),
});

if (!res.ok) {
  console.error(`Failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}

console.log(`Password updated for ${EMAIL}.`);
console.log("Authenticator factors are unchanged — sign-in still asks for the 6-digit code.");

/**
 * Read-only roster of Auth users and their org roles on Staging.
 *
 * Answers "which account can test as a plain member?". An account that is
 * owner or admin anywhere is privileged and must use TOTP, so it is a poor
 * subject for a member walkthrough.
 *
 *   node scripts/list-member-accounts.mjs
 *
 * Prints no keys, no hashes, no tokens. Makes no changes.
 */

import { execFileSync } from "node:child_process";

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

const headers = { apikey: key, Authorization: `Bearer ${key}` };

const usersRes = await fetch(
  `https://${REF}.supabase.co/auth/v1/admin/users?page=1&per_page=200`,
  { headers },
);
const { users = [] } = await usersRes.json();

const membershipRes = await fetch(
  `https://${REF}.supabase.co/rest/v1/organization_memberships` +
    `?select=user_id,role,status,organizations(name)`,
  { headers },
);
const memberships = membershipRes.ok ? await membershipRes.json() : [];

const adminRes = await fetch(
  `https://${REF}.supabase.co/rest/v1/platform_admins?select=user_id`,
  { headers },
);
const platformAdmins = adminRes.ok ? await adminRes.json() : [];
const platformAdminIds = new Set(platformAdmins.map((r) => r.user_id));

for (const user of users) {
  const rows = memberships.filter((m) => m.user_id === user.id);
  const active = rows.filter((r) => r.status === "active");
  const privileged =
    platformAdminIds.has(user.id) ||
    active.some((r) => r.role === "owner" || r.role === "admin");

  const orgs = active.length
    ? active.map((r) => `${r.organizations?.name ?? "?"} (${r.role})`).join("; ")
    : "none";

  console.log(`\n${user.email}`);
  console.log(`  confirmed:   ${Boolean(user.email_confirmed_at)}`);
  console.log(`  factors:     ${(user.factors ?? []).length}`);
  console.log(`  orgs:        ${orgs}`);
  console.log(`  platform:    ${platformAdminIds.has(user.id) ? "yes" : "no"}`);
  console.log(
    `  MFA policy:  ${
      privileged
        ? "PRIVILEGED — TOTP required"
        : active.length
          ? "member — Email OTP allowed"
          : "no org — would land on /no-organization"
    }`,
  );
}

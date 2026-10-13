/**
 * Read-only Auth lookup for one email address.
 *
 * Answers the only question that matters when a valid-looking password is
 * rejected: does this user exist in this project, and is it confirmed?
 *
 *   node scripts/check-auth-user.mjs someone@example.com
 *
 * Prints no keys, no password hashes, no tokens. Makes no changes.
 */

import { execFileSync } from "node:child_process";

const EMAIL = (process.argv[2] ?? "").trim().toLowerCase();
if (!EMAIL) {
  console.error("Usage: node scripts/check-auth-user.mjs <email>");
  process.exit(1);
}

const PROJECTS = [
  { ref: "ceyaylgqcletophrjlja", name: "TelesalesOS Staging (live site uses this)" },
  { ref: "gbkdkfdcmztipbkucqhe", name: "TelesalesOS Production (unused by the app)" },
];

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

for (const project of PROJECTS) {
  let key;
  try {
    key = serviceKey(project.ref);
  } catch {
    console.log(`${project.name}: could not read admin key (skipped)`);
    continue;
  }
  if (!key) {
    console.log(`${project.name}: no service_role key available (skipped)`);
    continue;
  }

  const res = await fetch(
    `https://${project.ref}.supabase.co/auth/v1/admin/users?page=1&per_page=200`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) {
    console.log(`${project.name}: admin list failed (${res.status})`);
    continue;
  }

  const { users = [] } = await res.json();
  const match = users.find((u) => (u.email ?? "").toLowerCase() === EMAIL);

  console.log(`\n${project.name}`);
  console.log(`  total users: ${users.length}`);
  if (!match) {
    console.log(`  ${EMAIL}: NOT FOUND`);
    continue;
  }
  console.log(`  ${EMAIL}: FOUND`);
  console.log(`    created_at:        ${match.created_at}`);
  console.log(`    email_confirmed:   ${Boolean(match.email_confirmed_at)}`);
  console.log(`    last_sign_in_at:   ${match.last_sign_in_at ?? "never"}`);
  console.log(`    updated_at:        ${match.updated_at}`);
  console.log(`    identities:        ${(match.identities ?? []).map((i) => i.provider).join(", ") || "none"}`);
  console.log(`    banned_until:      ${match.banned_until ?? "no"}`);
  console.log(`    mfa factors:       ${(match.factors ?? []).length}`);

  const memberships = await fetch(
    `https://${project.ref}.supabase.co/rest/v1/organization_memberships` +
      `?user_id=eq.${match.id}&select=role,status,organizations(name)`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (memberships.ok) {
    const rows = await memberships.json();
    console.log(
      `    memberships:       ${
        rows.length
          ? rows.map((r) => `${r.organizations?.name ?? "?"} (${r.role}/${r.status})`).join("; ")
          : "NONE — would land on /no-organization"
      }`,
    );
  } else {
    console.log(`    memberships:       lookup failed (${memberships.status})`);
  }
}

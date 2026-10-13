/**
 * Deletes ONE Auth user from ONE Supabase project. Owner-approved cleanup only.
 *
 *   node scripts/delete-auth-user.mjs <project-ref> <email> --yes
 *
 * Refuses to run without --yes. Prints no keys. Does not touch any other user.
 *
 * Deleting an owner in a migrated project fails: `organizations.created_by`
 * is frozen by a trigger while the foreign key tries to null it. That is why
 * this is only safe on a project with no application tables.
 */

import { execFileSync } from "node:child_process";

const [ref, emailArg] = process.argv.slice(2);
const email = (emailArg ?? "").trim().toLowerCase();
const confirmed = process.argv.includes("--yes");

if (!ref || !email) {
  console.error("Usage: node scripts/delete-auth-user.mjs <project-ref> <email> --yes");
  process.exit(1);
}
if (!confirmed) {
  console.error("Refusing to delete without --yes");
  process.exit(1);
}

function serviceKey(projectRef) {
  const raw = execFileSync(
    "npx",
    ["supabase", "projects", "api-keys", "--project-ref", projectRef, "--reveal", "--output", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], shell: true },
  );
  const json = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1));
  const row =
    json.find((k) => k.secret_jwt_template?.role === "service_role") ??
    json.find((k) => k.type === "secret");
  return row?.api_key ?? null;
}

const key = serviceKey(ref);
if (!key) {
  console.error("No admin key available for that project.");
  process.exit(1);
}

const auth = { apikey: key, Authorization: `Bearer ${key}` };

const listRes = await fetch(`https://${ref}.supabase.co/auth/v1/admin/users?page=1&per_page=200`, {
  headers: auth,
});
const { users = [] } = await listRes.json();
const match = users.find((u) => (u.email ?? "").toLowerCase() === email);

if (!match) {
  console.log(`${email} is not in ${ref}. Nothing to do.`);
  process.exit(0);
}

console.log(`Deleting ${email} from ${ref} (created ${match.created_at})`);

const delRes = await fetch(`https://${ref}.supabase.co/auth/v1/admin/users/${match.id}`, {
  method: "DELETE",
  headers: auth,
});

if (!delRes.ok) {
  console.error(`Delete failed: ${delRes.status} ${await delRes.text()}`);
  process.exit(1);
}

const after = await fetch(`https://${ref}.supabase.co/auth/v1/admin/users?page=1&per_page=200`, {
  headers: auth,
});
const { users: remaining = [] } = await after.json();
const stillThere = remaining.some((u) => (u.email ?? "").toLowerCase() === email);

console.log(`Deleted. ${email} present in ${ref}: ${stillThere}`);
console.log(`Users remaining in ${ref}: ${remaining.length}`);

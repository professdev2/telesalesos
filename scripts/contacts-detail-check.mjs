/**
 * Detail-route checks for `contacts`.
 *
 * The security-relevant property: a contact belonging to another organization
 * must be indistinguishable from an id that never existed. If a foreign id
 * behaves differently from a random one, the difference confirms the record is
 * real — a membership oracle.
 *
 *   node scripts/contacts-detail-check.mjs
 *
 * Also confirms `notes` round-trips, since the detail form is the only place
 * that column can be written.
 */

import { readFile } from "node:fs/promises";

async function loadEnv() {
  const raw = await readFile(new URL("../.env.local", import.meta.url), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing Supabase URL or publishable key in .env.local");
  }
  return env;
}

const results = [];
function record(name, detail, pass) {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
}

async function main() {
  const env = await loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const signIn = async (email, password) => {
    const body = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then((r) => r.json());
    if (!body.access_token) throw new Error(`Could not sign in as ${email}`);
    return body.access_token;
  };

  const rest = (token) => async (path, init = {}) => {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...(init.headers ?? {}),
      },
    });
    return { status: res.status, ok: res.ok, body: await res.json().catch(() => null) };
  };

  const asA = rest(await signIn("isolation.a.d10@gmail.com", env.ISOLATION_A_PASSWORD));
  const asB = rest(await signIn("isolation.b.d10@gmail.com", env.ISOLATION_B_PASSWORD));

  const bob = (await asB("contacts?select=id&full_name=eq.Bob%20B")).body?.[0];
  const alice = (await asA("contacts?select=id,notes&full_name=eq.Alice%20A")).body?.[0];
  if (!bob || !alice) throw new Error("Seed rows missing. Run scripts/isolation-contacts.mjs.");

  // The page looks up by id scoped to the caller's organization. Both of these
  // must come back empty for the route to render the same 404.
  const foreign = await asA(`contacts?select=id&id=eq.${bob.id}`);
  const random = await asA("contacts?select=id&id=eq.00000000-0000-4000-8000-000000000000");

  record(
    "A fetching Org B's contact by id",
    `${foreign.status} ${JSON.stringify(foreign.body)}`,
    Array.isArray(foreign.body) && foreign.body.length === 0,
  );
  record(
    "A fetching an id that never existed",
    `${random.status} ${JSON.stringify(random.body)}`,
    Array.isArray(random.body) && random.body.length === 0,
  );
  record(
    "Both cases are indistinguishable",
    `${foreign.status} vs ${random.status}, ${JSON.stringify(foreign.body)} vs ${JSON.stringify(random.body)}`,
    foreign.status === random.status &&
      JSON.stringify(foreign.body) === JSON.stringify(random.body),
  );

  // notes round-trip, then restored to whatever it was before.
  const marker = `Detail check ${new Date().toISOString()}`;
  await asA(`contacts?id=eq.${alice.id}`, {
    method: "PATCH",
    body: JSON.stringify({ notes: marker }),
  });
  const readBack = (await asA(`contacts?select=notes&id=eq.${alice.id}`)).body?.[0]?.notes;
  await asA(`contacts?id=eq.${alice.id}`, {
    method: "PATCH",
    body: JSON.stringify({ notes: alice.notes }),
  });
  const restored = (await asA(`contacts?select=notes&id=eq.${alice.id}`)).body?.[0]?.notes;

  record("notes is writable and reads back", JSON.stringify(readBack), readBack === marker);
  record(
    "notes restored to its previous value",
    JSON.stringify(restored),
    restored === alice.notes,
  );

  const failed = results.filter((pass) => !pass).length;
  console.log(
    `\n${failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`} — ${results.length} total`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`);
  process.exit(1);
});

/**
 * Tenant isolation proof for the contact **edit** path.
 *
 * `scripts/isolation-contacts.mjs` covers read, insert, and anonymous access.
 * Editing is a separate write surface with its own failure mode, so it has its
 * own test:
 *
 *   1. User A cannot modify a contact belonging to Organization B.
 *   2. User A cannot move their own contact into Organization B.
 *
 * Both payloads touch `phone` or `organization_id` only, so a hypothetical
 * success is reversible rather than destroying the demo rows.
 *
 *   node scripts/isolation-contacts-edit.mjs
 *
 * Password-grant JWTs and the publishable key only. The service role bypasses
 * RLS and would prove nothing.
 */

import { readFile } from "node:fs/promises";

const ORG_B = "552bf447-1115-4808-9a2c-d3de4511a25e";

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

async function signIn(url, key, email, password) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Login failed for ${email}: ${body.error_description ?? body.msg}`);
  return body.access_token;
}

function rest(url, key, token) {
  return async (path, init = {}) => {
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

  const [tokenA, tokenB] = await Promise.all([
    signIn(url, key, "isolation.a.d10@gmail.com", env.ISOLATION_A_PASSWORD),
    signIn(url, key, "isolation.b.d10@gmail.com", env.ISOLATION_B_PASSWORD),
  ]);
  const asA = rest(url, key, tokenA);
  const asB = rest(url, key, tokenB);
  console.log("Signed in as both isolation users (password grant, publishable key).\n");

  // Read Bob's id as B. A cannot discover it through the API, so handing it to
  // A models the worst case: the attacker already knows the identifier.
  const bob = (await asB("contacts?select=id,full_name,phone&full_name=eq.Bob%20B")).body?.[0];
  if (!bob) throw new Error("Bob B not found in Org B. Run scripts/isolation-contacts.mjs to seed.");

  const edit = await asA(`contacts?id=eq.${bob.id}`, {
    method: "PATCH",
    body: JSON.stringify({ phone: "000-ATTACK" }),
  });
  const editedRows = Array.isArray(edit.body) ? edit.body.length : -1;
  record(
    "A edits Org B's contact by id",
    `${edit.status}, rows affected: ${editedRows}`,
    editedRows === 0,
  );

  const alice = (await asA("contacts?select=id,full_name&full_name=eq.Alice%20A")).body?.[0];
  if (alice) {
    const move = await asA(`contacts?id=eq.${alice.id}`, {
      method: "PATCH",
      body: JSON.stringify({ organization_id: ORG_B }),
    });
    record(
      "A moves its own contact into Org B",
      `${move.status} ${JSON.stringify(move.body)}`,
      !move.ok,
    );
  } else {
    console.log("SKIP  Alice A not present in Org A — run the seed first.");
  }

  const after = (await asB("contacts?select=full_name,phone")).body ?? [];
  record(
    "Org B is unchanged",
    JSON.stringify(after),
    after.length === 1 && after[0].full_name === "Bob B" && after[0].phone !== "000-ATTACK",
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

/**
 * Tenant isolation proof for `public.contacts`.
 *
 * Runs entirely with password-grant JWTs and the publishable key — the same
 * privilege the browser has. The service role key is never read, because a
 * service-role query bypasses RLS and would prove nothing.
 *
 *   node scripts/isolation-contacts.mjs          # seed + read test + insert attack
 *   node scripts/isolation-contacts.mjs --no-seed
 *
 * Passwords come from ISOLATION_A_PASSWORD / ISOLATION_B_PASSWORD in the
 * environment or .env.local, otherwise the script prompts. Nothing secret is
 * printed or written to disk.
 */

import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const ORG_A = "b00174b6-bb5d-4856-bfcf-a0bf9868f01b";
const ORG_B = "552bf447-1115-4808-9a2c-d3de4511a25e";
const EMAIL_A = "isolation.a.d10@gmail.com";
const EMAIL_B = "isolation.b.d10@gmail.com";

const seed = !process.argv.includes("--no-seed");

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

async function askPassword(label) {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  const answer = await rl.question(`Password for ${label}: `);
  rl.close();
  return answer.trim();
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
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: res.status, ok: res.ok, body };
  };
}

const results = [];
function record(name, detail, pass) {
  results.push({ name, detail, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
}

const summarize = (rows) =>
  Array.isArray(rows)
    ? rows.length === 0
      ? "[]"
      : rows.map((r) => r.full_name).join(", ")
    : JSON.stringify(rows);

async function main() {
  const env = await loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const passwordA =
    process.env.ISOLATION_A_PASSWORD || env.ISOLATION_A_PASSWORD || (await askPassword(EMAIL_A));
  const passwordB =
    process.env.ISOLATION_B_PASSWORD || env.ISOLATION_B_PASSWORD || (await askPassword(EMAIL_B));

  const [tokenA, tokenB] = await Promise.all([
    signIn(url, key, EMAIL_A, passwordA),
    signIn(url, key, EMAIL_B, passwordB),
  ]);
  const asA = rest(url, key, tokenA);
  const asB = rest(url, key, tokenB);
  console.log("Signed in as both isolation users (password grant, publishable key).\n");

  // --- Seed: each owner creates their own contact -------------------------
  if (seed) {
    for (const [label, call, orgId, name] of [
      ["A", asA, ORG_A, "Alice A"],
      ["B", asB, ORG_B, "Bob B"],
    ]) {
      const existing = await call(`contacts?select=id&full_name=eq.${encodeURIComponent(name)}`);
      if (Array.isArray(existing.body) && existing.body.length > 0) {
        console.log(`Seed: ${name} already exists in Org ${label}.`);
        continue;
      }
      const created = await call("contacts", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ organization_id: orgId, full_name: name }),
      });
      console.log(
        created.ok
          ? `Seed: created ${name} in Org ${label}.`
          : `Seed FAILED for ${name}: ${created.status} ${JSON.stringify(created.body)}`,
      );
    }
    console.log("");
  }

  // --- Read isolation ------------------------------------------------------
  const aOwn = await asA("contacts?select=id,full_name,organization_id");
  record(
    "A sees only Org A contacts",
    `${summarize(aOwn.body)} (${aOwn.status})`,
    Array.isArray(aOwn.body) && aOwn.body.every((r) => r.organization_id === ORG_A),
  );

  const aReadsB = await asA(`contacts?select=id,full_name&organization_id=eq.${ORG_B}`);
  record(
    "A queries Org B's contacts",
    `${summarize(aReadsB.body)} (${aReadsB.status})`,
    Array.isArray(aReadsB.body) && aReadsB.body.length === 0,
  );

  const bOwn = await asB("contacts?select=id,full_name,organization_id");
  record(
    "B sees Bob B",
    `${summarize(bOwn.body)} (${bOwn.status})`,
    Array.isArray(bOwn.body) &&
      bOwn.body.some((r) => r.full_name === "Bob B") &&
      bOwn.body.every((r) => r.organization_id === ORG_B),
  );

  const bReadsA = await asB(`contacts?select=id,full_name&organization_id=eq.${ORG_A}`);
  record(
    "B queries Org A's contacts (reverse)",
    `${summarize(bReadsA.body)} (${bReadsA.status})`,
    Array.isArray(bReadsA.body) && bReadsA.body.length === 0,
  );

  // --- Insert attack -------------------------------------------------------
  const attack = await asA("contacts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ full_name: "Fake Bob", organization_id: ORG_B }),
  });
  record(
    "A inserts a contact into Org B",
    `${attack.status} ${JSON.stringify(attack.body)}`,
    !attack.ok,
  );

  // The write must be rejected AND leave no row. B is the only session that
  // can see Org B, so B is the one who confirms nothing landed.
  const bAfter = await asB("contacts?select=id,full_name");
  record(
    "Org B after the attack contains no Fake Bob",
    summarize(bAfter.body),
    Array.isArray(bAfter.body) && !bAfter.body.some((r) => r.full_name === "Fake Bob"),
  );

  // --- No JWT at all -------------------------------------------------------
  // The publishable key alone resolves to `anon`, which holds no grant on the
  // table. This fails on privileges before RLS is even consulted.
  const anonRes = await fetch(`${url}/rest/v1/contacts?select=id`, {
    headers: { apikey: key, "Content-Type": "application/json" },
  });
  const anonBody = await anonRes.text();
  record(
    "Anonymous request (publishable key, no JWT)",
    `${anonRes.status} ${anonBody.slice(0, 160)}`,
    !anonRes.ok,
  );

  const failed = results.filter((r) => !r.pass);
  console.log(
    `\n${failed.length === 0 ? "ALL CHECKS PASSED" : `${failed.length} CHECK(S) FAILED`} — ${results.length} total`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`);
  process.exit(1);
});

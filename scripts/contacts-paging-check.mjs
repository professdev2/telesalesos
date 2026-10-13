/**
 * Paging and search check for `contacts`, using synthetic rows.
 *
 * Seeds throwaway records into Isolation Org A, exercises the same count /
 * range / `or(ilike)` behaviour the application relies on, then deletes every
 * row it created and asserts the organization is back to its prior contents.
 * It is deliberately self-cleaning: leaving fixture rows behind would change
 * what the contacts list shows during a client demo.
 *
 *   node scripts/contacts-paging-check.mjs
 *
 * The rows are invented test data — never real people, never an imported list.
 */

import { readFile } from "node:fs/promises";

const PAGE_SIZE = 25;
const FIXTURE_COUNT = 30;
const PREFIX = "Paging Fixture";

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

  const auth = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "isolation.a.d10@gmail.com",
      password: env.ISOLATION_A_PASSWORD,
    }),
  }).then((r) => r.json());
  if (!auth.access_token) throw new Error("Could not sign in as Isolation A");

  const call = async (path, init = {}) => {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${auth.access_token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    return {
      status: res.status,
      ok: res.ok,
      range: res.headers.get("content-range"),
      body: await res.json().catch(() => null),
    };
  };

  // The organization comes from the caller's own membership, never from input.
  const membership = await call(
    "organization_memberships?select=organization_id&status=eq.active&limit=1",
  );
  const orgId = membership.body?.[0]?.organization_id;
  if (!orgId) throw new Error("No active membership for Isolation A");

  const before = await call("contacts?select=full_name", {
    headers: { Prefer: "count=exact" },
  });
  const baseline = (before.body ?? []).map((r) => r.full_name).sort();
  console.log(`Baseline in Org A: ${JSON.stringify(baseline)}\n`);

  let seeded = false;
  try {
    const rows = Array.from({ length: FIXTURE_COUNT }, (_, i) => ({
      organization_id: orgId,
      full_name: `${PREFIX} ${String(i + 1).padStart(2, "0")}`,
      email: `fixture${String(i + 1).padStart(2, "0")}@example.invalid`,
    }));
    const created = await call("contacts", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(rows),
    });
    if (!created.ok) throw new Error(`Seeding failed: ${JSON.stringify(created.body)}`);
    seeded = true;
    console.log(`Seeded ${created.body.length} synthetic rows.\n`);

    const expectedTotal = baseline.length + FIXTURE_COUNT;

    const page1 = await call(
      `contacts?select=id,full_name&order=created_at.desc&limit=${PAGE_SIZE}&offset=0`,
      { headers: { Prefer: "count=exact" } },
    );
    record(
      "Page 1 returns a full page and an exact total",
      `${page1.body.length} rows, content-range ${page1.range}`,
      page1.body.length === PAGE_SIZE && page1.range?.endsWith(`/${expectedTotal}`),
    );

    const page2 = await call(
      `contacts?select=id,full_name&order=created_at.desc&limit=${PAGE_SIZE}&offset=${PAGE_SIZE}`,
      { headers: { Prefer: "count=exact" } },
    );
    record(
      "Page 2 returns the remainder",
      `${page2.body.length} rows`,
      page2.body.length === expectedTotal - PAGE_SIZE,
    );

    const ids1 = new Set(page1.body.map((r) => r.id));
    record(
      "Pages do not overlap",
      `${page2.body.filter((r) => ids1.has(r.id)).length} shared rows`,
      page2.body.every((r) => !ids1.has(r.id)),
    );

    const search = await call(
      `contacts?select=full_name&or=(full_name.ilike.%25${PREFIX.replace(" ", "%20")}%2007%25,email.ilike.%25${PREFIX.replace(" ", "%20")}%2007%25)`,
    );
    record(
      "Search narrows to one row",
      JSON.stringify(search.body),
      Array.isArray(search.body) && search.body.length === 1,
    );

    const noMatch = await call(
      "contacts?select=full_name&or=(full_name.ilike.%25zzzznomatch%25,email.ilike.%25zzzznomatch%25)",
    );
    record(
      "A term with no matches returns an empty list",
      JSON.stringify(noMatch.body),
      Array.isArray(noMatch.body) && noMatch.body.length === 0,
    );
  } finally {
    if (seeded) {
      const removed = await call(`contacts?full_name=like.${encodeURIComponent(`${PREFIX}%`)}`, {
        method: "DELETE",
        headers: { Prefer: "return=representation" },
      });
      console.log(`\nCleanup: deleted ${removed.body?.length ?? 0} fixture rows.`);
    }
  }

  const after = await call("contacts?select=full_name");
  const remaining = (after.body ?? []).map((r) => r.full_name).sort();
  record(
    "Org A restored to its baseline",
    JSON.stringify(remaining),
    JSON.stringify(remaining) === JSON.stringify(baseline),
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

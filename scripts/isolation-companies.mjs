/**
 * Tenant isolation proof for `public.companies`.
 *
 * Password-grant JWTs and the publishable key only — same privilege as the browser.
 *
 *   node scripts/isolation-companies.mjs
 *   node scripts/isolation-companies.mjs --no-seed
 *
 * Passwords: ISOLATION_A_PASSWORD / ISOLATION_B_PASSWORD in .env.local.
 */

import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const ORG_A = "b00174b6-bb5d-4856-bfcf-a0bf9868f01b";
const ORG_B = "552bf447-1115-4808-9a2c-d3de4511a25e";
const EMAIL_A = "isolation.a.d10@gmail.com";
const EMAIL_B = "isolation.b.d10@gmail.com";
const NAME_A = "Isolation Co A";
const NAME_B = "Isolation Co B";

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
      : rows.map((r) => r.name ?? r.id).join(", ")
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

  let companyAId = null;
  let companyBId = null;

  if (seed) {
    for (const [label, call, orgId, name] of [
      ["A", asA, ORG_A, NAME_A],
      ["B", asB, ORG_B, NAME_B],
    ]) {
      const existing = await call(`companies?select=id&name=eq.${encodeURIComponent(name)}`);
      if (Array.isArray(existing.body) && existing.body.length > 0) {
        console.log(`Seed: ${name} already exists in Org ${label}.`);
        if (label === "A") companyAId = existing.body[0].id;
        else companyBId = existing.body[0].id;
        continue;
      }
      const created = await call("companies", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ organization_id: orgId, name }),
      });
      console.log(
        created.ok
          ? `Seed: created ${name} in Org ${label}.`
          : `Seed FAILED for ${name}: ${created.status} ${JSON.stringify(created.body)}`,
      );
      if (created.ok && Array.isArray(created.body) && created.body[0]) {
        if (label === "A") companyAId = created.body[0].id;
        else companyBId = created.body[0].id;
      }
    }
    console.log("");
  }

  if (!companyAId) {
    const found = await asA(`companies?select=id&name=eq.${encodeURIComponent(NAME_A)}`);
    companyAId = Array.isArray(found.body) && found.body[0] ? found.body[0].id : null;
  }
  if (!companyBId) {
    const found = await asB(`companies?select=id&name=eq.${encodeURIComponent(NAME_B)}`);
    companyBId = Array.isArray(found.body) && found.body[0] ? found.body[0].id : null;
  }

  const aOwn = await asA("companies?select=id,name,organization_id");
  record(
    "A sees only Org A companies",
    `${summarize(aOwn.body)} (${aOwn.status})`,
    Array.isArray(aOwn.body) && aOwn.body.every((r) => r.organization_id === ORG_A),
  );

  const aReadsB = await asA(`companies?select=id,name&organization_id=eq.${ORG_B}`);
  record(
    "A queries Org B's companies",
    `${summarize(aReadsB.body)} (${aReadsB.status})`,
    Array.isArray(aReadsB.body) && aReadsB.body.length === 0,
  );

  const aInsertB = await asA("companies", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ organization_id: ORG_B, name: "Attack Co" }),
  });
  record(
    "A cannot insert into Org B",
    `${aInsertB.status} ${JSON.stringify(aInsertB.body)}`,
    !aInsertB.ok,
  );

  if (companyBId) {
    const aUpdateB = await asA(`companies?id=eq.${companyBId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Hijacked" }),
    });
    record(
      "A cannot update Org B company",
      `${aUpdateB.status}`,
      aUpdateB.status === 204 ||
        (Array.isArray(aUpdateB.body) && aUpdateB.body.length === 0) ||
        !aUpdateB.ok,
    );

    // Confirm B's name unchanged
    const bCheck = await asB(`companies?id=eq.${companyBId}&select=name`);
    const stillB =
      Array.isArray(bCheck.body) && bCheck.body[0] && bCheck.body[0].name === NAME_B;
    record("Org B company name unchanged after A PATCH", summarize(bCheck.body), stillB);
  }

  if (companyAId) {
    const bDeleteA = await asB(`companies?id=eq.${companyAId}`, { method: "DELETE" });
    const aStill = await asA(`companies?id=eq.${companyAId}&select=id`);
    record(
      "B cannot delete Org A company",
      `delete=${bDeleteA.status}; still=${summarize(aStill.body)}`,
      Array.isArray(aStill.body) && aStill.body.length === 1,
    );
  }

  // Cleanup seed names so re-runs stay clean
  if (seed) {
    await asA(`companies?name=eq.${encodeURIComponent(NAME_A)}`, { method: "DELETE" });
    await asB(`companies?name=eq.${encodeURIComponent(NAME_B)}`, { method: "DELETE" });
    console.log("\nCleaned seed companies.");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

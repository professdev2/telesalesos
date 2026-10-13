/**
 * Tenant isolation proof for `public.orders`.
 *
 *   node scripts/isolation-orders.mjs
 *   node scripts/isolation-orders.mjs --no-seed
 */

import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const ORG_A = "b00174b6-bb5d-4856-bfcf-a0bf9868f01b";
const ORG_B = "552bf447-1115-4808-9a2c-d3de4511a25e";
const EMAIL_A = "isolation.a.d10@gmail.com";
const EMAIL_B = "isolation.b.d10@gmail.com";
const CO_A = "Isolation Orders Co A";
const CO_B = "Isolation Orders Co B";

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

async function ensureCompany(call, orgId, name) {
  const existing = await call(`companies?select=id&name=eq.${encodeURIComponent(name)}`);
  if (Array.isArray(existing.body) && existing.body.length > 0) {
    return existing.body[0].id;
  }
  const created = await call("companies", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ organization_id: orgId, name }),
  });
  if (!created.ok || !Array.isArray(created.body) || !created.body[0]) {
    throw new Error(`Could not seed company ${name}: ${created.status} ${JSON.stringify(created.body)}`);
  }
  return created.body[0].id;
}

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
  console.log("Signed in as both isolation users.\n");

  const companyA = await ensureCompany(asA, ORG_A, CO_A);
  const companyB = await ensureCompany(asB, ORG_B, CO_B);

  let orderAId = null;
  let orderBId = null;

  if (seed) {
    const aOrder = await asA("orders", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        organization_id: ORG_A,
        company_id: companyA,
        order_date: "2026-09-27",
        collected: 100,
        our_cost: 40,
      }),
    });
    console.log(aOrder.ok ? "Seed: order A created." : `Seed A failed: ${aOrder.status}`);
    if (aOrder.ok && Array.isArray(aOrder.body)) orderAId = aOrder.body[0]?.id;

    const bOrder = await asB("orders", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        organization_id: ORG_B,
        company_id: companyB,
        order_date: "2026-09-27",
        collected: 200,
        our_cost: 50,
      }),
    });
    console.log(bOrder.ok ? "Seed: order B created." : `Seed B failed: ${bOrder.status}`);
    if (bOrder.ok && Array.isArray(bOrder.body)) orderBId = bOrder.body[0]?.id;
    console.log("");
  }

  const aOwn = await asA("orders?select=id,organization_id,gross_profit");
  record(
    "A sees only Org A orders",
    `${JSON.stringify(aOwn.body)} (${aOwn.status})`,
    Array.isArray(aOwn.body) && aOwn.body.every((r) => r.organization_id === ORG_A),
  );

  if (Array.isArray(aOwn.body) && aOwn.body[0]) {
    const profit = Number(aOwn.body[0].gross_profit);
    record("A order gross_profit = collected − cost", `profit=${profit}`, profit === 60);
  }

  const aReadsB = await asA(`orders?select=id&organization_id=eq.${ORG_B}`);
  record(
    "A queries Org B orders",
    `${JSON.stringify(aReadsB.body)} (${aReadsB.status})`,
    Array.isArray(aReadsB.body) && aReadsB.body.length === 0,
  );

  const aInsertB = await asA("orders", {
    method: "POST",
    body: JSON.stringify({
      organization_id: ORG_B,
      company_id: companyB,
      order_date: "2026-09-27",
      collected: 1,
      our_cost: 0,
    }),
  });
  record("A cannot insert into Org B", `${aInsertB.status}`, !aInsertB.ok);

  if (orderBId) {
    const aPatch = await asA(`orders?id=eq.${orderBId}`, {
      method: "PATCH",
      body: JSON.stringify({ notes: "hijack" }),
    });
    const bCheck = await asB(`orders?id=eq.${orderBId}&select=notes`);
    const clean =
      Array.isArray(bCheck.body) &&
      bCheck.body[0] &&
      (bCheck.body[0].notes == null || bCheck.body[0].notes !== "hijack");
    record("A cannot update Org B order", `patch=${aPatch.status}`, clean);
  }

  // Cleanup
  if (seed) {
    if (orderAId) await asA(`orders?id=eq.${orderAId}`, { method: "DELETE" });
    if (orderBId) await asB(`orders?id=eq.${orderBId}`, { method: "DELETE" });
    await asA(`companies?name=eq.${encodeURIComponent(CO_A)}`, { method: "DELETE" });
    await asB(`companies?name=eq.${encodeURIComponent(CO_B)}`, { method: "DELETE" });
    console.log("\nCleaned seed orders/companies.");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

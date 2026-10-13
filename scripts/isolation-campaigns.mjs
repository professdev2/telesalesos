/**
 * Tenant isolation proof for `public.campaigns` and `public.campaign_contacts`.
 *
 * Password-grant JWTs and the publishable key only — the same privilege the
 * browser has. The service role key is never read.
 *
 *   node scripts/isolation-campaigns.mjs
 *
 * Passwords: ISOLATION_A_PASSWORD / ISOLATION_B_PASSWORD in .env.local.
 * Seed campaigns and memberships are removed at the end (contacts kept).
 */

import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const ORG_A = "b00174b6-bb5d-4856-bfcf-a0bf9868f01b";
const ORG_B = "552bf447-1115-4808-9a2c-d3de4511a25e";
const EMAIL_A = "isolation.a.d10@gmail.com";
const EMAIL_B = "isolation.b.d10@gmail.com";
const CONTACT_A = "Alice A";
const CONTACT_B = "Bob B";
const NAME_A = "isolation-campaign-A";
const NAME_B = "isolation-campaign-B";
const ATTACK_NAME = "Fake Bob campaign";

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

const summarize = (rows, field = "name") =>
  Array.isArray(rows)
    ? rows.length === 0
      ? "[]"
      : rows.map((r) => r[field] ?? r.id).join(", ")
    : JSON.stringify(rows);

async function ensureContact(call, orgId, name) {
  const existing = await call(`contacts?select=id&full_name=eq.${encodeURIComponent(name)}`);
  if (Array.isArray(existing.body) && existing.body.length > 0) {
    return existing.body[0].id;
  }
  const created = await call("contacts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ organization_id: orgId, full_name: name }),
  });
  if (!created.ok || !Array.isArray(created.body) || !created.body[0]?.id) {
    throw new Error(`Could not seed contact ${name}: ${created.status} ${JSON.stringify(created.body)}`);
  }
  return created.body[0].id;
}

async function ensureCampaign(call, orgId, name) {
  const existing = await call(`campaigns?select=id&name=eq.${encodeURIComponent(name)}`);
  if (Array.isArray(existing.body) && existing.body.length > 0) {
    console.log(`Seed: campaign ${name} already exists.`);
    return existing.body[0].id;
  }
  const created = await call("campaigns", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: orgId,
      name,
      status: "draft",
    }),
  });
  if (!created.ok) {
    throw new Error(`Seed FAILED for ${name}: ${created.status} ${JSON.stringify(created.body)}`);
  }
  console.log(`Seed: created ${name}.`);
  return created.body[0].id;
}

async function ensureMembership(call, orgId, campaignId, contactId) {
  const existing = await call(
    `campaign_contacts?select=id&campaign_id=eq.${campaignId}&contact_id=eq.${contactId}`,
  );
  if (Array.isArray(existing.body) && existing.body.length > 0) {
    return existing.body[0].id;
  }
  const created = await call("campaign_contacts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: orgId,
      campaign_id: campaignId,
      contact_id: contactId,
    }),
  });
  if (!created.ok) {
    throw new Error(`Seed FAILED for membership: ${created.status} ${JSON.stringify(created.body)}`);
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
  console.log("Signed in as both isolation users (password grant, publishable key).\n");

  const contactA = await ensureContact(asA, ORG_A, CONTACT_A);
  const contactB = await ensureContact(asB, ORG_B, CONTACT_B);

  console.log("Ensuring seed campaigns (idempotent by name).");
  const campaignA = await ensureCampaign(asA, ORG_A, NAME_A);
  const campaignB = await ensureCampaign(asB, ORG_B, NAME_B);
  await ensureMembership(asA, ORG_A, campaignA, contactA);
  await ensureMembership(asB, ORG_B, campaignB, contactB);
  console.log("");

  const aOwn = await asA("campaigns?select=id,name,organization_id");
  record(
    "A sees only Org A campaigns",
    `${summarize(aOwn.body)} (${aOwn.status})`,
    Array.isArray(aOwn.body) &&
      aOwn.body.length > 0 &&
      aOwn.body.every((r) => r.organization_id === ORG_A),
  );

  const aReadsB = await asA(`campaigns?select=id,name&organization_id=eq.${ORG_B}`);
  record(
    "A queries Org B's campaigns",
    `${summarize(aReadsB.body)} (${aReadsB.status})`,
    Array.isArray(aReadsB.body) && aReadsB.body.length === 0,
  );

  const bOwn = await asB("campaigns?select=id,name,organization_id");
  record(
    "B sees only Org B campaigns",
    `${summarize(bOwn.body)} (${bOwn.status})`,
    Array.isArray(bOwn.body) &&
      bOwn.body.some((r) => r.name === NAME_B) &&
      bOwn.body.every((r) => r.organization_id === ORG_B),
  );

  const bReadsA = await asB(`campaigns?select=id,name&organization_id=eq.${ORG_A}`);
  record(
    "B queries Org A's campaigns (reverse)",
    `${summarize(bReadsA.body)} (${bReadsA.status})`,
    Array.isArray(bReadsA.body) && bReadsA.body.length === 0,
  );

  const attackOrg = await asA("campaigns", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      name: ATTACK_NAME,
      organization_id: ORG_B,
      status: "draft",
    }),
  });
  record(
    "A inserts a campaign into Org B",
    `${attackOrg.status} ${JSON.stringify(attackOrg.body)}`,
    !attackOrg.ok,
  );

  const attackContact = await asA("campaign_contacts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: ORG_A,
      campaign_id: campaignA,
      contact_id: contactB,
    }),
  });
  record(
    "A adds Org B's contact to Org A's campaign",
    `${attackContact.status} ${JSON.stringify(attackContact.body)}`,
    !attackContact.ok,
  );

  const attackMembershipOrg = await asA("campaign_contacts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: ORG_B,
      campaign_id: campaignB,
      contact_id: contactB,
    }),
  });
  record(
    "A inserts a campaign contact into Org B",
    `${attackMembershipOrg.status} ${JSON.stringify(attackMembershipOrg.body)}`,
    !attackMembershipOrg.ok,
  );

  const bAfter = await asB("campaigns?select=id,name");
  record(
    "Org B after the attacks contains no Fake Bob campaign",
    summarize(bAfter.body),
    Array.isArray(bAfter.body) && !bAfter.body.some((r) => r.name === ATTACK_NAME),
  );

  const bMembers = await asB("campaign_contacts?select=id,contact_id,organization_id");
  record(
    "Org B memberships stay Org B only",
    `${summarize(bMembers.body, "id")} (${bMembers.status})`,
    Array.isArray(bMembers.body) &&
      bMembers.body.length > 0 &&
      bMembers.body.every((r) => r.organization_id === ORG_B),
  );

  const anonCampaigns = await fetch(`${url}/rest/v1/campaigns?select=id`, {
    headers: { apikey: key, "Content-Type": "application/json" },
  });
  record(
    "Anonymous request on campaigns",
    `${anonCampaigns.status} ${(await anonCampaigns.text()).slice(0, 160)}`,
    !anonCampaigns.ok,
  );

  const anonMembers = await fetch(`${url}/rest/v1/campaign_contacts?select=id`, {
    headers: { apikey: key, "Content-Type": "application/json" },
  });
  record(
    "Anonymous request on campaign_contacts",
    `${anonMembers.status} ${(await anonMembers.text()).slice(0, 160)}`,
    !anonMembers.ok,
  );

  await asA(`campaign_contacts?campaign_id=eq.${campaignA}`, { method: "DELETE" });
  await asB(`campaign_contacts?campaign_id=eq.${campaignB}`, { method: "DELETE" });
  await asA(`campaigns?name=eq.${encodeURIComponent(NAME_A)}`, { method: "DELETE" });
  await asB(`campaigns?name=eq.${encodeURIComponent(NAME_B)}`, { method: "DELETE" });
  await asA(`campaigns?name=eq.${encodeURIComponent(ATTACK_NAME)}`, { method: "DELETE" });
  await asB(`campaigns?name=eq.${encodeURIComponent(ATTACK_NAME)}`, { method: "DELETE" });
  console.log("Cleanup: removed isolation seed campaigns and memberships (contacts kept).");

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

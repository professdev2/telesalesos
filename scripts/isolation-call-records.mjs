/**
 * Tenant isolation proof for `public.call_records`.
 *
 * Password-grant JWTs and the publishable key only — the same privilege the
 * browser has. The service role key is never read.
 *
 *   node scripts/isolation-call-records.mjs
 *
 * Passwords: ISOLATION_A_PASSWORD / ISOLATION_B_PASSWORD in .env.local.
 * Seed call records and leads are removed at the end (contacts kept).
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
const LEAD_NOTE_A = "isolation-call-lead-A";
const LEAD_NOTE_B = "isolation-call-lead-B";
const NOTE_A = "isolation-call-A";
const NOTE_B = "isolation-call-B";
const ATTACK_NOTE = "Fake Bob call";

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
      : rows.map((r) => r.notes ?? r.id).join(", ")
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

async function ensureLead(call, orgId, contactId, notes) {
  const existing = await call(`leads?select=id&notes=eq.${encodeURIComponent(notes)}`);
  if (Array.isArray(existing.body) && existing.body.length > 0) {
    return existing.body[0].id;
  }
  const created = await call("leads", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: orgId,
      contact_id: contactId,
      status: "new",
      notes,
    }),
  });
  if (!created.ok) {
    throw new Error(`Seed FAILED for lead ${notes}: ${created.status} ${JSON.stringify(created.body)}`);
  }
  return created.body[0].id;
}

async function ensureCall(call, orgId, contactId, leadId, notes) {
  const existing = await call(`call_records?select=id&notes=eq.${encodeURIComponent(notes)}`);
  if (Array.isArray(existing.body) && existing.body.length > 0) {
    console.log(`Seed: call ${notes} already exists.`);
    return existing.body[0].id;
  }
  const created = await call("call_records", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: orgId,
      contact_id: contactId,
      lead_id: leadId,
      outcome: "no_answer",
      notes,
    }),
  });
  if (!created.ok) {
    throw new Error(`Seed FAILED for ${notes}: ${created.status} ${JSON.stringify(created.body)}`);
  }
  console.log(`Seed: created ${notes}.`);
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
  const leadA = await ensureLead(asA, ORG_A, contactA, LEAD_NOTE_A);
  const leadB = await ensureLead(asB, ORG_B, contactB, LEAD_NOTE_B);

  console.log("Ensuring seed call records (idempotent by notes).");
  await ensureCall(asA, ORG_A, contactA, leadA, NOTE_A);
  await ensureCall(asB, ORG_B, contactB, leadB, NOTE_B);
  console.log("");

  const aOwn = await asA("call_records?select=id,notes,organization_id,contact_id");
  record(
    "A sees only Org A call records",
    `${summarize(aOwn.body)} (${aOwn.status})`,
    Array.isArray(aOwn.body) &&
      aOwn.body.length > 0 &&
      aOwn.body.every((r) => r.organization_id === ORG_A),
  );

  const aReadsB = await asA(`call_records?select=id,notes&organization_id=eq.${ORG_B}`);
  record(
    "A queries Org B's call records",
    `${summarize(aReadsB.body)} (${aReadsB.status})`,
    Array.isArray(aReadsB.body) && aReadsB.body.length === 0,
  );

  const bOwn = await asB("call_records?select=id,notes,organization_id");
  record(
    "B sees only Org B call records",
    `${summarize(bOwn.body)} (${bOwn.status})`,
    Array.isArray(bOwn.body) &&
      bOwn.body.some((r) => r.notes === NOTE_B) &&
      bOwn.body.every((r) => r.organization_id === ORG_B),
  );

  const bReadsA = await asB(`call_records?select=id,notes&organization_id=eq.${ORG_A}`);
  record(
    "B queries Org A's call records (reverse)",
    `${summarize(bReadsA.body)} (${bReadsA.status})`,
    Array.isArray(bReadsA.body) && bReadsA.body.length === 0,
  );

  const attackOrg = await asA("call_records", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      notes: ATTACK_NOTE,
      organization_id: ORG_B,
      contact_id: contactB,
      outcome: "no_answer",
    }),
  });
  record(
    "A inserts a call record into Org B",
    `${attackOrg.status} ${JSON.stringify(attackOrg.body)}`,
    !attackOrg.ok,
  );

  const attackContact = await asA("call_records", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      notes: ATTACK_NOTE,
      organization_id: ORG_A,
      contact_id: contactB,
      outcome: "no_answer",
    }),
  });
  record(
    "A attaches a call record to Org B's contact",
    `${attackContact.status} ${JSON.stringify(attackContact.body)}`,
    !attackContact.ok,
  );

  const attackLead = await asA("call_records", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      notes: ATTACK_NOTE,
      organization_id: ORG_A,
      contact_id: contactA,
      lead_id: leadB,
      outcome: "no_answer",
    }),
  });
  record(
    "A attaches a call record to Org B's lead",
    `${attackLead.status} ${JSON.stringify(attackLead.body)}`,
    !attackLead.ok,
  );

  const bAfter = await asB("call_records?select=id,notes");
  record(
    "Org B after the attacks contains no Fake Bob call",
    summarize(bAfter.body),
    Array.isArray(bAfter.body) && !bAfter.body.some((r) => r.notes === ATTACK_NOTE),
  );

  const aAfter = await asA("call_records?select=id,notes");
  record(
    "Org A after the attacks contains no Fake Bob call",
    summarize(aAfter.body),
    Array.isArray(aAfter.body) && !aAfter.body.some((r) => r.notes === ATTACK_NOTE),
  );

  const anonRes = await fetch(`${url}/rest/v1/call_records?select=id`, {
    headers: { apikey: key, "Content-Type": "application/json" },
  });
  const anonBody = await anonRes.text();
  record(
    "Anonymous request (publishable key, no JWT)",
    `${anonRes.status} ${anonBody.slice(0, 160)}`,
    !anonRes.ok,
  );

  await asA(`call_records?notes=eq.${encodeURIComponent(NOTE_A)}`, { method: "DELETE" });
  await asB(`call_records?notes=eq.${encodeURIComponent(NOTE_B)}`, { method: "DELETE" });
  await asA(`call_records?notes=eq.${encodeURIComponent(ATTACK_NOTE)}`, { method: "DELETE" });
  await asB(`call_records?notes=eq.${encodeURIComponent(ATTACK_NOTE)}`, { method: "DELETE" });
  await asA(`leads?notes=eq.${encodeURIComponent(LEAD_NOTE_A)}`, { method: "DELETE" });
  await asB(`leads?notes=eq.${encodeURIComponent(LEAD_NOTE_B)}`, { method: "DELETE" });
  console.log("Cleanup: removed isolation seed call records and their leads (contacts kept).");

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

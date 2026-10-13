/**
 * Verifies the contact audit trail.
 *
 * Creates, edits, and deletes one scratch contact as Isolation A, then checks
 * that three audit rows appeared with the expected actions. Also confirms the
 * existing audit RLS still holds: A must not see B's contact audit entries.
 *
 *   node scripts/contacts-audit-check.mjs
 *
 * The scratch contact is removed. Audit rows are append-only and intentionally
 * remain — that is the point of an audit trail.
 */

import { readFile } from "node:fs/promises";

const ORG_B = "552bf447-1115-4808-9a2c-d3de4511a25e";
const SCRATCH = "Audit Scratch";

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

  const org = (
    await asA("organization_memberships?select=organization_id&status=eq.active&limit=1")
  ).body?.[0]?.organization_id;
  if (!org) throw new Error("No active membership for Isolation A");

  // --- create / update / delete a scratch contact --------------------------
  const created = await asA("contacts", {
    method: "POST",
    body: JSON.stringify({ organization_id: org, full_name: SCRATCH }),
  });
  if (!created.ok) throw new Error(`Create failed: ${JSON.stringify(created.body)}`);
  const contactId = created.body[0].id;

  const updated = await asA(`contacts?id=eq.${contactId}`, {
    method: "PATCH",
    body: JSON.stringify({ phone: "555-0100" }),
  });
  const removed = await asA(`contacts?id=eq.${contactId}`, { method: "DELETE" });

  record(
    "Contact writes still succeed with the trigger installed",
    `create ${created.status}, update ${updated.status}, delete ${removed.status}`,
    created.ok && updated.ok && removed.ok,
  );

  // --- the three audit rows ------------------------------------------------
  const logs = (
    await asA(
      `audit_logs?select=action,metadata,created_at&metadata->>contact_id=eq.${contactId}&order=created_at.asc`,
    )
  ).body ?? [];
  const actions = logs.map((row) => row.action);

  record(
    "Three audit events recorded",
    JSON.stringify(actions),
    actions.length === 3 &&
      actions.includes("contact.created") &&
      actions.includes("contact.updated") &&
      actions.includes("contact.deleted"),
  );

  record(
    "Audit metadata carries the contact id and no personal data",
    JSON.stringify(logs[0]?.metadata ?? null),
    logs.length > 0 && Object.keys(logs[0].metadata).length === 1 && "contact_id" in logs[0].metadata,
  );

  // --- audit isolation ------------------------------------------------------
  const foreign = await asA(`audit_logs?select=id,action&organization_id=eq.${ORG_B}`);
  record(
    "A cannot read Org B's audit rows",
    `${foreign.status} ${JSON.stringify(foreign.body)}`,
    Array.isArray(foreign.body) && foreign.body.length === 0,
  );

  const leftover = await asA(`contacts?select=full_name&full_name=eq.${encodeURIComponent(SCRATCH)}`);
  record(
    "Scratch contact removed",
    JSON.stringify(leftover.body),
    Array.isArray(leftover.body) && leftover.body.length === 0,
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

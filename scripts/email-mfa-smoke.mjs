/**
 * Email MFA RPC smoke against Staging.
 *
 * Isolation A/B are owners, so they must be privileged and must not be able to
 * issue or verify Email OTP. Does not print codes, tokens, or secrets.
 *
 *   node scripts/email-mfa-smoke.mjs
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const EMAIL_A = "isolation.a.d10@gmail.com";
const EMAIL_B = "isolation.b.d10@gmail.com";

async function loadEnv() {
  const raw = await readFile(new URL("../.env.local", import.meta.url), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

function hashDummy(userId) {
  const pepper = process.env.EMAIL_MFA_PEPPER || process.env.RESEND_API_KEY || "x";
  return createHash("sha256").update(`${userId}:000000:${pepper}`).digest("hex");
}

async function signIn(url, key, email, password) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Login failed for ${email}: ${body.error_description ?? body.msg ?? res.status}`);
  }
  return { token: body.access_token, userId: body.user?.id };
}

async function rpc(url, key, token, fn, payload) {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload ?? {}),
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, ok: res.ok, body };
}

const results = [];
function record(name, pass, detail) {
  results.push(pass);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
}

async function checkAccount(label, email, password, url, key) {
  const { token, userId } = await signIn(url, key, email, password);
  const privileged = await rpc(url, key, token, "user_is_mfa_privileged", {});
  record(
    `${label} user_is_mfa_privileged is true`,
    privileged.ok && privileged.body === true,
    `status=${privileged.status} body=${JSON.stringify(privileged.body)}`,
  );

  const request = await rpc(url, key, token, "request_email_mfa_challenge", {
    p_code_hash: hashDummy(userId ?? "00000000-0000-0000-0000-000000000000"),
  });
  const requestBlocked =
    !request.ok &&
    String(JSON.stringify(request.body)).toLowerCase().includes("not available");
  record(
    `${label} request_email_mfa_challenge rejected`,
    requestBlocked,
    `status=${request.status} body=${JSON.stringify(request.body)}`.slice(0, 240),
  );

  const verify = await rpc(url, key, token, "verify_email_mfa_challenge", {
    p_code_hash: hashDummy(userId ?? "00000000-0000-0000-0000-000000000000"),
  });
  record(
    `${label} verify_email_mfa_challenge returns false`,
    verify.ok && verify.body === false,
    `status=${verify.status} body=${JSON.stringify(verify.body)}`,
  );

  const issue = await rpc(url, key, token, "issue_email_mfa_session", {
    p_marker_hash: hashDummy(userId ?? "00000000-0000-0000-0000-000000000000"),
  });
  const issueBlocked =
    !issue.ok &&
    String(JSON.stringify(issue.body)).toLowerCase().includes("not available");
  record(
    `${label} issue_email_mfa_session rejected`,
    issueBlocked,
    `status=${issue.status} body=${JSON.stringify(issue.body)}`.slice(0, 240),
  );
}

async function main() {
  const env = await loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase URL or publishable key");
  if (!env.ISOLATION_A_PASSWORD || !env.ISOLATION_B_PASSWORD) {
    throw new Error("Missing isolation passwords");
  }

  const anon = await fetch(`${url}/rest/v1/rpc/user_is_mfa_privileged`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: "{}",
  });
  record(
    "anonymous cannot call user_is_mfa_privileged",
    anon.status === 401 || anon.status === 403,
    `status=${anon.status}`,
  );

  await checkAccount("A", EMAIL_A, env.ISOLATION_A_PASSWORD, url, key);
  await checkAccount("B", EMAIL_B, env.ISOLATION_B_PASSWORD, url, key);

  const failed = results.filter((ok) => !ok).length;
  console.log(
    failed === 0
      ? `\nALL CHECKS PASSED — ${results.length} total`
      : `\n${failed} FAILED of ${results.length}`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

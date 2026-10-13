/**
 * TOTP enrollment for the two isolation demo accounts.
 *
 * MFA is only required for team owners/admins and platform admins, so the
 * isolation users are gated at AAL1 only while their org is a team. This
 * enrolls a factor through the same GoTrue
 * MFA API the app uses, and keeps the shared secret locally so the demo can
 * produce a valid code without a phone.
 *
 *   node scripts/mfa-isolation.mjs enroll   # enroll + verify both accounts
 *   node scripts/mfa-isolation.mjs code     # current 6-digit code for each
 *   node scripts/mfa-isolation.mjs status   # factor + assurance level
 *
 * Secrets are written to the gitignored .env.local. These are disposable
 * staging accounts; delete them after the sprint.
 */

import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ENV_PATH = fileURLToPath(new URL("../.env.local", import.meta.url));

const ACCOUNTS = [
  { label: "A", email: "isolation.a.d10@gmail.com", passwordKey: "ISOLATION_A_PASSWORD", secretKey: "ISOLATION_A_TOTP_SECRET" },
  { label: "B", email: "isolation.b.d10@gmail.com", passwordKey: "ISOLATION_B_PASSWORD", secretKey: "ISOLATION_B_TOTP_SECRET" },
];

// --- env -------------------------------------------------------------------

function readEnv() {
  const raw = readFileSync(ENV_PATH, "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

function writeEnvValue(key, value) {
  let raw = readFileSync(ENV_PATH, "utf8");
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  raw = re.test(raw) ? raw.replace(re, line) : `${raw.replace(/\s*$/, "")}\n${line}\n`;
  writeFileSync(ENV_PATH, raw, "utf8");
}

// --- TOTP (RFC 6238, SHA-1, 30s step, 6 digits — what authenticator apps do) -

function base32Decode(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of clean) {
    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totp(secret, atMs = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigInt64BE(BigInt(Math.floor(atMs / 1000 / 30)));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, "0");
}

const secondsLeft = () => 30 - (Math.floor(Date.now() / 1000) % 30);

// --- GoTrue ----------------------------------------------------------------

function api(url, key) {
  return async (path, { token, method = "GET", body } = {}) => {
    const res = await fetch(`${url}/auth/v1/${path}`, {
      method,
      headers: {
        apikey: key,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      const message = parsed?.error_description ?? parsed?.msg ?? parsed?.message ?? text;
      throw new Error(`${method} ${path} → ${res.status}: ${message}`);
    }
    return parsed;
  };
}

const signIn = (call, email, password) =>
  call("token?grant_type=password", { method: "POST", body: { email, password } });

/** The AAL currently encoded in the JWT. */
function readAal(accessToken) {
  const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"));
  return payload.aal ?? "aal1";
}

async function enrollOne(call, account, env) {
  const password = env[account.passwordKey];
  if (!password) throw new Error(`${account.passwordKey} is not set in .env.local`);

  const session = await signIn(call, account.email, password);
  const token = session.access_token;

  const user = await call("user", { token });
  const factors = user.factors ?? [];
  const verified = factors.filter((f) => f.status === "verified");

  if (verified.length > 0 && env[account.secretKey]) {
    console.log(`Org ${account.label}: already enrolled and the secret is on file. Skipping.`);
    return;
  }

  // A verified factor whose secret we do not hold is unusable for the demo —
  // and unenrolling it needs AAL2, which we cannot reach without that secret.
  if (verified.length > 0) {
    throw new Error(
      `${account.email} has a verified factor but no stored secret. Remove it from the Supabase dashboard (Authentication → Users) and rerun.`,
    );
  }

  // Unverified leftovers from an abandoned attempt still hold the friendly name.
  for (const stale of factors.filter((f) => f.status !== "verified")) {
    await call(`factors/${stale.id}`, { token, method: "DELETE" });
  }

  const enrolled = await call("factors", {
    token,
    method: "POST",
    body: { factor_type: "totp", friendly_name: `Demo ${new Date().toISOString().slice(11, 19)}` },
  });

  const secret = enrolled.totp?.secret;
  if (!secret) throw new Error(`No TOTP secret returned for ${account.email}`);

  const challenge = await call(`factors/${enrolled.id}/challenge`, { token, method: "POST" });

  // Verify near the start of a window so the code cannot expire mid-request.
  if (secondsLeft() < 3) await new Promise((r) => setTimeout(r, 3500));

  const verifiedSession = await call(`factors/${enrolled.id}/verify`, {
    token,
    method: "POST",
    body: { challenge_id: challenge.id, code: totp(secret) },
  });

  writeEnvValue(account.secretKey, secret);
  console.log(
    `Org ${account.label}: enrolled and verified. Session is now ${readAal(verifiedSession.access_token)}. Secret saved to .env.local.`,
  );
}

async function statusOne(call, account, env) {
  const password = env[account.passwordKey];
  const session = await signIn(call, account.email, password);
  const user = await call("user", { token: session.access_token });
  const factors = (user.factors ?? []).map((f) => `${f.factor_type}:${f.status}`).join(", ") || "none";
  console.log(
    `Org ${account.label} (${account.email})\n  factors: ${factors}\n  password-grant JWT: ${readAal(session.access_token)}\n  secret on file: ${env[account.secretKey] ? "yes" : "no"}`,
  );
}

async function main() {
  const command = process.argv[2] ?? "code";
  const env = readEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase URL or publishable key in .env.local");
  const call = api(url, key);

  if (command === "enroll") {
    for (const account of ACCOUNTS) await enrollOne(call, account, env);
    return;
  }

  if (command === "status") {
    for (const account of ACCOUNTS) await statusOne(call, account, env);
    return;
  }

  if (command === "code") {
    console.log(`Valid for ${secondsLeft()}s:\n`);
    for (const account of ACCOUNTS) {
      const secret = env[account.secretKey];
      console.log(`  Org ${account.label}  ${account.email}  ${secret ? totp(secret) : "not enrolled"}`);
    }
    return;
  }

  throw new Error(`Unknown command "${command}". Use enroll, code, or status.`);
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`);
  process.exit(1);
});

/**
 * End-to-end checks against the hosted Vercel alias that currently points at
 * TelesalesOS Staging (same project as .env.local).
 *
 * Uses Isolation Org A (password + TOTP from gitignored .env.local).
 * Creates one throwaway contact and deletes it.
 *
 *   node scripts/verify-hosted-staging.mjs
 *
 * Does not print secrets. Does not touch Vercel env or the production Supabase
 * project.
 */

import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";

const ORIGIN = process.env.VERIFY_ORIGIN ?? "https://telesalesos.vercel.app";
const EMAIL_A = "isolation.a.d10@gmail.com";
const EMAIL_B = "isolation.b.d10@gmail.com";
const STAGING_REF = "ceyaylgqcletophrjlja";
const PROD_REF = "gbkdkfdcmztipbkucqhe";
const VERIFY_FACTOR_MANAGEMENT =
  process.env.VERIFY_FACTOR_MANAGEMENT === "1";

async function loadEnv() {
  const raw = await readFile(new URL("../.env.local", import.meta.url), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

function base32Decode(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = secret.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = "";
  for (const ch of cleaned) {
    const val = alphabet.indexOf(ch);
    if (val < 0) throw new Error("Invalid TOTP secret");
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret, at = Date.now()) {
  const key = base32Decode(secret);
  const counter = Math.floor(at / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

function mergeCookies(store, setCookies) {
  for (const raw of setCookies) {
    const part = raw.split(";")[0];
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const name = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (value === "" || /Max-Age=0/i.test(raw)) {
      store.delete(name);
      continue;
    }
    store.set(name, `${name}=${value}`);
  }
}

function cookieHeader(store) {
  return [...store.values()].join("; ");
}

async function request(store, path, { method = "GET", body, origin = ORIGIN } = {}) {
  const res = await fetch(origin + path, {
    method,
    body,
    redirect: "manual",
    headers: store.size ? { cookie: cookieHeader(store) } : undefined,
  });
  mergeCookies(store, res.headers.getSetCookie?.() ?? []);
  const text = await res.text();
  return {
    status: res.status,
    location: res.headers.get("location"),
    text,
    title: (text.match(/<title>([^<]+)<\/title>/i) || [])[1] ?? null,
  };
}

function fillHidden(form, html) {
  for (const m of html.matchAll(
    /<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\s*\/?>/g,
  )) {
    form.append(m[1], decode(m[2] || ""));
  }
}

function formInner(html, test) {
  for (const m of html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/gi)) {
    if (test(m[1])) return m[1];
  }
  return html;
}

function decode(s) {
  return s
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&#x27;", "'");
}

function strip(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail ?? "" });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const env = await loadEnv();
const store = new Map();

const loginPage = await request(store, "/login");
check("GET /login", loginPage.status === 200 && loginPage.title?.includes("Sign in"));

const loginForm = new FormData();
fillHidden(loginForm, loginPage.text);
loginForm.append("email", EMAIL_A);
loginForm.append("password", env.ISOLATION_A_PASSWORD);
const loginPost = await request(store, "/login", { method: "POST", body: loginForm });
const loginLoc = loginPost.location ?? "";
check(
  "Password login (Isolation A)",
  loginPost.status === 303 && (loginLoc.includes("/mfa/") || loginLoc.includes("/dashboard")),
  `status=${loginPost.status} location=${loginLoc || "none"}`,
);

const authCookie = [...store.keys()].find((k) => k.startsWith("sb-"));
check(
  "Session cookie is staging project",
  typeof authCookie === "string" && authCookie.includes(STAGING_REF),
  authCookie ? authCookie.replace(/\.[0-9]+$/, "") : "missing",
);
check(
  "Session cookie is not production-Supabase project",
  !authCookie || !authCookie.includes(PROD_REF),
);

let page = await request(store, loginLoc.startsWith("/") ? loginLoc : "/mfa/challenge");
if (page.status === 307 || page.status === 303) {
  page = await request(store, page.location.startsWith("/") ? page.location : "/dashboard");
}

const onChallenge =
  page.title?.includes("Authenticator") ||
  page.text.includes("authenticator code") ||
  page.text.includes('name="factorId"');
check("Landed on MFA challenge or already AAL2", onChallenge || page.location === "/dashboard" || page.text.includes("Dashboard") || page.title?.includes("Dashboard"), page.title);

if (onChallenge) {
  const gated = await request(store, "/contacts");
  check(
    "AAL1 cannot open /contacts (MFA enforcement)",
    gated.status === 307 && (gated.location ?? "").includes("/mfa/"),
    gated.location,
  );

  const factorId = (page.text.match(/name="factorId"[^>]*value="([^"]+)"/) ||
    page.text.match(/value="([^"]+)"[^>]*name="factorId"/) ||
    [])[1];
  check("Challenge form has factorId", Boolean(factorId));
  const mfaForm = new FormData();
  fillHidden(mfaForm, formInner(page.text, (inner) => inner.includes('name="code"')));
  if (factorId && !mfaForm.has("factorId")) mfaForm.append("factorId", factorId);
  mfaForm.append("code", totp(env.ISOLATION_A_TOTP_SECRET));
  const mfaPost = await request(store, "/mfa/challenge", { method: "POST", body: mfaForm });
  check(
    "TOTP challenge accepted",
    mfaPost.status === 303 && (mfaPost.location === "/dashboard" || (mfaPost.location ?? "").includes("/dashboard")),
    `status=${mfaPost.status} location=${mfaPost.location || "none"}`,
  );
}

const dash = await request(store, "/dashboard");
const dashOk =
  dash.status === 200 &&
  !dash.location?.includes("/login") &&
  !dash.location?.includes("/mfa/");
check("GET /dashboard after MFA", dashOk, dash.title || dash.location || String(dash.status));
check(
  "Active organization shown",
  /Isolation Org A/i.test(dash.text),
  "expected Isolation Org A in shell",
);

const contacts = await request(store, "/contacts");
check(
  "GET /contacts after MFA",
  contacts.status === 200 && /Isolation Org A/i.test(contacts.text),
  contacts.title,
);

const orgPage = await request(store, "/settings/organization");
check(
  "GET /settings/organization",
  orgPage.status === 200 && /Isolation Org A/i.test(orgPage.text),
  orgPage.title,
);

const securityPage = await request(store, "/settings/security");
check(
  "GET /settings/security",
  securityPage.status === 200 &&
    securityPage.title?.includes("Security") &&
    /Authenticator apps/i.test(securityPage.text),
  securityPage.title,
);
check(
  "Security page lists a verified authenticator",
  securityPage.text.includes("Verified"),
);

if (VERIFY_FACTOR_MANAGEMENT) {
  const originalFactorIds = [
    ...securityPage.text.matchAll(/name="factorId" value="([^"]+)"/g),
  ].map((match) => match[1]);

  const enrollPage = await request(store, "/settings/security/enroll");
  const enrolledFactorId = (
    enrollPage.text.match(/name="factorId" value="([^"]+)"/) ?? []
  )[1];
  const enrollmentSecret = (
    enrollPage.text.match(/Enter this key:[\s\S]{0,240}?([A-Z2-7]{16,})/) ?? []
  )[1];
  check(
    "Start additional authenticator enrollment",
    enrollPage.status === 200 && Boolean(enrolledFactorId && enrollmentSecret),
    enrollPage.title,
  );

  if (enrolledFactorId && enrollmentSecret) {
    const verifyForm = new FormData();
    fillHidden(
      verifyForm,
      formInner(enrollPage.text, (inner) => inner.includes('name="code"')),
    );
    verifyForm.append("code", totp(enrollmentSecret));
    const verified = await request(store, "/settings/security/enroll", {
      method: "POST",
      body: verifyForm,
    });
    check(
      "Verify additional authenticator",
      verified.status === 303 && verified.location === "/settings/security",
      `status=${verified.status} location=${verified.location}`,
    );

    const withTwo = await request(store, "/settings/security");
    check(
      "Security page lists the additional factor",
      withTwo.text.includes(`value="${enrolledFactorId}"`),
    );

    const removeForm = new FormData();
    fillHidden(
      removeForm,
      formInner(
        withTwo.text,
        (inner) => inner.includes(`value="${enrolledFactorId}"`),
      ),
    );
    const removed = await request(store, "/settings/security", {
      method: "POST",
      body: removeForm,
    });
    const afterRemove = await request(store, "/settings/security");
    check(
      "Remove additional authenticator",
      removed.status === 200 &&
        !afterRemove.text.includes(`value="${enrolledFactorId}"`),
      `post=${removed.status}`,
    );

    const originalFactorId = originalFactorIds[0];
    if (originalFactorId) {
      const lastFactorForm = new FormData();
      fillHidden(
        lastFactorForm,
        formInner(
          afterRemove.text,
          (inner) => inner.includes(`value="${originalFactorId}"`),
        ),
      );
      const rejected = await request(store, "/settings/security", {
        method: "POST",
        body: lastFactorForm,
      });
      const afterRejected = await request(store, "/settings/security");
      check(
        "Owner cannot remove final authenticator",
        rejected.status === 200 &&
          rejected.text.includes("must keep at least one authenticator") &&
          afterRejected.text.includes(`value="${originalFactorId}"`),
      );
    }
  }
}

check(
  "Org switcher is single-org (no switch control)",
  !/Switch organization/i.test(dash.text),
  "Isolation A has one membership; switcher collapses to a label",
);

function findContactId(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const near = html.match(new RegExp(`/contacts/([0-9a-f-]{36})[\\s\\S]{0,200}${escaped}`));
  if (near) return near[1];
  const json = html.match(new RegExp(`${escaped}[\\s\\S]{0,120}([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})`));
  if (json) return json[1];
  const reverse = html.match(new RegExp(`([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[\\s\\S]{0,120}${escaped}`));
  return reverse?.[1] ?? null;
}

const stamp = `Verify ${Date.now()}`;
const createForm = new FormData();
fillHidden(createForm, formInner(contacts.text, (inner) => inner.includes('name="fullName"') && inner.includes("Add contact")));
createForm.append("fullName", stamp);
createForm.append("email", `verify.${Date.now()}@example.com`);
createForm.append("phone", "5550100");
const created = await request(store, "/contacts", { method: "POST", body: createForm });
const createdList = created.status === 303 ? await request(store, "/contacts") : created;
const createdOk = createdList.text.includes(stamp) || created.text.includes("added");
check("Create contact via Production UI", createdOk, `post=${created.status}`);

let contactId = findContactId(createdList.text, stamp) ?? findContactId(created.text, stamp);

if (contactId) {
  const detail = await request(store, `/contacts/${contactId}`);
  check("Open contact detail", detail.status === 200 && (detail.text.includes(stamp) || detail.status === 200), detail.title);

  const updateForm = new FormData();
  fillHidden(updateForm, formInner(detail.text, (inner) => inner.includes("Save changes") || inner.includes('name="notes"')));
  if (!updateForm.has("contactId")) updateForm.append("contactId", contactId);
  updateForm.append("fullName", `${stamp} edited`);
  updateForm.append("email", `verify.edited.${Date.now()}@example.com`);
  updateForm.append("phone", "5550101");
  updateForm.append("notes", "hosted staging verify");
  const updated = await request(store, `/contacts/${contactId}`, { method: "POST", body: updateForm });
  const afterUpdate =
    updated.status === 303 ? await request(store, `/contacts/${contactId}`) : updated;
  check(
    "Update contact via Production UI",
    afterUpdate.text.includes("edited") || updated.text.includes("updated"),
    `post=${updated.status}`,
  );

  const listForDelete = await request(store, "/contacts");
  const delInner = formInner(
    listForDelete.text,
    (inner) => inner.includes(`value="${contactId}"`) && inner.includes("Delete"),
  );
  const delForm = new FormData();
  fillHidden(delForm, delInner);
  if (!delForm.has("contactId")) delForm.append("contactId", contactId);
  delForm.append("redirectTo", "/contacts");
  const deleted = await request(store, "/contacts", { method: "POST", body: delForm });
  const afterDelete = await request(store, "/contacts");
  check(
    "Delete contact via Production UI",
    !afterDelete.text.includes(`${stamp} edited`) && deleted.status !== 500,
    `post=${deleted.status}`,
  );
} else {
  check("Resolve created contact id", false, "could not parse contact id from list HTML");
}

const aal1 = await request(new Map(), "/contacts");
check(
  "Signed-out /contacts redirects to login",
  aal1.status === 307 && (aal1.location ?? "").includes("/login"),
  aal1.location,
);

const logoutStore = new Map();
const logoutLoginPage = await request(logoutStore, "/login");
const logoutLoginForm = new FormData();
fillHidden(logoutLoginForm, logoutLoginPage.text);
logoutLoginForm.append("email", EMAIL_A);
logoutLoginForm.append("password", env.ISOLATION_A_PASSWORD);
const logoutLogin = await request(logoutStore, "/login", { method: "POST", body: logoutLoginForm });
const challengePath = (logoutLogin.location ?? "/mfa/challenge").startsWith("/")
  ? logoutLogin.location
  : "/mfa/challenge";
const challengePage = await request(logoutStore, challengePath);
const logoutForm = new FormData();
fillHidden(logoutForm, formInner(challengePage.text, (inner) => /Sign out|Signing out/i.test(inner)));
const logoutPost = await request(logoutStore, "/mfa/challenge", { method: "POST", body: logoutForm });
const afterLogout = await request(logoutStore, "/dashboard");
check(
  "Logout from MFA challenge",
  afterLogout.status === 307 && (afterLogout.location ?? "").includes("/login"),
  `post=${logoutPost.status} then GET /dashboard -> ${afterLogout.status} ${afterLogout.location}`,
);

const anonStore = new Map();
const forgotPage = await request(anonStore, "/forgot-password");
const forgotForm = new FormData();
fillHidden(forgotForm, formInner(forgotPage.text, (inner) => inner.includes('name="email"')));
forgotForm.append("email", "nobody-verify@example.com");
const forgotPost = await request(anonStore, "/forgot-password", { method: "POST", body: forgotForm });
check(
  "Password reset form accepts request (no account enumeration)",
  forgotPost.status === 200 &&
    (forgotPost.text.includes("If an account exists for that address") ||
      forgotPost.text.includes("password reset link is on its way")),
  strip(forgotPost.text).slice(0, 120),
);

const jakeStore = new Map();
const jakePage = await request(jakeStore, "/login");
const jakeForm = new FormData();
fillHidden(jakeForm, jakePage.text);
jakeForm.append("email", "jake@powerbridge.io");
jakeForm.append("password", "not-the-real-password");
const jakeWrong = await request(jakeStore, "/login", { method: "POST", body: jakeForm });
check(
  "Wrong password still rejected",
  jakeWrong.status === 200 && jakeWrong.text.includes("Incorrect email or password"),
);

const loginHtml = loginPage.text;
check("No service_role in /login HTML", !/service_role|sb_secret|SUPABASE_SERVICE/i.test(loginHtml));
check("No SMTP/Resend secrets in /login HTML", !/smtp\.resend|re_[A-Za-z0-9]{8,}/i.test(loginHtml));

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exitCode = 1;
void EMAIL_B;

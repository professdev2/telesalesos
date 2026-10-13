/**
 * Tenant and ownership isolation proof for Training.
 *
 * Uses password-grant JWTs plus the publishable key only. The service role key
 * is never read by checks that claim RLS.
 *
 *   node scripts/isolation-training.mjs
 */

import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const ORG_A = "b00174b6-bb5d-4856-bfcf-a0bf9868f01b";
const ORG_B = "552bf447-1115-4808-9a2c-d3de4511a25e";
const EMAIL_A = "isolation.a.d10@gmail.com";
const EMAIL_B = "isolation.b.d10@gmail.com";
const COURSE_A = "isolation-training-A";
const COURSE_B = "isolation-training-B";
const ATTACK = "Fake Bob training";

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
  if (!res.ok) {
    throw new Error(`Login failed for ${email}: ${body.error_description ?? body.msg}`);
  }
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
function record(name, response, pass) {
  const detail =
    typeof response === "string"
      ? response
      : `${response.status} ${JSON.stringify(response.body)}`;
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
}

async function ensureCourse(call, orgId, name) {
  const existing = await call(
    `training_courses?select=id&name=eq.${encodeURIComponent(name)}`,
  );
  if (Array.isArray(existing.body) && existing.body[0]?.id) {
    return existing.body[0].id;
  }

  const created = await call("training_courses", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      visibility: "organization",
      organization_id: orgId,
      name,
    }),
  });
  if (!created.ok || !created.body?.[0]?.id) {
    throw new Error(`Could not seed ${name}: ${created.status} ${JSON.stringify(created.body)}`);
  }
  return created.body[0].id;
}

async function ensureLesson(call, courseId, title) {
  const existing = await call(
    `training_lessons?select=id&course_id=eq.${courseId}&title=eq.${encodeURIComponent(title)}`,
  );
  if (Array.isArray(existing.body) && existing.body[0]?.id) {
    return existing.body[0].id;
  }

  const created = await call("training_lessons", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      course_id: courseId,
      title,
      vimeo_video_id: "76979871",
      sort_order: 0,
    }),
  });
  if (!created.ok || !created.body?.[0]?.id) {
    throw new Error(`Could not seed lesson: ${created.status} ${JSON.stringify(created.body)}`);
  }
  return created.body[0].id;
}

async function ensureResource(call, lessonId, title) {
  const existing = await call(
    `training_resources?select=id&lesson_id=eq.${lessonId}&title=eq.${encodeURIComponent(title)}`,
  );
  if (Array.isArray(existing.body) && existing.body[0]?.id) {
    return existing.body[0].id;
  }

  const created = await call("training_resources", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      lesson_id: lessonId,
      title,
      url: "https://example.com/training-resource.pdf",
    }),
  });
  if (!created.ok || !created.body?.[0]?.id) {
    throw new Error(`Could not seed resource: ${created.status} ${JSON.stringify(created.body)}`);
  }
  return created.body[0].id;
}

async function main() {
  const env = await loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const passwordA =
    process.env.ISOLATION_A_PASSWORD ||
    env.ISOLATION_A_PASSWORD ||
    (await askPassword(EMAIL_A));
  const passwordB =
    process.env.ISOLATION_B_PASSWORD ||
    env.ISOLATION_B_PASSWORD ||
    (await askPassword(EMAIL_B));

  const [tokenA, tokenB] = await Promise.all([
    signIn(url, key, EMAIL_A, passwordA),
    signIn(url, key, EMAIL_B, passwordB),
  ]);
  const asA = rest(url, key, tokenA);
  const asB = rest(url, key, tokenB);

  const courseA = await ensureCourse(asA, ORG_A, COURSE_A);
  const courseB = await ensureCourse(asB, ORG_B, COURSE_B);
  const lessonA = await ensureLesson(asA, courseA, `${COURSE_A}-lesson`);
  const lessonB = await ensureLesson(asB, courseB, `${COURSE_B}-lesson`);
  await ensureResource(asA, lessonA, `${COURSE_A}-resource`);
  await ensureResource(asB, lessonB, `${COURSE_B}-resource`);

  const aCourses = await asA(
    "training_courses?select=id,name,visibility,organization_id",
  );
  record(
    "A sees its organization course and no B organization course",
    aCourses,
    Array.isArray(aCourses.body) &&
      aCourses.body.some((row) => row.name === COURSE_A) &&
      !aCourses.body.some((row) => row.name === COURSE_B) &&
      aCourses.body
        .filter((row) => row.visibility === "organization")
        .every((row) => row.organization_id === ORG_A),
  );

  const aReadsB = await asA(
    `training_courses?select=id,name&organization_id=eq.${ORG_B}`,
  );
  record(
    "A filters for Org B courses",
    aReadsB,
    Array.isArray(aReadsB.body) && aReadsB.body.length === 0,
  );

  const bCourses = await asB(
    "training_courses?select=id,name,visibility,organization_id",
  );
  record(
    "B sees its organization course and no A organization course",
    bCourses,
    Array.isArray(bCourses.body) &&
      bCourses.body.some((row) => row.name === COURSE_B) &&
      !bCourses.body.some((row) => row.name === COURSE_A),
  );

  const forgedOrg = await asA("training_courses", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      visibility: "organization",
      organization_id: ORG_B,
      name: ATTACK,
    }),
  });
  record("A inserts an agency course into Org B", forgedOrg, !forgedOrg.ok);

  const forgedPlatform = await asA("training_courses", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      visibility: "platform",
      organization_id: null,
      name: ATTACK,
    }),
  });
  record(
    "A cannot promote itself to platform publisher",
    forgedPlatform,
    !forgedPlatform.ok,
  );

  const crossLesson = await asA("training_lessons", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      course_id: courseB,
      title: ATTACK,
      vimeo_video_id: "76979871",
    }),
  });
  record("A inserts a lesson into B's course", crossLesson, !crossLesson.ok);

  const crossResource = await asA("training_resources", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      lesson_id: lessonB,
      title: ATTACK,
      url: "https://example.com/attack.pdf",
    }),
  });
  record(
    "A inserts a resource into B's lesson",
    crossResource,
    !crossResource.ok,
  );

  const bAfter = await asB(
    `training_courses?select=id,name&name=eq.${encodeURIComponent(ATTACK)}`,
  );
  record(
    "B has no forged course after attacks",
    bAfter,
    Array.isArray(bAfter.body) && bAfter.body.length === 0,
  );

  const bLessonsAfter = await asB(
    `training_lessons?select=id,title&title=eq.${encodeURIComponent(ATTACK)}`,
  );
  record(
    "B has no forged lesson after attacks",
    bLessonsAfter,
    Array.isArray(bLessonsAfter.body) && bLessonsAfter.body.length === 0,
  );

  const anonCourses = await fetch(
    `${url}/rest/v1/training_courses?select=id`,
    { headers: { apikey: key } },
  );
  record(
    "Anonymous cannot read courses",
    `${anonCourses.status} ${(await anonCourses.text()).slice(0, 140)}`,
    !anonCourses.ok,
  );

  const anonLessons = await fetch(
    `${url}/rest/v1/training_lessons?select=id`,
    { headers: { apikey: key } },
  );
  record(
    "Anonymous cannot read lessons",
    `${anonLessons.status} ${(await anonLessons.text()).slice(0, 140)}`,
    !anonLessons.ok,
  );

  // Children first because parent FKs are RESTRICT.
  await asA(`training_resources?lesson_id=eq.${lessonA}`, { method: "DELETE" });
  await asB(`training_resources?lesson_id=eq.${lessonB}`, { method: "DELETE" });
  await asA(`training_lessons?course_id=eq.${courseA}`, { method: "DELETE" });
  await asB(`training_lessons?course_id=eq.${courseB}`, { method: "DELETE" });
  await asA(`training_courses?id=eq.${courseA}`, { method: "DELETE" });
  await asB(`training_courses?id=eq.${courseB}`, { method: "DELETE" });
  await asA(`training_courses?name=eq.${encodeURIComponent(ATTACK)}`, {
    method: "DELETE",
  });
  await asB(`training_courses?name=eq.${encodeURIComponent(ATTACK)}`, {
    method: "DELETE",
  });

  const failed = results.filter((result) => !result.pass);
  console.log(
    `\n${failed.length === 0 ? "ALL CHECKS PASSED" : `${failed.length} CHECK(S) FAILED`} — ${results.length} total`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nError: ${error.message}`);
  process.exit(1);
});

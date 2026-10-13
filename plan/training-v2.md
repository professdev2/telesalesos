# Training v2 — academy

**Status:** catalog UI slice in progress.  
**v1** remains the Vimeo library (`plan/training.md`).  
**Client ask (Jake):** “make the training section better” → Televersity-style catalog (thumbnails + sections) and script downloads on lessons.

---

## Approved first slice (this work)

1. **Catalog UI** — course cards with optional thumbnail + section grouping on `/training`
2. Thumbnail = **HTTPS image URL** / Pexels search (server-only `PEXELS_API_KEY`)
3. Keep lesson **HTTPS download links** for scripts/PDFs (v1)

## Second slice (file uploads)

4. **Hosted files** — private Supabase Storage bucket `training-files`
   - Paths: `platform/{course}/{lesson}/…` or `{org_id}/{course}/{lesson}/…`
   - Owners/admins upload PDF/Word/Excel/txt (max 10 MB)
   - Members download via short-lived signed URLs
   - Migration `20260927140000_training_file_uploads.sql`

## Later (not this pass)

- Mark complete / resume / % progress
- Quizzes and scores
- Certificates and expiry
- Required tracks, due dates, prerequisites
- Manager / pod completion dashboard

---

## Out of v2 unless separately approved

SCORM, live classes, YouTube, Mux, Telnyx in the player.

---

## Schema (catalog slice)

Migration `20260927120000_training_catalog_ui.sql`:

- `training_courses.section` text null (1–80 chars)
- `training_courses.thumbnail_url` text null (https only)

---

## Isolation

Progress and scores (when added) are per user and per org. Org A cannot read Org B completions. Platform catalog progress is still **per learner org**, not a global leaderboard unless the client asks.

---

## Done when (catalog slice)

- `/training` shows sectioned thumbnail cards for platform + agency libraries
- Owners/admins can set section + thumbnail URL on create/edit
- Courses without a section appear under **General**
- Isolation training script still PASS
- No Storage bucket yet

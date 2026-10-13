# PowerBridge Web → TelesalesOS Inbound Webhook Spec

**Endpoint to build:** `POST https://telesalesos.vercel.app/api/inbound/powerbridge-web?key=<SECRET>`

Two forms on powerbridgemedia.com post straight to this URL. The visitor's browser does a normal HTML form submit, with no JavaScript fetch involved, so **your endpoint's response is what the visitor sees next**.

---

## 1. Request

| Item | Value |
|---|---|
| Method | `POST` |
| Content-Type | `application/x-www-form-urlencoded` (standard HTML form, not JSON) |
| Auth | `key` query-string param. Reject with 401 if it doesn't match. It's visible in page source, so treat it as a source identifier plus a basic filter, not strong auth. |
| CORS | Not needed (top-level form navigation, not XHR) |
| Encoding | UTF-8. Some values contain `—`, `&`, `/` |

Several field names contain **spaces** (e.g. `Interested In`). Parse the body as form data and read the keys exactly as written below.

---

## 2. Required response behavior

1. **Honeypot:** if `_honey` is non-empty, it's a bot. Don't create a lead, but still redirect to `_next` so the bot learns nothing.
2. **Redirect:** on success, respond with **`303 See Other`** and `Location: <_next value>`.
   - Only allow `_next` values that start with `https://powerbridgemedia.com/`. Otherwise use `https://powerbridgemedia.com/thank-you.html` (this prevents an open redirect).
   - If you return JSON or 200, the visitor will see a raw response page instead of the thank-you page.
3. **On internal error:** still 303 to `_next` if at all possible. Log the payload and alert internally; don't lose the lead.
4. **Notification:** FormSubmit emails to jake@jakelynn.com stop once this goes live. TelesalesOS needs to send the new-lead notification. `_subject` holds the subject line to use.

Ignore `_template` and `_captcha` (leftover FormSubmit settings).

---

## 3. Form A: Main lead form ("Tell us what you need", homepage `#get-started`)

**Identify it by:** there's no `Offer` field, and `_next` contains `type=general`.

| Field | Type | Required | Notes / example |
|---|---|---|---|
| `_subject` | hidden | – | `New lead from PowerBridge Media` |
| `_next` | hidden | – | `https://powerbridgemedia.com/thank-you.html?type=general` |
| `_honey` | honeypot | – | must be empty |
| `Name` | text | yes | `Jane Smith` (full name in one field; split if the CRM needs first/last) |
| `Company` | text | no | Company / agency name. Also accepts `Company Name` / `company` / `company_name`. Creates or matches a CRM Company and links contact + lead. |
| `Phone` | tel | yes | free-form. Normalize to E.164 (`+15555555555`) |
| `Email` | email | yes | |
| `Interested In` | select | yes | one of the values below |
| `Verticals` | string | yes | **comma + space separated list**, e.g. `Final expense, Medicare, Solar`. Split on `", "` |
| `Other Vertical` | text | only if `Verticals` includes `Other` | free text |
| `How Did You Hear About Us` | select | yes | lead source, see values below |
| `Message` | textarea | no | |

**`Interested In` values:**
`Leads (pay-per-call / pay-per-lead)` · `Live calls & warm transfers` · `Aged leads / data` · `Voice AI & tech advisory` · `BPO teams` · `Web design` · `SEO / AEO monthly packages` · `Not sure yet — let's talk`

**`Verticals` possible values:**
`Final expense` · `Life insurance` · `Medicare` · `ACA / health insurance` · `Auto insurance` · `Home services` · `Home security` · `Home warranty` · `Solar` · `Legal — MVA & mass tort` · `Debt settlement` · `Tax settlement` · `Credit repair` · `Bankruptcy` · `MCA / business funding` · `Mortgage` · `Education` · `Call center / BPO` · `Other`

Note: `ACA / health insurance` contains a `/`, not a comma, so splitting on `", "` is safe.

**`How Did You Hear About Us` values:**
`Google search` · `ChatGPT or another AI assistant` · `LinkedIn` · `Facebook / Instagram` · `YouTube` · `Podcast` · `Referral / word of mouth` · `Industry event or conference` · `Email` · `Other`

---

## 4. Form B: Exit popup ("25% off your first aged leads order", site-wide on 41 pages)

**Identify it by:** `Offer` is present, and `_next` contains `type=aged-leads-offer`.

| Field | Type | Required | Notes / example |
|---|---|---|---|
| `_subject` | hidden | – | `EXIT OFFER: 25% off first aged leads order — PowerBridge Media` |
| `Offer` | hidden | – | **`25% off first aged leads order`**, use this as the promo/campaign tag |
| `Page` | hidden | – | full URL the popup was claimed on, e.g. `https://powerbridgemedia.com/aged-leads/final-expense/` |
| `_next` | hidden | – | `https://powerbridgemedia.com/thank-you.html?type=aged-leads-offer` |
| `_honey` | honeypot | – | must be empty |
| `Name` | text | yes | |
| `Company` | text | no | Same as Form A (optional on exit popup) |
| `Email` | email | yes | |
| `Phone` | tel | yes | |
| `Aged Leads Vertical` | select | yes | **single** value, see below |

**`Aged Leads Vertical` values:**
`Final expense` · `Life insurance` · `Medicare / ACA` · `Health insurance` · `Auto insurance` · `Home services` · `Home security` · `Home warranty` · `Solar` · `Legal / MVA` · `Debt settlement` · `Tax settlement` · `Credit repair` · `Bankruptcy` · `MCA / business funding` · `Mortgage` · `Education` · `Business opportunity` · `Call centers` · `Other / multiple`

These labels differ slightly from Form A's vertical labels (e.g. `Medicare / ACA` vs `Medicare`). Map both sets to one internal vertical list.

---

## 5. Suggested CRM mapping

| CRM field | Form A | Form B |
|---|---|---|
| source | `powerbridge-web` | `powerbridge-web` |
| form / lead type | `main_lead_form` | `exit_offer_aged_leads` |
| name / phone / email | `Name` / `Phone` / `Email` | same |
| company | `Company` (find/create + link) | same |
| interest | `Interested In` | `Aged leads / data` (implied) |
| verticals (array) | `Verticals` split + `Other Vertical` | `[Aged Leads Vertical]` |
| lead source | `How Did You Hear About Us` | – |
| promo tag | – | `Offer` |
| landing page | `Referer` header (optional) | `Page` |
| notes | `Message` | – |

Also store the raw payload, the timestamp, and the IP/User-Agent for dedupe and TCPA records.

---

## 6. Test requests

```bash
# Form A
curl -i -X POST "https://telesalesos.vercel.app/api/inbound/powerbridge-web?key=SECRET" \
  --data-urlencode "_subject=New lead from PowerBridge Media" \
  --data-urlencode "_next=https://powerbridgemedia.com/thank-you.html?type=general" \
  --data-urlencode "_honey=" \
  --data-urlencode "Name=Test Lead" \
  --data-urlencode "Company=Acme Agency" \
  --data-urlencode "Phone=(555) 555-5555" \
  --data-urlencode "Email=test@example.com" \
  --data-urlencode "Interested In=Aged leads / data" \
  --data-urlencode "Verticals=Final expense, Medicare, Other" \
  --data-urlencode "Other Vertical=Pest control" \
  --data-urlencode "How Did You Hear About Us=Google search" \
  --data-urlencode "Message=Testing"

# Form B
curl -i -X POST "https://telesalesos.vercel.app/api/inbound/powerbridge-web?key=SECRET" \
  --data-urlencode "_subject=EXIT OFFER: 25% off first aged leads order — PowerBridge Media" \
  --data-urlencode "Offer=25% off first aged leads order" \
  --data-urlencode "Page=https://powerbridgemedia.com/aged-leads/final-expense/" \
  --data-urlencode "_next=https://powerbridgemedia.com/thank-you.html?type=aged-leads-offer" \
  --data-urlencode "_honey=" \
  --data-urlencode "Name=Test Lead" \
  --data-urlencode "Company=Acme Agency" \
  --data-urlencode "Email=test@example.com" \
  --data-urlencode "Phone=5555555555" \
  --data-urlencode "Aged Leads Vertical=Final expense"
```

**Expected result:** `HTTP/1.1 303` with `Location: https://powerbridgemedia.com/thank-you.html?type=...`, and the lead visible in TelesalesOS.

---

## 7. Go-live order

1. Dev deploys the endpoint and confirms both curl tests pass.
2. Dev sends Jake the real secret.
3. Replace `REPLACE_WITH_SECRET` in the 45 site files and upload them to Cloudways.
4. Submit both forms live on powerbridgemedia.com and confirm each lands in the CRM and redirects to the thank-you page.

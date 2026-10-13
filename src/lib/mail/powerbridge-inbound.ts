import "server-only";

import type { PowerbridgeWebPayload } from "@/lib/inbound/powerbridge-web";

const FROM = "TelesalesOS <noreply@telesalesos.com>";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Notify Jake (or POWERBRIDGE_INBOUND_NOTIFY_EMAIL) when a website lead lands.
 * FormSubmit email stops once the site posts here instead.
 */
export async function sendPowerbridgeInboundNotify(input: {
  payload: PowerbridgeWebPayload;
  tagged25: boolean;
  contactId: string;
  leadId: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { sent: false, error: "missing_key" };
  }

  const to =
    process.env.POWERBRIDGE_INBOUND_NOTIFY_EMAIL?.trim() || "jake@jakelynn.com";
  const subject =
    input.payload.subject?.trim() ||
    (input.tagged25
      ? "EXIT OFFER: 25% off first aged leads order — PowerBridge Media"
      : "New lead from PowerBridge Media");

  const rows: [string, string | undefined][] = [
    ["Name", input.payload.name],
    ["Company", input.payload.company],
    ["Email", input.payload.email],
    ["Phone", input.payload.phone],
    ["Form", input.tagged25 ? "Exit offer (25% aged leads)" : "Get Started"],
    ["Interested In", input.payload.interestedIn],
    ["Verticals", input.payload.verticals],
    ["Other Vertical", input.payload.otherVertical],
    ["Aged Leads Vertical", input.payload.agedLeadsVertical],
    ["How Did You Hear About Us", input.payload.heardAbout],
    ["Offer", input.payload.offer],
    ["Page", input.payload.page],
    ["Message", input.payload.message],
    ["CRM contact", input.contactId],
    ["CRM lead", input.leadId],
  ];

  const table = rows
    .filter(([, value]) => value)
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;vertical-align:top;"><strong>${escapeHtml(label)}</strong></td><td style="padding:4px 0;">${escapeHtml(value!)}</td></tr>`,
    )
    .join("");

  const html = `
    <p>New PowerBridge website lead in TelesalesOS.</p>
    <table>${table}</table>
    <p><a href="https://telesalesos.vercel.app/leads/${escapeHtml(input.leadId)}">Open lead</a></p>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("powerbridge inbound notify failed", response.status, detail.slice(0, 200));
    return { sent: false, error: "send_failed" };
  }

  return { sent: true };
}

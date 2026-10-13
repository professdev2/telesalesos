import "server-only";

const FROM = "TelesalesOS <noreply@telesalesos.com>";

export type InvitationMailInput = {
  to: string;
  organizationName: string;
  inviteUrl: string;
  role: "admin" | "member";
};

/**
 * Sends the existing hashed invite URL through Resend.
 *
 * Auth confirmation still uses Supabase SMTP. Team invitations are not an Auth
 * template, so they need a server-only API key. Never put that key in
 * NEXT_PUBLIC_*.
 */
export async function sendInvitationEmail(
  input: InvitationMailInput,
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { sent: false, error: "missing_key" };
  }

  const roleLabel = input.role === "admin" ? "an admin" : "a member";
  const html = `
    <p>You have been invited to join <strong>${escapeHtml(input.organizationName)}</strong> on TelesalesOS as ${roleLabel}.</p>
    <p>Creating an account is not enough. Open the link below, sign in with <strong>${escapeHtml(input.to)}</strong>, then click Join organization.</p>
    <p><a href="${escapeHtml(input.inviteUrl)}">Accept the invitation</a></p>
    <p>This link expires in seven days. If you were not expecting this, you can ignore it.</p>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [input.to],
      subject: `Join ${input.organizationName} on TelesalesOS`,
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("invitation email failed", response.status, detail.slice(0, 200));
    return { sent: false, error: "send_failed" };
  }

  return { sent: true };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

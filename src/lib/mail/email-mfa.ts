import "server-only";

const FROM = "TelesalesOS <noreply@telesalesos.com>";

/**
 * Delivers a 6-digit Email OTP. The code is only in the message body.
 * Never log it. Auth confirmation still uses Supabase SMTP.
 */
export async function sendEmailMfaCode(
  to: string,
  code: string,
): Promise<{ sent: boolean; error?: "missing_key" | "send_failed" }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { sent: false, error: "missing_key" };
  }

  const html = `
    <p>Your TelesalesOS sign-in code is:</p>
    <p style="font-size:24px;letter-spacing:0.3em;font-family:ui-monospace,monospace">${escapeHtml(code)}</p>
    <p>It expires in ten minutes. If you did not try to sign in, you can ignore this.</p>
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
      subject: "Your TelesalesOS sign-in code",
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("email mfa send failed", response.status, detail.slice(0, 200));
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

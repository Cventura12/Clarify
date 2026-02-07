const RESEND_ENDPOINT = "https://api.resend.com/emails";

interface SendEmailParams {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendDueDigestEmail(params: SendEmailParams) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY not configured");
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend API error: ${text}`);
  }

  return response.json();
}

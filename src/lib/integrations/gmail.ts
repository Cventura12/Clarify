import { prisma } from "@/lib/db/client";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

const base64UrlEncode = (input: string) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const refreshAccessToken = async (refreshToken: string) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials are not set");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to refresh token: ${text}`);
  }

  return (await response.json()) as {
    access_token: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };
};

export async function getGmailAccessToken(userId: string) {
  const account = await prisma.oAuthAccount.findFirst({
    where: { provider: "google", userId },
  });

  if (!account) {
    throw new Error("Google account not connected");
  }

  const now = Date.now();
  const expiresAt = account.expiresAt?.getTime() ?? 0;
  const isExpired = expiresAt !== 0 && now >= expiresAt - 60_000;

  if (!isExpired) return account.accessToken;

  if (!account.refreshToken) {
    throw new Error("Missing refresh token for Google account");
  }

  const refreshed = await refreshAccessToken(account.refreshToken);
  const nextExpiresAt = refreshed.expires_in
    ? new Date(Date.now() + refreshed.expires_in * 1000)
    : account.expiresAt;

  const updated = await prisma.oAuthAccount.update({
    where: { id: account.id },
    data: {
      accessToken: refreshed.access_token,
      expiresAt: nextExpiresAt ?? null,
      scope: refreshed.scope ?? account.scope,
      tokenType: refreshed.token_type ?? account.tokenType,
    },
  });

  return updated.accessToken;
}

export async function createDraft(params: {
  accessToken: string;
  subject: string;
  body: string;
  to?: string;
}) {
  const lines = [
    params.to ? `To: ${params.to}` : undefined,
    `Subject: ${params.subject}`,
    "Content-Type: text/plain; charset=\"UTF-8\"",
    "",
    params.body,
  ].filter(Boolean);

  const raw = base64UrlEncode(lines.join("\r\n"));

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: { raw } }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create Gmail draft: ${text}`);
  }

  const payload = await response.json();
  return {
    draftId: payload.id as string,
    threadId: payload.message?.threadId as string | undefined,
  };
}

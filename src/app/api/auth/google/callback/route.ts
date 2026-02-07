import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const storedState = cookies().get("oauth_state")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: "Google OAuth env vars not set" }, { status: 500 });
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json({ error: text }, { status: 500 });
  }

  const payload = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    scope?: string;
    token_type?: string;
    expires_in?: number;
  };

  const expiresAt = payload.expires_in
    ? new Date(Date.now() + payload.expires_in * 1000)
    : null;

  const existing = await prisma.oAuthAccount.findFirst({
    where: { provider: "google", userId: user.id },
  });

  if (existing) {
    await prisma.oAuthAccount.update({
      where: { id: existing.id },
      data: {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token ?? existing.refreshToken,
        scope: payload.scope ?? existing.scope,
        tokenType: payload.token_type ?? existing.tokenType,
        expiresAt,
      },
    });
  } else {
    await prisma.oAuthAccount.create({
      data: {
        provider: "google",
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token ?? null,
        scope: payload.scope ?? null,
        tokenType: payload.token_type ?? null,
        expiresAt,
        userId: user.id,
      },
    });
  }

  cookies().delete("oauth_state");
  return NextResponse.redirect(new URL("/requests", req.url));
}

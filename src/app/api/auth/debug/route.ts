import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  const session = await getServerSession(authOptions);
  const response: { hasSession: boolean; userEmail?: string } = {
    hasSession: Boolean(session?.user),
  };

  if (session?.user?.email) {
    response.userEmail = session.user.email;
  }

  return NextResponse.json(response);
}

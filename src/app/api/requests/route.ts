import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requests = await prisma.request.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      plan: {
        include: {
          steps: {
            orderBy: { sequence: "asc" },
            include: { outcome: true },
          },
        },
      },
    },
  });

  return NextResponse.json({ requests }, { status: 200 });
}

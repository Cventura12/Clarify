import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth";

const statusSchema = z.object({
  requestId: z.string().min(1),
  status: z.enum(["DONE", "BLOCKED", "DEFERRED"]),
  message: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = statusSchema.parse(await req.json());

    const request = await prisma.request.findFirst({
      where: { id: body.requestId, userId: user.id },
      select: { id: true },
    });

    if (!request) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.request.updateMany({
        where: { id: body.requestId, userId: user.id },
        data: { status: body.status },
      });

      if (body.status === "BLOCKED" || body.status === "DEFERRED") {
        const nextCheckAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        await tx.step.updateMany({
          where: {
            status: "PENDING",
            plan: {
              requestId: body.requestId,
              request: { userId: user.id },
            },
          },
          data: { nextCheckAt },
        });
      }

      await tx.actionLog.create({
        data: {
          action: "STATUS_CHANGED",
          requestId: body.requestId,
          message: body.message ?? `status:${body.status}`,
        },
      });

      return tx.request.findFirst({
        where: { id: body.requestId, userId: user.id },
        include: {
          plan: {
            include: {
              steps: {
                include: { outcome: true },
                orderBy: { sequence: "asc" },
              },
            },
          },
          delegations: { orderBy: { createdAt: "desc" } },
        },
      });
    });

    return NextResponse.json({ request: updated }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

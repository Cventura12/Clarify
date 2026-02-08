import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth";

const authorizeSchema = z.object({
  requestId: z.string().min(1),
  planId: z.string().min(1).optional(),
  scope: z.record(z.string(), z.unknown()).optional(),
  approvedStepIds: z.array(z.string().min(1)).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = authorizeSchema.parse(await req.json());

    const request = await prisma.request.findFirst({
      where: { id: body.requestId, userId: user.id },
      include: {
        plan: {
          include: {
            steps: { orderBy: { sequence: "asc" } },
          },
        },
        delegations: true,
      },
    });

    if (!request || !request.plan) {
      return NextResponse.json({ error: "Request or plan not found" }, { status: 400 });
    }

    if (body.planId && request.plan.id !== body.planId) {
      return NextResponse.json({ error: "Plan does not match request" }, { status: 400 });
    }

    const scope = (body.scope ?? {
      canDraftEmail: true,
      canCreateGmailDraft: false,
    }) as Prisma.InputJsonValue;
    const planStepIds = request.plan.steps.map((step) => step.id);
    const approvedStepIds = body.approvedStepIds ?? planStepIds;
    const approvedStepIdsJson = approvedStepIds as Prisma.InputJsonValue;

    if (body.approvedStepIds) {
      const invalid = approvedStepIds.filter((id) => !planStepIds.includes(id));
      if (invalid.length > 0) {
        return NextResponse.json({ error: "approvedStepIds must belong to plan steps" }, { status: 400 });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const delegation = await tx.delegation.create({
        data: {
          status: "APPROVED",
          scope,
          approvedStepIds: approvedStepIdsJson,
          userId: user.id,
          requestId: request.id,
          planId: request.plan?.id ?? null,
        },
      });

      await tx.actionLog.create({
        data: {
          action: "DELEGATION_GRANTED",
          requestId: request.id,
          delegationId: delegation.id,
          payloadPreview: {
            requestId: request.id,
            planId: request.plan?.id ?? null,
            countSteps: approvedStepIds.length,
            scope,
          },
        },
      });

      await tx.request.updateMany({
        where: { id: request.id, userId: user.id },
        data: { status: "AUTHORIZED" },
      });

      return delegation;
    });

    const updatedRequest = await prisma.request.findFirst({
      where: { id: request.id, userId: user.id },
      include: {
        plan: {
          include: {
            steps: { orderBy: { sequence: "asc" } },
          },
        },
        delegations: true,
      },
    });

    return NextResponse.json({ request: updatedRequest, delegation: result }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

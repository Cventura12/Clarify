import { prisma } from "@/lib/db/client";
import { LLM_CONFIG } from "@/lib/config/llm";
import { callLLM } from "@/lib/llm/client";
import { PLAN_SYSTEM_PROMPT } from "@/lib/llm/prompts";
import {
  mapDelegation,
  mapDomain,
  mapEffort,
  mapStepStatus,
} from "@/lib/services/enum-mappers";
import { buildContext } from "@/lib/context/buildContext";
import type { InterpretedTask, PlanResponse } from "@/lib/types";

const classifyActionType = (action: string, detail?: string | null) => {
  const text = `${action} ${detail ?? ""}`.toLowerCase();
  if (text.includes("gmail") && text.includes("draft")) {
    return "CREATE_GMAIL_DRAFT";
  }
  if (text.includes("draft") && text.includes("email")) {
    return "DRAFT_EMAIL";
  }
  return "USER_ONLY";
};

export async function generatePlan(requestId: string, task: InterpretedTask, userId: string) {
  const request = await prisma.request.findFirst({
    where: { id: requestId, userId },
    select: { rawInput: true, domain: true },
  });

  if (!request) {
    throw new Error("Request not found");
  }

  const domain = request.domain ?? mapDomain(task.domain);
  const context = await buildContext({
    rawInput: request.rawInput,
    domain,
    currentRequestId: requestId,
    userId,
  });
  const includedRequestIds = (context.priorRequests as Array<{ id: string }>).map((item) => item.id);

  await prisma.actionLog.create({
    data: {
      action: "CONTEXT_USED",
      requestId,
      payloadPreview: {
        requestId,
        includedRequestIds,
        includedCount: includedRequestIds.length,
        domain,
      },
    },
  });

  await prisma.request.updateMany({
    where: { id: requestId, userId },
    data: { status: "PLANNING" },
  });

  const plan = await callLLM<PlanResponse>({
    systemPrompt: PLAN_SYSTEM_PROMPT,
    userMessage: `TASK:\n${JSON.stringify(task)}\n\nCONTEXT:\n${JSON.stringify(context)}`,
    model: LLM_CONFIG.planModel,
    maxTokens: LLM_CONFIG.planMaxTokens,
  });

  if (!plan || !Array.isArray(plan.steps)) {
    throw new Error("Plan response missing steps array");
  }
  if (typeof plan.total_steps !== "number") {
    throw new Error("Plan response missing total_steps");
  }
  if (!plan.next_action) {
    throw new Error("Plan response missing next_action");
  }

  const planId = await prisma.$transaction(async (tx) => {
    const createdPlan = await tx.plan.create({
      data: {
        totalSteps: plan.total_steps,
        estimatedTotalEffort: plan.estimated_total_effort ?? null,
        deadline: plan.deadline ? new Date(plan.deadline) : null,
        planResult: JSON.stringify(plan),
        requestId,
      },
    });

    for (const step of plan.steps) {
      await tx.step.create({
        data: {
          sequence: step.step_number,
          action: step.action,
          detail: step.detail ?? null,
          actionType: classifyActionType(step.action, step.detail),
          effort: mapEffort(step.effort),
          delegation: mapDelegation(step.delegation),
          suggestedDate: step.suggested_date ? new Date(step.suggested_date) : null,
          status: mapStepStatus(step.status),
          dependencies: step.dependencies ? JSON.stringify(step.dependencies) : null,
          planId: createdPlan.id,
        },
      });
    }

    await tx.request.updateMany({
      where: { id: requestId, userId },
      data: { status: "PLANNED" },
    });

    return createdPlan.id;
  });

  await prisma.request.updateMany({
    where: { id: requestId, userId },
    data: { status: "AWAITING_AUTHORITY" },
  });

  return { planId, plan };
}

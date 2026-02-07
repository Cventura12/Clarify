import { prisma } from "@/lib/db/client";
import { LLM_CONFIG } from "@/lib/config/llm";
import { callLLM } from "@/lib/llm/client";
import { INTERPRET_SYSTEM_PROMPT } from "@/lib/llm/prompts";
import { mapComplexity, mapDomain, mapUrgency } from "@/lib/services/enum-mappers";
import { buildContext } from "@/lib/context/buildContext";
import type { InterpretResponse } from "@/lib/types";

export async function interpretRequest(rawInput: string, userId: string) {
  let requestId: string | null = null;

  try {
    const request = await prisma.request.create({
      data: {
        rawInput,
        status: "INTERPRETING",
        userId,
      },
    });

    requestId = request.id;

    const context = await buildContext({
      rawInput,
      currentRequestId: request.id,
      userId,
    });
    const includedRequestIds = (context.priorRequests as Array<{ id: string }>).map((item) => item.id);

    await prisma.actionLog.create({
      data: {
        action: "CONTEXT_USED",
        requestId: request.id,
        payloadPreview: {
          requestId: request.id,
          includedRequestIds,
          includedCount: includedRequestIds.length,
          domain: null,
        },
      },
    });

    const interpretation = await callLLM<InterpretResponse>({
      systemPrompt: INTERPRET_SYSTEM_PROMPT,
      userMessage: `${rawInput}\n\nCONTEXT:\n${JSON.stringify(context)}`,
      model: LLM_CONFIG.interpretModel,
      maxTokens: LLM_CONFIG.interpretMaxTokens,
    });

    if (!interpretation || !Array.isArray(interpretation.tasks)) {
      throw new Error("Interpretation missing tasks array");
    }
    if (typeof interpretation.request_count !== "number") {
      throw new Error("Interpretation missing request_count");
    }

    for (const task of interpretation.tasks) {
      if (!task.task_id || !task.title || !task.domain || !task.urgency) {
        throw new Error("Interpretation task is missing required fields");
      }
    }

    const primaryTask = interpretation.tasks[0];

    await prisma.request.update({
      where: { id: request.id },
      data: {
        domain: primaryTask ? mapDomain(primaryTask.domain) : undefined,
        urgency: primaryTask ? mapUrgency(primaryTask.urgency) : undefined,
        complexity: primaryTask ? mapComplexity(primaryTask.complexity) : undefined,
        title: primaryTask?.title ?? null,
        summary: primaryTask?.summary ?? null,
        interpretResult: JSON.stringify(interpretation),
        status: "INTERPRETED",
      },
    });

    return { requestId: request.id, interpretation };
  } catch (error) {
    if (requestId) {
      await prisma.request.updateMany({
        where: { id: requestId, userId },
        data: { status: "ERROR" },
      });
    }

    throw error;
  }
}

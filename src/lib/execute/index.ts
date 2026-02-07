import { prisma } from "@/lib/db/client";
import { LLM_CONFIG } from "@/lib/config/llm";
import { callLLM } from "@/lib/llm/client";
import { DRAFT_EMAIL_SYSTEM_PROMPT } from "@/lib/llm/prompts";
import { DraftEmailSchema } from "@/lib/execute/schemas";
import { createDraft, getGmailAccessToken } from "@/lib/integrations/gmail";

type ExecuteMode = "ALL" | "RETRY_FAILED";

const RETRYABLE_REASONS = new Set(["GMAIL_API", "GMAIL_AUTH", "LLM_ERROR", "UNKNOWN"]);

const extractApprovedStepIds = (value: unknown) => {
  if (!Array.isArray(value)) return [] as string[];
  return value.filter((item): item is string => typeof item === "string");
};

const isScopeAllowed = (scope: unknown) => {
  if (!scope || typeof scope !== "object") return false;
  return (scope as { canDraftEmail?: boolean }).canDraftEmail === true;
};

const isScopeGmailAllowed = (scope: unknown) => {
  if (!scope || typeof scope !== "object") return false;
  return (scope as { canCreateGmailDraft?: boolean }).canCreateGmailDraft === true;
};

const redactSensitive = (value: string) => {
  return value
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[REDACTED]")
    .replace(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/g, "[REDACTED]")
    .replace(/\b[A-Z0-9]{8,12}\b/g, "[REDACTED]");
};

const readDraftFromOutput = (output: string | null) => {
  if (!output) return null;
  try {
    const parsed = JSON.parse(output) as {
      subject?: string;
      body?: string;
      assumptions?: string[];
      needsUserInput?: string[];
    };
    if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") return null;
    return {
      subject: parsed.subject,
      body: parsed.body,
      assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
      needsUserInput: Array.isArray(parsed.needsUserInput) ? parsed.needsUserInput : [],
    };
  } catch {
    return null;
  }
};

export async function executeAuthorizedRequest(
  requestId: string,
  userId: string,
  mode: ExecuteMode = "ALL"
) {
  const request = await prisma.request.findFirst({
    where: { id: requestId, userId },
    include: {
      plan: {
        include: {
          steps: {
            include: { outcome: true },
            orderBy: { sequence: "asc" },
          },
        },
      },
    },
  });

  if (!request || !request.plan) {
    throw new Error("Request or plan not found");
  }

  if (request.status !== "AUTHORIZED" && !(mode === "RETRY_FAILED" && request.status === "ERROR")) {
    throw new Error("Request is not authorized for execution");
  }

  const delegation = await prisma.delegation.findFirst({
    where: { requestId: request.id, status: "APPROVED", userId },
    orderBy: { createdAt: "desc" },
  });

  if (!delegation) {
    throw new Error("No approved delegation found");
  }

  const executionRun = await prisma.executionRun.create({
    data: {
      requestId: request.id,
      delegationId: delegation.id,
      userId,
      status: "STARTED",
    },
  });

  let retryStepIds: string[] | null = null;
  if (mode === "RETRY_FAILED") {
    const latestRun = await prisma.executionRun.findFirst({
      where: { requestId: request.id, userId },
      orderBy: { startedAt: "desc" },
      include: { steps: true },
    });

    retryStepIds =
      latestRun?.steps
        .filter(
          (step) => step.status === "FAILED" && step.reason && RETRYABLE_REASONS.has(step.reason)
        )
        .map((step) => step.stepId) ?? [];

    if (retryStepIds.length === 0) {
      await prisma.executionRun.update({
        where: { id: executionRun.id },
        data: {
          status: "PARTIAL",
          finishedAt: new Date(),
          summary: "No retryable failed steps.",
        },
      });

      const updatedRequest = await prisma.request.findFirst({
        where: { id: request.id, userId },
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
          executionRuns: { orderBy: { startedAt: "desc" }, take: 5, include: { steps: true } },
        },
      });

      return updatedRequest;
    }
  }

  const approvedStepIds = extractApprovedStepIds(delegation.approvedStepIds);
  const scopeAllowsDraft = isScopeAllowed(delegation.scope);
  const scopeAllowsGmailDraft = isScopeGmailAllowed(delegation.scope);

  let doneCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  let actionableCount = 0;

  for (const step of request.plan.steps) {
    if (retryStepIds && !retryStepIds.includes(step.id)) {
      continue;
    }

    const isApproved = approvedStepIds.includes(step.id);

    if (!isApproved) {
      await prisma.executionRunStep.create({
        data: {
          executionRunId: executionRun.id,
          stepId: step.id,
          status: "SKIPPED",
          reason: "NOT_APPROVED",
          message: "Step not approved",
        },
      });

      await prisma.actionLog.create({
        data: {
          action: "EXECUTION_SKIPPED",
          requestId: request.id,
          stepId: step.id,
          delegationId: delegation.id,
          message: "not_approved",
        },
      });

      await prisma.outcome.upsert({
        where: { stepId: step.id },
        create: { stepId: step.id, result: "SKIPPED", notes: "Step not approved" },
        update: { result: "SKIPPED", notes: "Step not approved" },
      });

      skippedCount += 1;
      continue;
    }

    if (step.actionType === "CREATE_GMAIL_DRAFT") {
      actionableCount += 1;

      if (!scopeAllowsGmailDraft) {
        await prisma.executionRunStep.create({
          data: {
            executionRunId: executionRun.id,
            stepId: step.id,
            status: "SKIPPED",
            reason: "SCOPE_DENIED",
            message: "Scope denied: canCreateGmailDraft",
          },
        });

        await prisma.actionLog.create({
          data: {
            action: "EXECUTION_SKIPPED",
            requestId: request.id,
            stepId: step.id,
            delegationId: delegation.id,
            message: "scope_denied",
          },
        });

        await prisma.outcome.upsert({
          where: { stepId: step.id },
          create: {
            stepId: step.id,
            result: "SKIPPED",
            notes: "Scope denied: canCreateGmailDraft",
          },
          update: {
            result: "SKIPPED",
            notes: "Scope denied: canCreateGmailDraft",
          },
        });

        skippedCount += 1;
        continue;
      }

      const runStep = await prisma.executionRunStep.create({
        data: {
          executionRunId: executionRun.id,
          stepId: step.id,
          status: "ATTEMPTED",
        },
      });

      await prisma.actionLog.create({
        data: {
          action: "EXECUTION_ATTEMPTED",
          requestId: request.id,
          stepId: step.id,
          delegationId: delegation.id,
          message: "Creating Gmail draft.",
        },
      });

      try {
        let draft = readDraftFromOutput(step.outcome?.output ?? null);

        if (!draft) {
          let generated: unknown;
          try {
            generated = await callLLM<unknown>({
              systemPrompt: DRAFT_EMAIL_SYSTEM_PROMPT,
              userMessage: JSON.stringify({
                requestId: request.id,
                requestTitle: request.title,
                requestSummary: request.summary,
                rawInput: request.rawInput,
                step: { action: step.action, detail: step.detail },
              }),
              model: LLM_CONFIG.draftModel,
              maxTokens: LLM_CONFIG.draftMaxTokens,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : "LLM error";

            await prisma.executionRunStep.update({
              where: { id: runStep.id },
              data: { status: "FAILED", reason: "LLM_ERROR", message },
            });

            await prisma.outcome.upsert({
              where: { stepId: step.id },
              create: { stepId: step.id, result: "ERROR", notes: message.slice(0, 200) },
              update: { result: "ERROR", notes: message.slice(0, 200) },
            });

            await prisma.actionLog.create({
              data: {
                action: "EXECUTION_FAILED",
                requestId: request.id,
                stepId: step.id,
                delegationId: delegation.id,
                message,
              },
            });

            errorCount += 1;
            continue;
          }

          try {
            draft = DraftEmailSchema.parse(generated);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Invalid draft schema";

            await prisma.executionRunStep.update({
              where: { id: runStep.id },
              data: { status: "FAILED", reason: "SCHEMA_VALIDATION", message },
            });

            await prisma.outcome.upsert({
              where: { stepId: step.id },
              create: { stepId: step.id, result: "ERROR", notes: message.slice(0, 200) },
              update: { result: "ERROR", notes: message.slice(0, 200) },
            });

            await prisma.actionLog.create({
              data: {
                action: "EXECUTION_FAILED",
                requestId: request.id,
                stepId: step.id,
                delegationId: delegation.id,
                message,
                payloadPreview: { reason: "schema_validation" },
              },
            });

            errorCount += 1;
            continue;
          }
        }

        let accessToken = "";
        try {
          accessToken = await getGmailAccessToken(userId);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Gmail auth error";

          await prisma.executionRunStep.update({
            where: { id: runStep.id },
            data: { status: "FAILED", reason: "GMAIL_AUTH", message },
          });

          await prisma.outcome.upsert({
            where: { stepId: step.id },
            create: { stepId: step.id, result: "ERROR", notes: message.slice(0, 200) },
            update: { result: "ERROR", notes: message.slice(0, 200) },
          });

          await prisma.actionLog.create({
            data: {
              action: "EXECUTION_FAILED",
              requestId: request.id,
              stepId: step.id,
              delegationId: delegation.id,
              message,
            },
          });

          errorCount += 1;
          continue;
        }

        let created;
        try {
          created = await createDraft({
            accessToken,
            subject: draft.subject,
            body: draft.body,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Gmail API error";

          await prisma.executionRunStep.update({
            where: { id: runStep.id },
            data: { status: "FAILED", reason: "GMAIL_API", message },
          });

          await prisma.outcome.upsert({
            where: { stepId: step.id },
            create: { stepId: step.id, result: "ERROR", notes: message.slice(0, 200) },
            update: { result: "ERROR", notes: message.slice(0, 200) },
          });

          await prisma.actionLog.create({
            data: {
              action: "EXECUTION_FAILED",
              requestId: request.id,
              stepId: step.id,
              delegationId: delegation.id,
              message,
            },
          });

          errorCount += 1;
          continue;
        }

        const redacted = {
          subject: redactSensitive(draft.subject),
          body: redactSensitive(draft.body),
        };

        await prisma.outcome.upsert({
          where: { stepId: step.id },
          create: {
            stepId: step.id,
            result: "DONE",
            output: JSON.stringify({
              provider: "gmail",
              draftId: created.draftId,
              threadId: created.threadId ?? null,
              subject: redacted.subject,
              body: redacted.body,
            }),
          },
          update: {
            result: "DONE",
            output: JSON.stringify({
              provider: "gmail",
              draftId: created.draftId,
              threadId: created.threadId ?? null,
              subject: redacted.subject,
              body: redacted.body,
            }),
          },
        });

        await prisma.executionRunStep.update({
          where: { id: runStep.id },
          data: { status: "SUCCEEDED" },
        });

        await prisma.actionLog.create({
          data: {
            action: "EXECUTION_SUCCEEDED",
            requestId: request.id,
            stepId: step.id,
            delegationId: delegation.id,
            message: "Gmail draft created.",
          },
        });

        doneCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Gmail draft error";

        await prisma.executionRunStep.update({
          where: { id: runStep.id },
          data: { status: "FAILED", reason: "UNKNOWN", message },
        });

        await prisma.outcome.upsert({
          where: { stepId: step.id },
          create: { stepId: step.id, result: "ERROR", notes: message.slice(0, 200) },
          update: { result: "ERROR", notes: message.slice(0, 200) },
        });

        await prisma.actionLog.create({
          data: {
            action: "EXECUTION_FAILED",
            requestId: request.id,
            stepId: step.id,
            delegationId: delegation.id,
            message,
          },
        });

        errorCount += 1;
      }

      continue;
    }

    if (step.actionType !== "DRAFT_EMAIL") {
      await prisma.executionRunStep.create({
        data: {
          executionRunId: executionRun.id,
          stepId: step.id,
          status: "SKIPPED",
          reason: "UNKNOWN",
          message: "Unsupported action",
        },
      });

      await prisma.actionLog.create({
        data: {
          action: "EXECUTION_SKIPPED",
          requestId: request.id,
          stepId: step.id,
          delegationId: delegation.id,
          message: "unsupported_action",
        },
      });

      await prisma.outcome.upsert({
        where: { stepId: step.id },
        create: { stepId: step.id, result: "SKIPPED", notes: "Unsupported action" },
        update: { result: "SKIPPED", notes: "Unsupported action" },
      });

      skippedCount += 1;
      continue;
    }

    actionableCount += 1;

    if (!scopeAllowsDraft) {
      await prisma.executionRunStep.create({
        data: {
          executionRunId: executionRun.id,
          stepId: step.id,
          status: "SKIPPED",
          reason: "SCOPE_DENIED",
          message: "Scope denied: canDraftEmail",
        },
      });

      await prisma.actionLog.create({
        data: {
          action: "EXECUTION_SKIPPED",
          requestId: request.id,
          stepId: step.id,
          delegationId: delegation.id,
          message: "scope_denied",
        },
      });

      await prisma.outcome.upsert({
        where: { stepId: step.id },
        create: { stepId: step.id, result: "SKIPPED", notes: "Scope denied: canDraftEmail" },
        update: { result: "SKIPPED", notes: "Scope denied: canDraftEmail" },
      });

      skippedCount += 1;
      continue;
    }

    const runStep = await prisma.executionRunStep.create({
      data: {
        executionRunId: executionRun.id,
        stepId: step.id,
        status: "ATTEMPTED",
      },
    });

    await prisma.actionLog.create({
      data: {
        action: "EXECUTION_ATTEMPTED",
        requestId: request.id,
        stepId: step.id,
        delegationId: delegation.id,
        message: "Drafting email.",
      },
    });

    try {
      let generated: unknown;
      try {
        generated = await callLLM<unknown>({
          systemPrompt: DRAFT_EMAIL_SYSTEM_PROMPT,
          userMessage: JSON.stringify({
            requestId: request.id,
            requestTitle: request.title,
            requestSummary: request.summary,
            rawInput: request.rawInput,
            step: { action: step.action, detail: step.detail },
          }),
          model: LLM_CONFIG.draftModel,
          maxTokens: LLM_CONFIG.draftMaxTokens,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "LLM error";

        await prisma.executionRunStep.update({
          where: { id: runStep.id },
          data: { status: "FAILED", reason: "LLM_ERROR", message },
        });

        await prisma.outcome.upsert({
          where: { stepId: step.id },
          create: { stepId: step.id, result: "ERROR", notes: message.slice(0, 200) },
          update: { result: "ERROR", notes: message.slice(0, 200) },
        });

        await prisma.actionLog.create({
          data: {
            action: "EXECUTION_FAILED",
            requestId: request.id,
            stepId: step.id,
            delegationId: delegation.id,
            message,
          },
        });

        errorCount += 1;
        continue;
      }

      let parsed;
      try {
        parsed = DraftEmailSchema.parse(generated);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid draft schema";

        await prisma.executionRunStep.update({
          where: { id: runStep.id },
          data: { status: "FAILED", reason: "SCHEMA_VALIDATION", message },
        });

        await prisma.outcome.upsert({
          where: { stepId: step.id },
          create: { stepId: step.id, result: "ERROR", notes: message.slice(0, 200) },
          update: { result: "ERROR", notes: message.slice(0, 200) },
        });

        await prisma.actionLog.create({
          data: {
            action: "EXECUTION_FAILED",
            requestId: request.id,
            stepId: step.id,
            delegationId: delegation.id,
            message,
            payloadPreview: { reason: "schema_validation" },
          },
        });

        errorCount += 1;
        continue;
      }

      const redacted = {
        ...parsed,
        subject: redactSensitive(parsed.subject),
        body: redactSensitive(parsed.body),
      };

      const output = JSON.stringify(redacted);

      await prisma.outcome.upsert({
        where: { stepId: step.id },
        create: { stepId: step.id, result: "DONE", output },
        update: { result: "DONE", output },
      });

      await prisma.executionRunStep.update({
        where: { id: runStep.id },
        data: { status: "SUCCEEDED" },
      });

      await prisma.actionLog.create({
        data: {
          action: "EXECUTION_SUCCEEDED",
          requestId: request.id,
          stepId: step.id,
          delegationId: delegation.id,
          message: "Draft email generated.",
        },
      });

      doneCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown draft error";

      await prisma.executionRunStep.update({
        where: { id: runStep.id },
        data: { status: "FAILED", reason: "UNKNOWN", message },
      });

      await prisma.outcome.upsert({
        where: { stepId: step.id },
        create: { stepId: step.id, result: "ERROR", notes: message },
        update: { result: "ERROR", notes: message },
      });

      await prisma.actionLog.create({
        data: {
          action: "EXECUTION_FAILED",
          requestId: request.id,
          stepId: step.id,
          delegationId: delegation.id,
          message,
        },
      });

      errorCount += 1;
    }
  }

  let finalStatus: "DONE" | "ERROR" | "AUTHORIZED" = "AUTHORIZED";
  if (errorCount > 0) {
    finalStatus = "ERROR";
  } else if (mode === "ALL" && doneCount > 0 && skippedCount === 0) {
    finalStatus = "DONE";
  } else if (mode === "RETRY_FAILED") {
    finalStatus = "AUTHORIZED";
  }

  await prisma.request.updateMany({
    where: { id: request.id, userId },
    data: { status: finalStatus },
  });

  let runStatus: "SUCCEEDED" | "PARTIAL" | "FAILED" = "PARTIAL";
  if (actionableCount === 0) {
    runStatus = "PARTIAL";
  } else if (errorCount > 0 && doneCount === 0) {
    runStatus = "FAILED";
  } else if (errorCount === 0 && skippedCount === 0 && doneCount === actionableCount) {
    runStatus = "SUCCEEDED";
  }

  await prisma.executionRun.update({
    where: { id: executionRun.id },
    data: {
      status: runStatus,
      finishedAt: new Date(),
      summary: `actionable:${actionableCount} success:${doneCount} failed:${errorCount} skipped:${skippedCount}`,
      error: errorCount > 0 ? "Execution had failures" : null,
    },
  });

  const updatedRequest = await prisma.request.findFirst({
    where: { id: request.id, userId },
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
      executionRuns: { orderBy: { startedAt: "desc" }, take: 5, include: { steps: true } },
    },
  });

  return updatedRequest;
}

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth";
import RequestActions from "./Actions";
import FirstWinBanner from "./FirstWinBanner";
import DraftOutput from "./DraftOutput";
import type { InterpretedTask } from "@/lib/types";

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);

const parseInterpretation = (value: string | null) => {
  if (!value) return null;
  try {
    return JSON.parse(value) as { tasks?: InterpretedTask[] };
  } catch {
    return null;
  }
};

const parseDraftOutput = (value: string | null) => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as {
      subject?: string;
      body?: string;
      assumptions?: string[];
      needsUserInput?: string[];
      provider?: string;
      draftId?: string;
      threadId?: string;
    };
    if (parsed && typeof parsed.subject === "string" && typeof parsed.body === "string") {
      return {
        subject: parsed.subject,
        body: parsed.body,
        assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : undefined,
        needsUserInput: Array.isArray(parsed.needsUserInput) ? parsed.needsUserInput : undefined,
        provider: parsed.provider,
        draftId: parsed.draftId,
        threadId: parsed.threadId,
      };
    }
    return null;
  } catch {
    return null;
  }
};

const RETRYABLE_REASONS = new Set(["GMAIL_API", "GMAIL_AUTH", "LLM_ERROR", "UNKNOWN"]);

export default async function RequestDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const request = await prisma.request.findFirst({
    where: { id: params.id, userId: user.id },
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
      actionLogs: { orderBy: { createdAt: "desc" }, take: 50 },
      executionRuns: { orderBy: { startedAt: "desc" }, take: 5, include: { steps: true } },
    },
  });

  if (!request) return notFound();

  const interpretation = parseInterpretation(request.interpretResult);
  const firstTask = interpretation?.tasks?.[0] ?? null;
  const latestRun = request.executionRuns[0];
  const hasGmailDraftOutcome =
    request.status === "DONE" &&
    !!request.plan?.steps.some((step) => {
      const draft = parseDraftOutput(step.outcome?.output ?? null);
      return draft?.provider === "gmail";
    });
  const retryableFailed =
    latestRun?.steps?.filter(
      (step) => step.status === "FAILED" && step.reason && RETRYABLE_REASONS.has(step.reason)
    ) ?? [];
  const retryAvailable =
    !!latestRun && ["FAILED", "PARTIAL"].includes(latestRun.status) && retryableFailed.length > 0;

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 px-6 py-16">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Request Detail</h1>
          <p className="text-sm text-gray-400">{request.title ?? "Untitled"}</p>
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Status: <span className="text-gray-200">{request.status}</span>
          </div>
        </header>

        {hasGmailDraftOutcome && !user.hasSeenFirstWin && <FirstWinBanner />}

        <RequestActions
          requestId={request.id}
          status={request.status}
          planId={request.plan?.id ?? null}
          task={firstTask}
          steps={request.plan?.steps ?? []}
          retryAvailable={retryAvailable}
        />

        <section className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 space-y-3">
          <h2 className="text-lg font-semibold">Raw Input</h2>
          <p className="text-sm text-gray-200 whitespace-pre-wrap">{request.rawInput}</p>
        </section>

        <section className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 space-y-3">
          <h2 className="text-lg font-semibold">Interpretation</h2>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap">
            {request.interpretResult ?? "(none)"}
          </pre>
        </section>

        <section className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 space-y-3">
          <h2 className="text-lg font-semibold">Plan Steps</h2>
          {request.plan ? (
            <ol className="space-y-4 list-decimal list-inside">
              {request.plan.steps.map((step) => (
                <li key={step.id} className="space-y-2">
                  <div>
                    <p className="font-medium">{step.action}</p>
                    {step.detail && <p className="text-sm text-gray-400">{step.detail}</p>}
                  </div>
                  <div className="text-xs text-gray-400">Status: {step.status}</div>
                  {step.outcome && (
                    <div className="rounded-md border border-gray-800 bg-gray-950/60 p-3 text-xs text-gray-200">
                      <p>Outcome: {step.outcome.result}</p>
                      {step.outcome.notes && <p>Notes: {step.outcome.notes}</p>}
                      {step.outcome.output && (
                        (() => {
                          const draft = parseDraftOutput(step.outcome.output);
                          if (!draft) {
                            return (
                              <pre className="whitespace-pre-wrap text-xs text-gray-300">{step.outcome.output}</pre>
                            );
                          }
                          return (
                            <DraftOutput
                              subject={draft.subject}
                              body={draft.body}
                              provider={draft.provider ?? null}
                              draftId={draft.draftId ?? null}
                              threadId={draft.threadId ?? null}
                              assumptions={draft.assumptions}
                              needsUserInput={draft.needsUserInput}
                            />
                          );
                        })()
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-gray-400">No plan yet.</p>
          )}
        </section>

        <section className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 space-y-3">
          <h2 className="text-lg font-semibold">Delegations</h2>
          {request.delegations.length === 0 && <p className="text-sm text-gray-400">No delegations.</p>}
          {request.delegations.map((delegation) => (
            <div key={delegation.id} className="rounded-md border border-gray-800 bg-gray-950/60 p-3 text-xs text-gray-200">
              <p>Status: {delegation.status}</p>
              <p>Created: {formatDate(delegation.createdAt)}</p>
              <pre className="whitespace-pre-wrap">Scope: {JSON.stringify(delegation.scope, null, 2)}</pre>
              <pre className="whitespace-pre-wrap">Approved Steps: {JSON.stringify(delegation.approvedStepIds, null, 2)}</pre>
            </div>
          ))}
        </section>

        <section className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 space-y-3">
          <h2 className="text-lg font-semibold">Action Logs</h2>
          {request.actionLogs.length === 0 && <p className="text-sm text-gray-400">No logs yet.</p>}
          <div className="space-y-2">
            {request.actionLogs.map((log) => (
              <div key={log.id} className="rounded-md border border-gray-800 bg-gray-950/60 p-3 text-xs text-gray-200">
                <p>
                  {formatDate(log.createdAt)} - {log.action}
                </p>
                {log.message && <p className="text-gray-400">{log.message}</p>}
                {log.payloadPreview && (
                  <pre className="whitespace-pre-wrap text-gray-400">
                    {JSON.stringify(log.payloadPreview, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 space-y-3">
          <h2 className="text-lg font-semibold">Execution Runs</h2>
          {request.executionRuns.length === 0 && (
            <p className="text-sm text-gray-400">No execution runs yet.</p>
          )}
          <div className="space-y-2">
            {request.executionRuns.map((run) => (
              <div key={run.id} className="rounded-md border border-gray-800 bg-gray-950/60 p-3 text-xs text-gray-200">
                <p>Status: {run.status}</p>
                <p>Started: {formatDate(run.startedAt)}</p>
                {run.finishedAt && <p>Finished: {formatDate(run.finishedAt)}</p>}
                {run.summary && <p className="text-gray-400">Summary: {run.summary}</p>}
                {run.error && <p className="text-red-300">Error: {run.error}</p>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

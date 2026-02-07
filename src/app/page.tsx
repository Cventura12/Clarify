"use client";

import { useMemo, useState } from "react";
import type { InterpretResponse, PlanResponse } from "@/lib/types";

interface InterpretResult {
  requestId: string;
  interpretation: InterpretResponse;
}

interface PlanResult {
  planId: string;
  plan: PlanResponse;
}

interface ExecutionStep {
  sequence: number;
  outcome?: { output?: string | null; result?: string | null } | null;
}

interface ExecutionRequest {
  status?: RequestStatus;
  plan?: { steps: ExecutionStep[] } | null;
}

type Phase = "idle" | "interpreting" | "planning" | "done" | "error";

type RequestStatus =
  | "IDLE"
  | "INTERPRETING"
  | "INTERPRETED"
  | "PLANNING"
  | "PLANNED"
  | "AWAITING_AUTHORITY"
  | "AUTHORIZED"
  | "DONE"
  | "ERROR";

const domainBadgeClass = "bg-blue-900 text-blue-300 px-2 py-0.5 rounded text-xs";
const complexityBadgeClass = "bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-xs";
const effortBadgeClass = "bg-gray-700 text-gray-300 px-2 py-0.5 rounded text-xs";

const urgencyBadgeClass = (urgency: string) => {
  switch (urgency) {
    case "critical":
      return "bg-red-900 text-red-300 px-2 py-0.5 rounded text-xs";
    case "high":
      return "bg-orange-900 text-orange-300 px-2 py-0.5 rounded text-xs";
    case "medium":
      return "bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded text-xs";
    case "low":
      return "bg-gray-700 text-gray-300 px-2 py-0.5 rounded text-xs";
    default:
      return "bg-gray-700 text-gray-300 px-2 py-0.5 rounded text-xs";
  }
};

const delegationBadgeClass = (delegation: string) => {
  switch (delegation) {
    case "can_draft":
    case "can_remind":
    case "can_track":
      return "bg-green-900 text-green-300 px-2 py-0.5 rounded text-xs";
    case "user_only":
    default:
      return "bg-gray-700 text-gray-400 px-2 py-0.5 rounded text-xs";
  }
};

const parseDraftOutput = (output?: string | null) => {
  if (!output) return null;
  try {
    const parsed = JSON.parse(output);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.subject === "string" &&
      typeof parsed.body === "string"
    ) {
      return parsed as { subject: string; body: string };
    }
    return null;
  } catch {
    return null;
  }
};

export default function Home() {
  const [rawInput, setRawInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interpretation, setInterpretation] = useState<InterpretResult | null>(null);
  const [plans, setPlans] = useState<PlanResult[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [requestStatus, setRequestStatus] = useState<RequestStatus>("IDLE");
  const [executionRequest, setExecutionRequest] = useState<ExecutionRequest | null>(null);

  const tasks = interpretation?.interpretation?.tasks ?? [];

  const canHandleCount = useMemo(() => {
    return plans.reduce((total, item) => {
      const summary = item.plan.delegation_summary;
      return total + summary.can_draft + summary.can_remind + summary.can_track;
    }, 0);
  }, [plans]);

  const totalStepCount = useMemo(() => {
    return plans.reduce((total, item) => total + item.plan.total_steps, 0);
  }, [plans]);

  const outcomeBySequence = useMemo(() => {
    const map = new Map<number, ExecutionStep["outcome"]>();
    executionRequest?.plan?.steps?.forEach((step) => {
      map.set(step.sequence, step.outcome ?? null);
    });
    return map;
  }, [executionRequest]);

  const handleInterpret = async () => {
    if (!rawInput.trim()) {
      setError("Please enter a request before interpreting.");
      setPhase("error");
      setRequestStatus("ERROR");
      return;
    }

    setLoading(true);
    setError(null);
    setInterpretation(null);
    setPlans([]);
    setExecutionRequest(null);
    setPhase("interpreting");
    setRequestStatus("INTERPRETING");

    try {
      const interpretRes = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput: rawInput.trim() }),
      });

      const interpretJson = await interpretRes.json();

      if (!interpretRes.ok) {
        throw new Error(interpretJson?.error || "Interpretation failed");
      }

      const interpretResult = interpretJson as InterpretResult;
      setInterpretation(interpretResult);
      setPhase("planning");
      setRequestStatus("INTERPRETED");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setPhase("error");
      setRequestStatus("ERROR");
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePlan = async () => {
    if (!interpretation || tasks.length === 0) {
      setError("No tasks available to plan.");
      setPhase("error");
      setRequestStatus("ERROR");
      return;
    }

    setLoading(true);
    setError(null);
    setPhase("planning");
    setRequestStatus("PLANNING");

    try {
      const task = tasks[0];
      const planRes = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: interpretation.requestId, task }),
      });

      const planJson = await planRes.json();

      if (!planRes.ok) {
        throw new Error(planJson?.error || "Plan generation failed");
      }

      setPlans([planJson as PlanResult]);
      setExecutionRequest(null);
      setPhase("done");
      setRequestStatus("AWAITING_AUTHORITY");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setPhase("error");
      setRequestStatus("ERROR");
    } finally {
      setLoading(false);
    }
  };

  const handleAuthorize = async () => {
    if (!interpretation || plans.length === 0) {
      setError("No plan available to authorize.");
      setPhase("error");
      setRequestStatus("ERROR");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const planId = plans[0]?.planId;
      const authorizeRes = await fetch("/api/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: interpretation.requestId, planId }),
      });

      const authorizeJson = await authorizeRes.json();

      if (!authorizeRes.ok) {
        throw new Error(authorizeJson?.error || "Authorization failed");
      }

      const nextStatus = authorizeJson?.request?.status as RequestStatus | undefined;
      setExecutionRequest(authorizeJson?.request ?? null);
      setRequestStatus(nextStatus ?? "AUTHORIZED");
      setPhase("done");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setPhase("error");
      setRequestStatus("ERROR");
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!interpretation || plans.length === 0) {
      setError("No plan available to execute.");
      setPhase("error");
      setRequestStatus("ERROR");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const executeRes = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: interpretation.requestId }),
      });

      const executeJson = await executeRes.json();

      if (!executeRes.ok) {
        throw new Error(executeJson?.error || "Execution failed");
      }

      const nextStatus = executeJson?.request?.status as RequestStatus | undefined;
      setExecutionRequest(executeJson?.request ?? null);
      setRequestStatus(nextStatus ?? "AUTHORIZED");
      setPhase("done");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      setPhase("error");
      setRequestStatus("ERROR");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setError(null);
    setInterpretation(null);
    setPlans([]);
    setExecutionRequest(null);
    setPhase("idle");
    setLoading(false);
    setRequestStatus("IDLE");
  };

  const showGeneratePlan =
    interpretation &&
    plans.length === 0 &&
    !loading &&
    (requestStatus === "INTERPRETED" || requestStatus === "PLANNING");

  const showAuthorize =
    plans.length > 0 &&
    !loading &&
    (requestStatus === "AWAITING_AUTHORITY" || requestStatus === "PLANNED");

  const showExecute = plans.length > 0 && !loading && requestStatus === "AUTHORIZED";

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 px-6 py-16">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight">Clarify</h1>
          <p className="text-gray-400">Tell me what you need to deal with.</p>
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Status: <span className="text-gray-200">{requestStatus}</span>
          </div>
        </header>

        <div className="space-y-3">
          <textarea
            className="min-h-[180px] w-full resize-none rounded-lg border border-gray-800 bg-gray-900/70 p-4 text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-700"
            placeholder="Describe the situation, include any deadlines or portal names..."
            value={rawInput}
            onChange={(event) => setRawInput(event.target.value)}
          />
          <div className="flex flex-wrap gap-3">
            <button
              className={`rounded-lg bg-gray-100 px-5 py-2 text-sm font-semibold text-gray-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70 ${
                phase === "interpreting" ? "animate-pulse" : ""
              }`}
              disabled={loading}
              onClick={handleInterpret}
            >
              {phase === "interpreting" ? "Interpreting..." : "Interpret"}
            </button>
            {showGeneratePlan && (
              <button
                className="rounded-lg border border-gray-700 px-5 py-2 text-sm font-semibold text-gray-100 hover:border-gray-500"
                onClick={handleGeneratePlan}
              >
                Generate plan
              </button>
            )}
            {showAuthorize && (
              <button
                className="rounded-lg border border-green-700 px-5 py-2 text-sm font-semibold text-green-200 hover:border-green-500"
                onClick={handleAuthorize}
              >
                Approve plan
              </button>
            )}
            {showExecute && (
              <button
                className="rounded-lg border border-blue-700 px-5 py-2 text-sm font-semibold text-blue-200 hover:border-blue-500"
                onClick={handleExecute}
              >
                Execute (drafts only)
              </button>
            )}
          </div>
        </div>

        {phase === "error" && (
          <div className="space-y-3 rounded-lg border border-red-900/70 bg-red-950/40 p-4 text-sm text-red-200">
            <p>{error}</p>
            <button
              className="rounded-lg bg-red-200 px-4 py-2 text-xs font-semibold text-red-900 hover:bg-red-100"
              onClick={reset}
            >
              Try Again
            </button>
          </div>
        )}

        {(phase === "planning" || phase === "done") && interpretation && (
          <section className="space-y-6">
            <div className="space-y-4 rounded-lg border border-gray-800 bg-gray-900/40 p-4">
              <h2 className="text-lg font-semibold">Interpretation</h2>
              {tasks.length === 0 && (
                <p className="text-sm text-gray-400">No tasks were detected.</p>
              )}
              {tasks.map((task) => (
                <div
                  key={task.task_id}
                  className="space-y-3 rounded-lg border border-gray-800 bg-gray-950/40 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold">{task.title}</h3>
                    <span className={domainBadgeClass}>{task.domain}</span>
                    <span className={urgencyBadgeClass(task.urgency)}>{task.urgency}</span>
                    <span className={complexityBadgeClass}>{task.complexity}</span>
                  </div>
                  <p className="text-sm text-gray-300">{task.summary}</p>

                  {task.ambiguities?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-wide text-yellow-300">Ambiguities</p>
                      <ul className="space-y-2">
                        {task.ambiguities.map((item, index) => (
                          <li
                            key={`${task.task_id}-amb-${index}`}
                            className="rounded-md border border-yellow-800 bg-yellow-900/40 p-3 text-sm text-yellow-100"
                          >
                            {item.question}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {task.hidden_dependencies?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-wide text-green-300">Hidden Dependencies</p>
                      <ul className="space-y-2">
                        {task.hidden_dependencies.map((item, index) => (
                          <li
                            key={`${task.task_id}-dep-${index}`}
                            className="rounded-md border border-green-800 bg-green-900/30 p-3 text-sm text-green-100"
                          >
                            {item.insight}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {phase === "planning" && loading && (
              <p className="text-sm text-gray-400">Generating plans...</p>
            )}
          </section>
        )}

        {phase === "done" && plans.length > 0 && (
          <section className="space-y-6">
            {plans.map((planResult) => {
              const plan = planResult.plan;
              const handleCount =
                plan.delegation_summary.can_draft +
                plan.delegation_summary.can_remind +
                plan.delegation_summary.can_track;

              return (
                <div
                  key={planResult.planId}
                  className="space-y-4 rounded-lg border border-gray-800 bg-gray-900/40 p-5"
                >
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-gray-400">Next Action</p>
                    <div className="rounded-md border border-gray-700 bg-gray-950/60 p-3 text-sm text-gray-100">
                      <span className="font-semibold">Do this first:</span> {plan.next_action.action} -
                      <span className="text-gray-300"> {plan.next_action.why_first}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold">{plan.title}</h3>
                    <p className="text-sm text-gray-400">Estimated effort: {plan.estimated_total_effort}</p>
                  </div>

                  <ol className="space-y-4 list-decimal list-inside">
                    {plan.steps.map((step) => {
                      const outcome = outcomeBySequence.get(step.step_number) ?? null;
                      const draftOutput = parseDraftOutput(outcome?.output ?? null);

                      return (
                        <li key={`${plan.plan_id}-${step.step_number}`} className="space-y-2">
                          <div className="space-y-1">
                            <p className="font-semibold">{step.action}</p>
                            <p className="text-sm text-gray-300">{step.detail}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className={effortBadgeClass}>{step.effort}</span>
                            <span className={delegationBadgeClass(step.delegation)}>{step.delegation}</span>
                          </div>
                          {outcome?.output && (
                            <div className="rounded-md border border-gray-800 bg-gray-950/60 p-3 text-sm text-gray-200">
                              <p className="text-xs uppercase tracking-wide text-gray-400">Draft Output</p>
                              {draftOutput ? (
                                <div className="space-y-2">
                                  <p className="text-sm">
                                    <span className="font-semibold">Subject:</span> {draftOutput.subject}
                                  </p>
                                  <pre className="whitespace-pre-wrap text-sm text-gray-300">
                                    {draftOutput.body}
                                  </pre>
                                </div>
                              ) : (
                                <pre className="whitespace-pre-wrap text-sm text-gray-300">
                                  {outcome.output}
                                </pre>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>

                  {plan.risk_flags?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-wide text-red-300">Risk Flags</p>
                      <ul className="space-y-2">
                        {plan.risk_flags.map((risk, index) => (
                          <li
                            key={`${plan.plan_id}-risk-${index}`}
                            className="rounded-md border border-red-800 bg-red-900/40 p-3 text-sm text-red-100"
                          >
                            {risk.risk}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="rounded-md border border-gray-800 bg-gray-950/60 p-3 text-sm text-gray-300">
                    Clarify can handle {handleCount} of {plan.total_steps} steps with your permission.
                  </div>
                </div>
              );
            })}

            <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 text-sm text-gray-400">
              Clarify can handle {canHandleCount} of {totalStepCount} steps with your permission.
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

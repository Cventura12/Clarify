"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { InterpretedTask } from "@/lib/types";

interface StepInfo {
  id: string;
  action: string;
  detail?: string | null;
  actionType?: string | null;
}

interface ActionsProps {
  requestId: string;
  status: string;
  planId?: string | null;
  task?: InterpretedTask | null;
  steps?: StepInfo[];
  retryAvailable?: boolean;
}

export default function RequestActions({
  requestId,
  status,
  planId,
  task,
  steps = [],
  retryAvailable = false,
}: ActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canDraftEmail, setCanDraftEmail] = useState(true);
  const [canCreateGmailDraft, setCanCreateGmailDraft] = useState(false);
  const [approvedStepIds, setApprovedStepIds] = useState<string[]>([]);

  const stepIds = useMemo(() => steps.map((step) => step.id), [steps]);

  const stepIdsKey = useMemo(() => stepIds.join("|"), [stepIds]);
  const stepIdsFromKey = useMemo(
    () => (stepIdsKey ? stepIdsKey.split("|") : []),
    [stepIdsKey]
  );

  useEffect(() => {
    if (stepIdsFromKey.length > 0) {
      setApprovedStepIds(stepIdsFromKey);
    }
  }, [stepIdsFromKey]);

  const canGeneratePlan = !planId && !!task && (status === "INTERPRETED" || status === "PLANNING");
  const canAuthorize = !!planId && (status === "AWAITING_AUTHORITY" || status === "PLANNED");
  const canExecute = !!planId && status === "AUTHORIZED";

  const toggleStep = (id: string) => {
    setApprovedStepIds((prev) =>
      prev.includes(id) ? prev.filter((stepId) => stepId !== id) : [...prev, id]
    );
  };

  const callApi = async (url: string, body: Record<string, unknown>) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Request failed");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-gray-800 bg-gray-900/40 p-4">
      <h3 className="text-sm font-semibold text-gray-200">Actions</h3>
      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-100 hover:border-gray-500 disabled:opacity-50"
          onClick={() => task && callApi("/api/plan", { requestId, task })}
          disabled={!canGeneratePlan || loading}
        >
          Generate plan
        </button>
        <button
          className="rounded-lg border border-blue-700 px-4 py-2 text-sm text-blue-200 hover:border-blue-500 disabled:opacity-50"
          onClick={() => callApi("/api/execute", { requestId })}
          disabled={!canExecute || loading}
        >
          Execute (drafts only)
        </button>
        {retryAvailable && (
          <button
            className="rounded-lg border border-purple-700 px-4 py-2 text-sm text-purple-200 hover:border-purple-500 disabled:opacity-50"
            onClick={() => callApi("/api/execute", { requestId, mode: "RETRY_FAILED" })}
            disabled={loading}
          >
            Retry failed steps
          </button>
        )}
      </div>

      {canAuthorize && (
        <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-950/40 p-3">
          <p className="text-xs text-gray-400">
            Approvals are drafts only. Nothing is sent automatically.
          </p>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Delegation Scope</p>
            <label className="flex items-center gap-2 text-sm text-gray-200">
              <input
                type="checkbox"
                checked={canDraftEmail}
                onChange={(event) => setCanDraftEmail(event.target.checked)}
              />
              Allow draft email
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-200">
              <input
                type="checkbox"
                checked={canCreateGmailDraft}
                onChange={(event) => setCanCreateGmailDraft(event.target.checked)}
              />
              Allow create Gmail draft
            </label>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Approved Steps</p>
            <div className="space-y-2">
              {steps.map((step) => (
                <label key={step.id} className="flex items-start gap-2 text-sm text-gray-200">
                  <input
                    type="checkbox"
                    checked={approvedStepIds.includes(step.id)}
                    onChange={() => toggleStep(step.id)}
                  />
                  <span>
                    {step.action}
                    {step.actionType ? ` (${step.actionType})` : ""}
                    {step.detail ? ` - ${step.detail}` : ""}
                  </span>
                </label>
              ))}
              {steps.length === 0 && <p className="text-sm text-gray-400">No steps yet.</p>}
            </div>
          </div>

          <button
            className="rounded-lg border border-green-700 px-4 py-2 text-sm text-green-200 hover:border-green-500 disabled:opacity-50"
            onClick={() =>
              callApi("/api/authorize", {
                requestId,
                planId,
                scope: { canDraftEmail, canCreateGmailDraft },
                approvedStepIds,
              })
            }
            disabled={loading}
          >
            Approve selection
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-lg border border-gray-700 px-4 py-2 text-xs text-gray-300 hover:border-gray-500 disabled:opacity-50"
          onClick={() => callApi("/api/requests/status", { requestId, status: "DONE", message: "Marked done" })}
          disabled={loading}
        >
          Mark Done
        </button>
        <button
          className="rounded-lg border border-yellow-700 px-4 py-2 text-xs text-yellow-200 hover:border-yellow-500 disabled:opacity-50"
          onClick={() => callApi("/api/requests/status", { requestId, status: "BLOCKED", message: "Marked blocked" })}
          disabled={loading}
        >
          Mark Blocked
        </button>
        <button
          className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-200 hover:border-slate-500 disabled:opacity-50"
          onClick={() => callApi("/api/requests/status", { requestId, status: "DEFERRED", message: "Marked deferred" })}
          disabled={loading}
        >
          Mark Deferred
        </button>
      </div>
    </div>
  );
}

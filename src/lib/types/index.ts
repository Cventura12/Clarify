export interface InterpretResponse {
  raw_input: string;
  request_count: number;
  tasks: InterpretedTask[];
  cross_task_dependencies: CrossTaskDependency[];
}

export interface InterpretedTask {
  task_id: string;
  title: string;
  summary: string;
  domain: "follow_up" | "portal" | "job_application" | "scholarship" | "academic" | "financial" | "medical" | "legal" | "housing" | "other";
  urgency: "critical" | "high" | "medium" | "low";
  complexity: "simple" | "moderate" | "complex";
  entities: { name: string; type: "organization" | "person" | "portal" | "platform" | "document" }[];
  dates: { description: string; date: string | null; source: "stated" | "inferred" | "unknown" }[];
  status: { what_is_done: string; what_is_pending: string; blockers: string[] };
  ambiguities: { question: string; why_it_matters: string; default_assumption: string | null }[];
  hidden_dependencies: { insight: string; risk_if_ignored: string }[];
}

export interface CrossTaskDependency {
  from_task: string;
  to_task: string;
  relationship: "blocks" | "informs" | "shares_deadline";
}

export interface PlanResponse {
  task_id: string;
  title: string;
  plan_id: string;
  total_steps: number;
  estimated_total_effort: string;
  deadline: string | null;
  steps: PlanStep[];
  risk_flags: { risk: string; severity: "low" | "medium" | "high" | "critical"; mitigation: string }[];
  next_action: { step_number: number; action: string; why_first: string };
  delegation_summary: { can_draft: number; can_remind: number; can_track: number; user_only: number };
}

export interface PlanStep {
  step_number: number;
  action: string;
  detail: string;
  dependencies: { type: "step" | "credential" | "document" | "external_party" | "information"; description: string; step_ref: number | null }[];
  effort: "quick" | "short" | "medium" | "long";
  delegation: "can_draft" | "can_remind" | "can_track" | "user_only";
  suggested_date: string | null;
  status: "pending" | "ready" | "blocked" | "done";
}
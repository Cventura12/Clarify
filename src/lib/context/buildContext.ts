import { prisma } from "@/lib/db/client";

const MAX_STRING_LENGTH = 500;
const MAX_JSON_LENGTH = 12000;

const truncateString = (value: string) => {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return value.slice(0, MAX_STRING_LENGTH) + "...";
};

const truncateStrings = (value: unknown): unknown => {
  if (typeof value === "string") return truncateString(value);
  if (Array.isArray(value)) return value.map((item) => truncateStrings(item));
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const result: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      result[key] = truncateStrings(val);
    }
    return result;
  }
  return value;
};

const buildPatterns = (items: Array<{ title?: string | null; summary?: string | null; plan?: { steps: Array<{ outcome?: { result?: string | null; notes?: string | null } | null }> } | null }>) => {
  const blockers: string[] = [];
  const notesPool: string[] = [];

  for (const item of items) {
    const steps = item.plan?.steps ?? [];
    for (const step of steps) {
      const result = step.outcome?.result ?? "";
      if (result && result !== "DONE") {
        const note = step.outcome?.notes ?? "";
        if (note) notesPool.push(note);
      }
    }
  }

  for (const note of notesPool) {
    const trimmed = truncateString(note);
    if (!blockers.includes(trimmed)) blockers.push(trimmed);
    if (blockers.length >= 5) break;
  }

  const wordCounts = new Map<string, number>();
  const stopwords = new Set(["the", "and", "with", "from", "that", "this", "your", "for", "have", "will"]);

  for (const item of items) {
    const text = `${item.title ?? ""} ${item.summary ?? ""}`.toLowerCase();
    const words = text.split(/[^a-z0-9]+/g).filter((word) => word.length > 4 && !stopwords.has(word));
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    }
  }

  const recurringTopics = Array.from(wordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  return { commonBlockers: blockers, recurringTopics };
};

const ensureLength = (context: { priorRequests: unknown[]; patterns: { commonBlockers: string[]; recurringTopics: string[] } }) => {
  let candidate = context;
  let json = JSON.stringify(candidate);

  while (json.length > MAX_JSON_LENGTH && candidate.priorRequests.length > 0) {
    candidate = {
      ...candidate,
      priorRequests: candidate.priorRequests.slice(0, -1),
    };
    json = JSON.stringify(candidate);
  }

  if (json.length > MAX_JSON_LENGTH) {
    candidate = { ...candidate, patterns: { commonBlockers: [], recurringTopics: [] } };
    json = JSON.stringify(candidate);
  }

  while (json.length > MAX_JSON_LENGTH && candidate.priorRequests.length > 0) {
    candidate = {
      ...candidate,
      priorRequests: candidate.priorRequests.slice(0, -1),
    };
    json = JSON.stringify(candidate);
  }

  return candidate;
};

export async function buildContext(params: {
  rawInput: string;
  domain?: string;
  currentRequestId?: string;
  userId: string;
}) {
  const requests = await prisma.request.findMany({
    where: {
      userId: params.userId,
      id: params.currentRequestId ? { not: params.currentRequestId } : undefined,
      domain: params.domain ?? undefined,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
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

  const trimmed = requests
    .map((request) => ({
      id: request.id,
      createdAt: request.createdAt,
      title: request.title,
      summary: request.summary,
      status: request.status,
      plan: request.plan
        ? {
            steps: request.plan.steps.map((step) => ({
              id: step.id,
              sequence: step.sequence,
              action: step.action,
              detail: step.detail,
              status: step.status,
              outcome: step.outcome
                ? {
                    result: step.outcome.result,
                    notes: step.outcome.notes,
                  }
                : null,
            })),
          }
        : null,
    }))
    .sort((a, b) => {
      const aDone = a.status === "DONE";
      const bDone = b.status === "DONE";
      if (aDone !== bDone) return aDone ? 1 : -1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .slice(0, 10);

  const patterns = buildPatterns(trimmed);

  const context = truncateStrings({ priorRequests: trimmed, patterns }) as {
    priorRequests: unknown[];
    patterns: { commonBlockers: string[]; recurringTopics: string[] };
  };

  return ensureLength(context);
}

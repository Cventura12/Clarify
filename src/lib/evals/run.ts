import fs from "fs";
import path from "path";
import { cases } from "@/lib/evals/cases";
import { interpretRequest } from "@/lib/services/interpret";
import { generatePlan } from "@/lib/services/plan";
import { prisma } from "@/lib/db/client";

interface CaseResult {
  id: string;
  score: number;
  deductions: string[];
  domain?: string | null;
  steps?: number;
}

const containsAny = (haystack: string, needles: string[]) =>
  needles.some((needle) => haystack.includes(needle.toLowerCase()));

const ensureEvalUser = async () => {
  return prisma.user.upsert({
    where: { email: "eval@local" },
    update: {},
    create: { email: "eval@local", name: "Eval User" },
  });
};

const runCase = async (testCase: (typeof cases)[number], userId: string): Promise<CaseResult> => {
  const deductions: string[] = [];

  try {
    const { requestId, interpretation } = await interpretRequest(testCase.rawInput, userId);

    if (!interpretation || !Array.isArray(interpretation.tasks) || interpretation.tasks.length === 0) {
      return { id: testCase.id, score: 0, deductions: ["interpretation_missing_tasks"] };
    }

    const request = await prisma.request.findUnique({
      where: { id: requestId },
      select: { domain: true },
    });

    const domain = request?.domain ?? null;
    if (testCase.expected.domains && domain) {
      const allowed = testCase.expected.domains.map((item) => item.toUpperCase());
      if (!allowed.includes(domain.toUpperCase())) {
        deductions.push("domain_mismatch");
      }
    }

    const planResult = await generatePlan(requestId, interpretation.tasks[0], userId);

    const steps = planResult.plan.steps?.length ?? 0;
    if (testCase.expected.minSteps && steps < testCase.expected.minSteps) {
      deductions.push("insufficient_steps");
    }

    const combinedText = JSON.stringify({ interpretation, plan: planResult.plan }).toLowerCase();

    if (testCase.expected.mustMention) {
      for (const phrase of testCase.expected.mustMention) {
        if (!combinedText.includes(phrase.toLowerCase())) {
          deductions.push(`missing_phrase:${phrase}`);
        }
      }
    }

    if (testCase.expected.mustNotMention) {
      for (const phrase of testCase.expected.mustNotMention) {
        if (combinedText.includes(phrase.toLowerCase())) {
          deductions.push(`forbidden_phrase:${phrase}`);
        }
      }
    }

    if (!containsAny(combinedText, ["missing", "required"])) {
      deductions.push("missing_required_signal");
    }

    let score = 100;
    for (const deduction of deductions) {
      if (deduction.startsWith("missing_phrase")) score -= 8;
      else if (deduction.startsWith("forbidden_phrase")) score -= 12;
      else score -= 15;
    }
    if (score < 0) score = 0;

    return { id: testCase.id, score, deductions, domain, steps };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return { id: testCase.id, score: 0, deductions: ["exception", message] };
  }
};

const run = async () => {
  const results: CaseResult[] = [];
  const user = await ensureEvalUser();

  for (const testCase of cases) {
    const result = await runCase(testCase, user.id);
    results.push(result);
  }

  const avgScore = results.reduce((sum, item) => sum + item.score, 0) / results.length;
  const failed = results.filter((item) => item.score < 70).length;

  const report = {
    summary: {
      total: results.length,
      averageScore: Number(avgScore.toFixed(2)),
      failed,
    },
    results,
  };

  const outputPath = path.resolve(process.cwd(), "eval-results.json");
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log(`Wrote ${results.length} results to ${outputPath}`);
};

run().catch((error) => {
  console.error("Eval run failed", error);
  process.exitCode = 1;
});

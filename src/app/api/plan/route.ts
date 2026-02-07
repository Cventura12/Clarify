import { NextResponse } from "next/server";
import { generatePlan } from "@/lib/services/plan";
import { getCurrentUser } from "@/lib/auth";

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const requestId = body?.requestId;
    const task = body?.task;

    if (typeof requestId !== "string" || requestId.trim().length === 0) {
      throw new ValidationError("requestId must be a string");
    }
    if (!task || typeof task !== "object") {
      throw new ValidationError("task must be an object");
    }
    if (!task.task_id || !task.title || !task.domain) {
      throw new ValidationError("task must include task_id, title, and domain");
    }

    const result = await generatePlan(requestId.trim(), task, user.id);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const status = error instanceof ValidationError ? 400 : 500;
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status });
  }
}

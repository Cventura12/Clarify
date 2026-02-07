import { NextResponse } from "next/server";
import { interpretRequest } from "@/lib/services/interpret";
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
    const rawInput = body?.rawInput;

    if (typeof rawInput !== "string" || rawInput.trim().length === 0) {
      throw new ValidationError("rawInput must be a non-empty string");
    }
    if (rawInput.length > 10000) {
      throw new ValidationError("rawInput must be under 10000 characters");
    }

    const result = await interpretRequest(rawInput.trim(), user.id);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const status = error instanceof ValidationError ? 400 : 500;
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status });
  }
}

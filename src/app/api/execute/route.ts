import { NextResponse } from "next/server";
import { z } from "zod";
import { executeAuthorizedRequest } from "@/lib/execute";
import { getCurrentUser } from "@/lib/auth";

const executeSchema = z.object({
  requestId: z.string().min(1),
  mode: z.enum(["ALL", "RETRY_FAILED"]).optional(),
});

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = executeSchema.parse(await req.json());
    const request = await executeAuthorizedRequest(body.requestId, user.id, body.mode ?? "ALL");
    return NextResponse.json({ request }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

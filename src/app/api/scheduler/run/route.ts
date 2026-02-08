import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { sendDueDigestEmail } from "@/lib/notifications/resend";

const getTokenFromRequest = (req: Request) => {
  const headerToken = req.headers.get("x-cron-token");
  if (headerToken) return headerToken;
  const url = new URL(req.url);
  return url.searchParams.get("token");
};

const getDateBucket = (date: Date) => date.toISOString().slice(0, 10);

const MAX_ITEMS_IN_EMAIL = 10;

const formatEmailBody = (items: Array<{ title: string }>, total: number, link: string) => {
  const listed = items.slice(0, MAX_ITEMS_IN_EMAIL).map((item) => `- ${item.title}`);
  if (total > MAX_ITEMS_IN_EMAIL) {
    listed.push(`- +${total - MAX_ITEMS_IN_EMAIL} more`);
  }
  return `You have ${total} due items.\n\n${listed.join("\n")}\n\nView them here: ${link}`;
};

const formatEmailHtml = (items: Array<{ title: string }>, total: number, link: string) => {
  const listed = items
    .slice(0, MAX_ITEMS_IN_EMAIL)
    .map((item) => `<li>${item.title}</li>`)
    .join("");
  const more =
    total > MAX_ITEMS_IN_EMAIL
      ? `<li>+${total - MAX_ITEMS_IN_EMAIL} more</li>`
      : "";

  return `
    <p>You have ${total} due items.</p>
    <ul>${listed}${more}</ul>
    <p><a href="${link}">View due items</a></p>
  `;
};

async function handleScheduler(req: Request) {
  const cronToken = process.env.CRON_TOKEN;
  const token = getTokenFromRequest(req);

  if (!cronToken) {
    return NextResponse.json({ error: "CRON_TOKEN not configured" }, { status: 500 });
  }
  if (!token || token !== cronToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const dueSteps = await prisma.step.findMany({
    where: {
      nextCheckAt: { lte: now },
      OR: [
        { outcome: null },
        { outcome: { result: { in: ["PENDING", "BLOCKED", "DEFERRED"] } } },
      ],
    },
    select: {
      id: true,
      plan: {
        select: {
          requestId: true,
          request: { select: { userId: true, title: true } },
        },
      },
    },
  });

  await prisma.$transaction(async (tx) => {
    for (const step of dueSteps) {
      await tx.step.update({
        where: { id: step.id },
        data: { lastCheckedAt: now },
      });

      await tx.actionLog.create({
        data: {
          action: "SYSTEM",
          requestId: step.plan.requestId,
          stepId: step.id,
          message: "reminder_due",
          payloadPreview: {
            stepId: step.id,
            requestId: step.plan.requestId,
          },
        },
      });
    }
  });

  const stepsByUser = new Map<string, Array<{ requestId: string; title: string }>>();

  for (const step of dueSteps) {
    const userId = step.plan.request.userId;
    if (!userId) continue;
    const title = step.plan.request.title ?? "Untitled request";
    const entry = { requestId: step.plan.requestId, title };
    const existing = stepsByUser.get(userId) ?? [];
    existing.push(entry);
    stepsByUser.set(userId, existing);
  }

  const dateBucket = getDateBucket(now);
  const baseUrl = process.env.APP_BASE_URL;
  const fromEmail = process.env.FROM_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;
  const dueLink = baseUrl ? `${baseUrl}/requests?filter=due` : "";

  let sent = 0;
  let skipped = 0;

  if (!baseUrl || !fromEmail || !resendKey) {
    return NextResponse.json(
      {
        checked: dueSteps.length,
        sent,
        skipped: stepsByUser.size,
        error: "Missing email configuration",
      },
      { status: 200 }
    );
  }

  const sendTasks: Array<Promise<void>> = [];

  stepsByUser.forEach((items, userId) => {
    sendTasks.push((async () => {
    const distinct = new Map<string, string>();
    for (const item of items) {
      if (!distinct.has(item.requestId)) distinct.set(item.requestId, item.title);
    }
    const deduped = Array.from(distinct.entries()).map(([requestId, title]) => ({
      requestId,
      title,
    }));

    if (deduped.length === 0) return;

    const existing = await prisma.notificationLog.findUnique({
      where: {
        userId_type_dateBucket: {
          userId,
          type: "DUE_DIGEST",
          dateBucket,
        },
      },
    });

    if (existing) {
      skipped += 1;
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user?.email) {
      skipped += 1;
      return;
    }

    const subject = `Clarify: ${deduped.length} items due`;
    const text = formatEmailBody(deduped, deduped.length, dueLink);
    const html = formatEmailHtml(deduped, deduped.length, dueLink);

    await sendDueDigestEmail({
      to: user.email,
      from: fromEmail,
      subject,
      text,
      html,
    });

    await prisma.notificationLog.create({
      data: {
        userId,
        type: "DUE_DIGEST",
        dateBucket,
        payloadPreview: {
          count: deduped.length,
          requestIds: deduped.map((item) => item.requestId),
          link: dueLink,
        },
      },
    });

    sent += 1;
    })());
  });

  await Promise.all(sendTasks);

  return NextResponse.json(
    {
      checked: dueSteps.length,
      sent,
      skipped,
    },
    { status: 200 }
  );
}

export async function GET(req: Request) {
  return handleScheduler(req);
}

export async function POST(req: Request) {
  return handleScheduler(req);
}

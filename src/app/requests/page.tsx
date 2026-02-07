import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth";
import CaptureForm from "./CaptureForm";
import RequestsToolbar from "./RequestsToolbar";

const formatDate = (date: Date) => new Intl.DateTimeFormat("en-US").format(date);

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const dueOnly = searchParams.filter === "due";
  const now = new Date();

  const requests = await prisma.request.findMany({
    where: dueOnly
      ? {
          userId: user.id,
          plan: {
            steps: {
              some: {
                nextCheckAt: { lte: now },
                OR: [
                  { outcome: null },
                  { outcome: { result: { in: ["PENDING", "BLOCKED", "DEFERRED"] } } },
                ],
              },
            },
          },
        }
      : { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      plan: {
        include: {
          steps: {
            include: { outcome: true },
          },
        },
      },
      delegations: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 px-6 py-16">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Requests</h1>
          <p className="text-sm text-gray-400">Capture, interpret, plan, authorize, execute.</p>
        </header>

        <CaptureForm />
        <RequestsToolbar />

        <div className="rounded-lg border border-gray-800 bg-gray-900/40">
          <div className="grid grid-cols-12 gap-3 border-b border-gray-800 px-4 py-3 text-xs uppercase tracking-wide text-gray-400">
            <div className="col-span-2">Created</div>
            <div className="col-span-4">Title / Summary</div>
            <div className="col-span-2">Domain</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Plan / Auth / Outcomes</div>
          </div>
          <div className="divide-y divide-gray-800">
            {requests.map((request) => {
              const stepCount = request.plan?.steps.length ?? 0;
              const outcomeCount = request.plan?.steps.filter((step) => step.outcome).length ?? 0;
              const delegationStatus = request.delegations[0]?.status ?? "-";

              return (
                <Link
                  key={request.id}
                  href={`/requests/${request.id}`}
                  className="grid grid-cols-12 gap-3 px-4 py-3 text-sm hover:bg-gray-900/60"
                >
                  <div className="col-span-2 text-gray-400">{formatDate(request.createdAt)}</div>
                  <div className="col-span-4">
                    <p className="font-medium text-gray-100">{request.title ?? "Untitled"}</p>
                    <p className="text-xs text-gray-400 line-clamp-2">{request.summary ?? request.rawInput}</p>
                  </div>
                  <div className="col-span-2 text-gray-300">{request.domain}</div>
                  <div className="col-span-2 text-gray-300">{request.status}</div>
                  <div className="col-span-2 text-xs text-gray-400 space-y-1">
                    <div>{request.plan ? `Plan: ${stepCount} steps` : "Plan: -"}</div>
                    <div>Auth: {delegationStatus}</div>
                    <div>Outcomes: {outcomeCount}</div>
                  </div>
                </Link>
              );
            })}
            {requests.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-400">No requests yet.</div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

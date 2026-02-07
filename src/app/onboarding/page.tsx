import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { getCurrentUser } from "@/lib/auth";

export default async function OnboardingPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <main className="min-h-screen bg-gray-950 text-gray-100 px-6 py-16">
        <div className="mx-auto max-w-2xl space-y-6">
          <header className="space-y-2">
            <h1 className="text-3xl font-semibold">Welcome to Clarify</h1>
            <p className="text-sm text-gray-400">Sign in to start your first request.</p>
          </header>

          <div className="rounded-lg border border-gray-800 bg-gray-900/40 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Step 1: Sign in</p>
                <p className="text-xs text-gray-400">Required to access your requests.</p>
              </div>
              <Link
                href="/login"
                className="rounded-md bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-white"
              >
                Sign in
              </Link>
            </div>
            <div className="text-xs text-gray-500">Steps 2 and 3 will unlock after signing in.</div>
          </div>
        </div>
      </main>
    );
  }

  const gmailAccount = await prisma.oAuthAccount.findFirst({
    where: { provider: "google", userId: user.id, refreshToken: { not: null } },
    select: { id: true },
  });

  const requestCount = await prisma.request.count({
    where: { userId: user.id },
  });

  const gmailConnected = !!gmailAccount;
  const hasRequest = requestCount > 0;

  if (gmailConnected && hasRequest) {
    redirect("/requests");
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 px-6 py-16">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">Get Started</h1>
          <p className="text-sm text-gray-400">Complete these steps to unlock the full flow.</p>
        </header>

        <div className="space-y-4 rounded-lg border border-gray-800 bg-gray-900/40 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Step 1: Signed in</p>
              <p className="text-xs text-gray-400">{user.email}</p>
            </div>
            <span className="rounded-full bg-green-900/60 px-3 py-1 text-xs text-green-200">
              Complete
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Step 2: Connect Gmail</p>
              <p className="text-xs text-gray-400">
                Needed to create drafts (nothing is sent automatically).
              </p>
            </div>
            {gmailConnected ? (
              <span className="rounded-full bg-green-900/60 px-3 py-1 text-xs text-green-200">
                Connected
              </span>
            ) : (
              <Link
                href="/api/auth/google"
                className="rounded-md border border-blue-700 px-4 py-2 text-sm text-blue-200 hover:border-blue-500"
              >
                Connect Gmail
              </Link>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Step 3: Create your first request</p>
              <p className="text-xs text-gray-400">Capture one real task to get a plan.</p>
            </div>
            {hasRequest ? (
              <span className="rounded-full bg-green-900/60 px-3 py-1 text-xs text-green-200">
                Complete
              </span>
            ) : (
              <Link
                href="/requests"
                className="rounded-md border border-gray-700 px-4 py-2 text-sm text-gray-100 hover:border-gray-500"
              >
                Go to Requests
              </Link>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

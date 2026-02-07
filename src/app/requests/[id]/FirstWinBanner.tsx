"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FirstWinBanner() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const markSeen = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users/first-win", { method: "POST" });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json?.error || "Failed to update");
      }
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-green-800 bg-green-900/20 p-4 text-sm text-green-100 space-y-2">
      <p className="font-semibold">First win unlocked.</p>
      <p className="text-green-100/80">
        Your draft is ready in Gmail. Open it, review the details, and send when you are ready.
      </p>
      {error && <p className="text-xs text-red-200">{error}</p>}
      <button
        className="rounded-md border border-green-600 px-3 py-1 text-xs text-green-100 hover:border-green-400 disabled:opacity-60"
        onClick={markSeen}
        disabled={loading}
      >
        {loading ? "Saving..." : "Got it"}
      </button>
    </div>
  );
}

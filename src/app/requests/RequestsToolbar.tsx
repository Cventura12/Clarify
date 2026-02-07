"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function RequestsToolbar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dueOnly = searchParams.get("filter") === "due";

  const setFilter = (next: "all" | "due") => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "due") params.set("filter", "due");
    else params.delete("filter");
    router.push(`/requests?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-2">
        <button
          className={`rounded-md border px-3 py-1 text-xs ${
            dueOnly ? "border-gray-700 text-gray-300" : "border-gray-500 text-gray-100"
          }`}
          onClick={() => setFilter("all")}
        >
          All
        </button>
        <button
          className={`rounded-md border px-3 py-1 text-xs ${
            dueOnly ? "border-blue-500 text-blue-200" : "border-gray-700 text-gray-400"
          }`}
          onClick={() => setFilter("due")}
        >
          Due
        </button>
      </div>
      <span className="text-xs text-gray-500">Scheduler runs automatically.</span>
    </div>
  );
}

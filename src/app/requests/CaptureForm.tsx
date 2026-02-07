"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CaptureForm() {
  const router = useRouter();
  const [rawInput, setRawInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const templates = [
    {
      label: "FAFSA follow-up",
      text: "Follow up on my FAFSA status and note any missing documents.",
    },
    {
      label: "Recommendation ask",
      text: "Draft a polite email asking my professor for a recommendation letter due next week.",
    },
    {
      label: "Housing portal check",
      text: "Check my apartment application portal and list what is still pending.",
    },
  ];

  const handleSubmit = async () => {
    if (!rawInput.trim()) {
      setError("Please enter a request.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput: rawInput.trim() }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Capture failed");
      }

      const requestId = json?.requestId as string | undefined;
      if (!requestId) throw new Error("Missing requestId");

      router.push(`/requests/${requestId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
      <h2 className="text-lg font-semibold">Capture</h2>
      <textarea
        className="min-h-[120px] w-full resize-none rounded-lg border border-gray-800 bg-gray-950/60 p-3 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-700"
        placeholder="Describe what you need to handle..."
        value={rawInput}
        onChange={(event) => setRawInput(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {templates.map((template) => (
          <button
            key={template.label}
            type="button"
            className="rounded-md border border-gray-800 bg-gray-900/60 px-3 py-1 text-xs text-gray-300 hover:border-gray-600"
            onClick={() => setRawInput(template.text)}
          >
            {template.label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <button
        className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? "Capturing..." : "Capture & Interpret"}
      </button>
    </div>
  );
}

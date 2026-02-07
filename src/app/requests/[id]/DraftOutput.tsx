"use client";

import { useState } from "react";

interface DraftOutputProps {
  subject: string;
  body: string;
  provider?: string | null;
  draftId?: string | null;
  threadId?: string | null;
  assumptions?: string[];
  needsUserInput?: string[];
}

export default function DraftOutput(props: DraftOutputProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = `Subject: ${props.subject}\n\n${props.body}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-3">
      {props.provider === "gmail" && props.draftId && (
        <div className="rounded-md border border-blue-800 bg-blue-950/40 p-3 text-xs text-blue-200">
          <p>Gmail draft created.</p>
          <p>Draft ID: {props.draftId}</p>
          {props.threadId && <p>Thread ID: {props.threadId}</p>}
          <button
            className="mt-2 rounded-md border border-blue-700 px-2 py-1 text-xs text-blue-100"
            disabled
          >
            Open in Gmail (placeholder)
          </button>
        </div>
      )}

      <div>
        <p className="text-xs uppercase tracking-wide text-gray-400">Subject</p>
        <p className="text-sm text-gray-200">{props.subject}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-400">Body</p>
        <pre className="whitespace-pre-wrap text-sm text-gray-300">{props.body}</pre>
      </div>

      {props.assumptions && (
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">Assumptions</p>
          <ul className="list-disc list-inside text-sm text-gray-300">
            {props.assumptions.length === 0 && <li>None</li>}
            {props.assumptions.map((item, index) => (
              <li key={`assumption-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {props.needsUserInput && (
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">Needs User Input</p>
          <ul className="list-disc list-inside text-sm text-gray-300">
            {props.needsUserInput.length === 0 && <li>None</li>}
            {props.needsUserInput.map((item, index) => (
              <li key={`needs-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        className="rounded-md border border-gray-700 px-3 py-1 text-xs text-gray-200 hover:border-gray-500"
        onClick={handleCopy}
      >
        {copied ? "Copied" : "Copy subject/body"}
      </button>
    </div>
  );
}
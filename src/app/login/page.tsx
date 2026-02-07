"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 px-6 py-16">
      <div className="mx-auto max-w-md space-y-6">
        <h1 className="text-3xl font-semibold">Clarify</h1>
        <p className="text-sm text-gray-400">Sign in to access your requests.</p>
        <button
          className="rounded-lg bg-gray-100 px-5 py-2 text-sm font-semibold text-gray-900 hover:bg-white"
          onClick={() => signIn("google")}
        >
          Sign in with Google
        </button>
      </div>
    </main>
  );
}
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const requiredEnv = [
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "DATABASE_URL",
  "DIRECT_URL",
] as const;

const assertAuthEnv = () => {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error("[auth][config] Missing required env vars:", missing);
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
};

assertAuthEnv();

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

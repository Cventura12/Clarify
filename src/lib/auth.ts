import { getServerSession } from "next-auth";
import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/db/client";

const safeLoggerMetadata = (metadata: unknown) => {
  if (!metadata || typeof metadata !== "object") return undefined;
  const meta = metadata as { name?: string; message?: string; stack?: string };
  return {
    name: meta.name,
    message: meta.message,
    stack: meta.stack,
  };
};

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: { strategy: "database" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account }) {
      console.info("[auth][signIn]", {
        provider: account?.provider ?? "unknown",
        userId: user?.id ?? null,
        email: user?.email ?? null,
      });
      return true;
    },
    async session({ session, user }) {
      if (session.user && user?.id) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  logger: {
    error(code, metadata) {
      console.error("[auth][error]", code, safeLoggerMetadata(metadata));
    },
    warn(code) {
      console.warn("[auth][warn]", code);
    },
    debug(code, metadata) {
      console.debug("[auth][debug]", code, safeLoggerMetadata(metadata));
    },
  },
};

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}
